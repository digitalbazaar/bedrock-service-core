/*!
 * Copyright (c) 2021-2025 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as brZCapStorage from '@bedrock/zcap-storage';
import * as database from '@bedrock/mongodb';
import assert from 'assert-plus';
import {ConfigRefresher} from './ConfigRefresher.js';
import {LruCache} from '@digitalbazaar/lru-memoize';
import {verifyRequestIp} from '../helpers.js';

const {util: {BedrockError}} = bedrock;

const USAGE_COUNTER_MAX_CONCURRENCY = 100;

export class ConfigStorage {
  /**
   * Creates a new ConfigStorage API for a particular service type.
   *
   * @param {object} options - The options to use.
   * @param {string} options.serviceType - The type of service.
   * @param {object} options.storageCost - The storage cost config.
   * @param {object} [options.cacheConfig] - The cache config.
   * @param {Function} [options.refreshHandler] - The refresh handler, if any.
   *
   * @returns {Promise<ConfigStorage>} A `ConfigStorage` instance.
   */
  constructor({serviceType, storageCost, cacheConfig, refreshHandler} = {}) {
    assert.string(serviceType, 'serviceType');
    assert.object(storageCost, 'storageCost');
    assert.optionalObject(cacheConfig, 'cacheConfig');
    assert.optionalFunc(refreshHandler, 'refreshHandler');
    if(!cacheConfig) {
      cacheConfig = bedrock.config['service-core'].cacheDefaults;
    }

    // coerce `maxSize` w/o `sizeCalculation` to `max`
    if(cacheConfig.maxSize !== undefined &&
      cacheConfig.sizeCalculation === undefined) {
      cacheConfig = {...cacheConfig, max: cacheConfig.maxSize};
      delete cacheConfig.maxSize;
    }

    // coerce `maxAge` to `ttl` in `cacheConfig`
    if(cacheConfig.maxAge !== undefined) {
      cacheConfig = {...cacheConfig, ttl: cacheConfig.maxAge};
      delete cacheConfig.maxAge;
    }

    const collectionName = `service-core-config-${serviceType}`;
    this.collectionName = collectionName;
    this.storageCost = storageCost;
    this.cache = new LruCache(cacheConfig);
    this.refresher = null;

    _createStorageInitializer({collectionName});

    // attach config refresher if `refreshHandler` is given
    if(refreshHandler) {
      this.refresher = new ConfigRefresher({
        configStorage: this, refreshHandler
      });
    }
  }

  /**
   * Establishes a new service object by inserting its configuration
   * into storage.
   *
   * @param {object} options - The options to use.
   * @param {object} options.config - The configuration.
   *
   * @returns {Promise<object>} The database record.
   */
  async insert({config} = {}) {
    assert.object(config, 'config');
    assert.string(config.id, 'config.id');
    assert.string(config.controller, 'config.controller');
    assert.string(config.meterId, 'config.meterId');

    // require starting sequence to be 0
    if(config.sequence !== 0) {
      throw new BedrockError('Configuration sequence must be "0".', {
        name: 'DataError',
        details: {
          public: true,
          httpStatusCode: 400
        }
      });
    }

    // insert the configuration and return the updated record
    const now = Date.now();
    const meta = {created: now, updated: now, refresh: _createDefaultRefresh()};
    const record = {meta, config};
    try {
      const collection = this._getCollection();
      await collection.insertOne(record);
      return record;
    } catch(cause) {
      if(!database.isDuplicateError(cause)) {
        throw cause;
      }
      throw new BedrockError('Duplicate configuration.', {
        name: 'DuplicateError',
        details: {public: true, httpStatusCode: 409},
        cause
      });
    }
  }

  /**
   * Retrieves all service object configs matching the given query.
   *
   * @param {object} options - The options to use.
   * @param {string} options.controller - The controller for the configs to
   *   retrieve.
   * @param {object} options.req - A request to check against an IP allow list.
   * @param {object} [options.query={}] - The optional query to use.
   * @param {object} [options.options={}] - Query options (eg: 'sort', 'limit').
   * @param {boolean} [options.explain=false] - An optional explain boolean.
   *
   * @returns {Promise<Array> | ExplainObject} The records that matched the
   *   query or an ExplainObject if `explain=true`.
   */
  async find({
    controller, req, query = {}, options = {}, explain = false
  } = {}) {
    // force controller ID
    query['config.controller'] = controller;
    const collection = this._getCollection();
    const cursor = await collection.find(query, options);

    if(explain) {
      return cursor.explain('executionStats');
    }

    const records = await cursor.toArray();
    if(!req) {
      return records;
    }

    // since `req` is given, omit any records for which the IP is not allowed
    return records.filter(({config}) => {
      const {verified} = verifyRequestIp({config, req});
      return verified;
    });
  }

  /**
   * Updates a service object config if its sequence number is next.
   *
   * @param {object} options - The options to use.
   * @param {object} options.config - The configuration.
   * @param {object} options.refresh - The refresh options to set, if any.
   * @param {boolean} [options.explain=false] - An optional explain boolean.
   *
   * @returns {Promise<object> | ExplainObject} The database record or an
   *   ExplainObject if `explain=true`.
   */
  async update({config, refresh, explain = false} = {}) {
    assert.object(config, 'config');
    assert.string(config.id, 'config.id');
    assert.number(config.sequence, config.sequence);
    assert.string(config.controller, 'config.controller');
    assert.optionalObject(refresh, 'refresh');
    if(refresh) {
      assert.boolean(refresh.enabled, 'refresh.enabled');
      assert.number(refresh.after, 'refresh.after');
    } else {
      refresh = _createDefaultRefresh();
    }

    // insert the configuration and get the updated record
    const now = Date.now();

    const collection = this._getCollection();
    const query = {
      'config.id': config.id,
      'config.sequence': config.sequence - 1
    };

    if(explain) {
      // 'find().limit(1)' is used here because 'updateOne()' doesn't return a
      // cursor which allows the use of the explain function
      const cursor = await collection.find(query).limit(1);
      return cursor.explain('executionStats');
    }

    const $set = {config, 'meta.updated': now, 'meta.refresh': refresh};
    const result = await collection.updateOne(query, {$set});
    if(result.modifiedCount === 0) {
      // no records changed...
      throw new BedrockError(
        'Could not update configuration. ' +
        'Record sequence does not match or configuration does not exist.', {
          name: 'InvalidStateError',
          details: {httpStatusCode: 409, public: true}
        });
    }

    // clear cache
    this.cache.delete(config.id);

    return true;
  }

  /**
   * Gets a service object configuration. If a request (`req`) is passed,
   * an IP allow list check will be performed.
   *
   * @param {object} options - The options to use.
   * @param {string} options.id - The ID of the service object.
   * @param {object} options.req - A request to check against an IP allow list.
   * @param {boolean} [options.explain=false] - An optional explain boolean.
   *
   * @returns {Promise<object> | ExplainObject} The data base record or an
   *   ExplainObject if `explain=true`.
   */
  async get({id, req, explain = false} = {}) {
    assert.string(id, 'id');

    // skip cache if `explain=true`
    if(explain) {
      return this._getUncachedRecord({id, explain});
    }

    const fn = () => this._getUncachedRecord({id});
    const record = await this.cache.memoize({key: id, fn});

    if(req) {
      // verify that request is from an IP that is allowed to access the config
      const {verified} = verifyRequestIp({config: record.config, req});
      if(!verified) {
        throw new BedrockError('Permission denied. Source IP is not allowed.', {
          name: 'NotAllowedError',
          details: {
            httpStatusCode: 403,
            public: true,
          }
        });
      }
    }

    return record;
  }

  /**
   * Gets storage statistics for the given meter. This includes the total
   * number of service objects associated with a meter ID, represented as
   * storage units according to the service's `storageCost` configuration.
   *
   * An optional `addUsage({config, storageCost, usage})` function can be
   * passed to add service-specific usage information based on the given
   * config. This function can add `storage` or `operations` to the passed
   * `usage` object. The function will be called per configuration found to
   * be associated with the given `meterId`.
   *
   * @param {object} options - The options to use.
   * @param {string} options.meterId - The ID of the meter to get.
   * @param {Function} options.addUsage - A function for adding custom usage
   *   based on a config instance.
   * @param {AbortSignal} [options.signal] - An abort signal to check.
   *
   * @returns {Promise<object>} The storage usage for the meter.
   */
  async getUsage({meterId, signal, addUsage} = {}) {
    // find all configs with the given meter ID
    const cursor = await this._getCollection().find(
      {'config.meterId': meterId},
      {projection: {_id: 0, config: 1}});
    const {storageCost} = this;
    const usage = {storage: 0, operations: 0};
    let counters = [];
    while(await cursor.hasNext()) {
      // get next service object config
      const {config} = await cursor.next();

      // add storage units for service object config
      usage.storage += storageCost.config;

      // add zcap revocation storage
      counters.push(_addRevocationUsage({id: config.id, storageCost, usage}));
      // queue any custom usage aggregator
      if(addUsage) {
        counters.push(addUsage({config, storageCost, usage}));
      }

      // await counters if max concurrency reached
      if(counters.length === USAGE_COUNTER_MAX_CONCURRENCY) {
        await Promise.all(counters);
        counters = [];
      }

      if(signal && signal.abort) {
        throw new BedrockError('Computing metered storage aborted.', {
          name: 'AbortError',
          details: {meterId, httpStatusCode: 503, public: true}
        });
      }
    }

    // await any counters that didn't complete
    await Promise.all(counters);

    return usage;
  }

  _getCollection() {
    return database.collections[this.collectionName];
  }

  async _getUncachedRecord({id, explain = false}) {
    const collection = this._getCollection();
    const query = {'config.id': id};
    const projection = {_id: 0, config: 1, meta: 1};

    if(explain) {
      // 'find().limit(1)' is used here because 'updateOne()' doesn't return a
      // cursor which allows the use of the explain function
      const cursor = await collection.find(query, {projection}).limit(1);
      return cursor.explain('executionStats');
    }

    const record = await collection.findOne(query, {projection});
    if(!record) {
      throw new BedrockError('Configuration not found.', {
        name: 'NotFoundError',
        details: {configId: id, httpStatusCode: 404, public: true}
      });
    }
    return record;
  }
}

async function _addRevocationUsage({id, storageCost, usage}) {
  // add storage units for revocations associated with the config
  const {count} = await brZCapStorage.revocations.count(
    {rootTarget: id});
  usage.storage += count * storageCost.revocation;
}

function _createStorageInitializer({collectionName} = {}) {
  bedrock.events.on('bedrock-mongodb.ready', async () => {
    await database.openCollections([collectionName]);

    await database.createIndexes([{
      // cover queries config by ID
      collection: collectionName,
      fields: {'config.id': 1},
      options: {unique: true}
    }, {
      // cover config queries by controller
      collection: collectionName,
      fields: {'config.controller': 1},
      options: {unique: false}
    }, {
      // cover counting configs in use by meter ID, if present
      collection: collectionName,
      fields: {'config.meterId': 1},
      options: {
        partialFilterExpression: {
          'config.meterId': {$exists: true}
        },
        unique: false
      }
    }, {
      // refresh index
      collection: collectionName,
      fields: {
        'meta.refresh.enabled': 1,
        'meta.refresh.after': 1
      },
      options: {
        partialFilterExpression: {
          'meta.refresh.enabled': {$exists: true}
        },
        unique: false
      }
    }]);
  });
}

function _createDefaultRefresh() {
  return {enabled: true, after: 0};
}

/**
 * An object containing information on the query plan.
 *
 * @typedef {object} ExplainObject
 */

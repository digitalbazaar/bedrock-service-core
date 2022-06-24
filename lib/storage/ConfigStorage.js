/*!
 * Copyright (c) 2021-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as brZCapStorage from '@bedrock/zcap-storage';
import * as database from '@bedrock/mongodb';
import assert from 'assert-plus';
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
   * @param {object} options.cacheConfig - The cache config.
   *
   * @returns {Promise<ConfigStorage>} A `ConfigStorage` instance.
   */
  constructor({serviceType, storageCost, cacheConfig} = {}) {
    assert.string(serviceType, 'serviceType');
    assert.object(storageCost, 'storageCost');
    assert.optionalObject(cacheConfig, 'cacheConfig');
    if(!cacheConfig) {
      cacheConfig = bedrock.config['service-core'].cacheDefaults;
    }

    const collectionName = `service-core-config-${serviceType}`;
    this.collectionName = collectionName;
    this.storageCost = storageCost;
    this.cache = new LruCache(cacheConfig);

    _createStorageInitializer({collectionName});
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
      throw new BedrockError(
        'Configuration sequence must be "0".',
        'DataError', {
          public: true,
          httpStatusCode: 400
        });
    }

    // insert the configuration and get the updated record
    const now = Date.now();
    const meta = {created: now, updated: now};
    const record = {meta, config};
    try {
      const collection = this._getCollection();
      const result = await collection.insertOne(record);
      return result.ops[0];
    } catch(e) {
      if(!database.isDuplicateError(e)) {
        throw e;
      }
      throw new BedrockError(
        'Duplicate configuration.',
        'DuplicateError', {
          public: true,
          httpStatusCode: 409
        }, e);
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
   * @param {boolean} [options.explain=false] - An optional explain boolean.
   *
   * @returns {Promise<object> | ExplainObject} The database record or an
   *   ExplainObject if `explain=true`.
   */
  async update({config, explain = false} = {}) {
    assert.object(config, 'config');
    assert.string(config.id, 'config.id');
    assert.number(config.sequence, config.sequence);
    assert.string(config.controller, 'config.controller');

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

    const result = await collection.updateOne(
      query, {$set: {config, 'meta.updated': now}});

    if(result.result.n === 0) {
      // no records changed...
      throw new BedrockError(
        'Could not update configuration. ' +
        'Record sequence does not match or configuration does not exist.',
        'InvalidStateError', {httpStatusCode: 409, public: true});
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
        throw new BedrockError(
          'Permission denied. Source IP is not allowed.', 'NotAllowedError', {
            httpStatusCode: 403,
            public: true,
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
   * @param {object} options - The options to use.
   * @param {string} options.meterId - The ID of the meter to get.
   * @param {AbortSignal} [options.signal] - An abort signal to check.
   *
   * @returns {Promise<object>} The storage usage for the meter.
   */
  async getUsage({meterId, signal} = {}) {
    // find all configs with the given meter ID
    const cursor = await this._getCollection().find(
      {'config.meterId': meterId},
      {projection: {_id: 0, config: 1}});
    const {storageCost} = this;
    const usage = {storage: 0};
    let counters = [];
    while(await cursor.hasNext()) {
      // get next service object config
      const {config} = await cursor.next();

      // add storage units for service object config
      usage.storage += storageCost.config;

      // add zcap revocation storage
      counters.push(_addRevocationUsage({id: config.id, storageCost, usage}));

      // await counters if max concurrency reached
      if(counters.length === USAGE_COUNTER_MAX_CONCURRENCY) {
        await Promise.all(counters);
        counters = [];
      }

      if(signal && signal.abort) {
        throw new BedrockError(
          'Computing metered storage aborted.',
          'AbortError',
          {meterId, httpStatusCode: 503, public: true});
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
      throw new BedrockError(
        'Configuration not found.',
        'NotFoundError',
        {configId: id, httpStatusCode: 404, public: true});
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
      options: {unique: true, background: false}
    }, {
      // cover config queries by controller
      collection: collectionName,
      fields: {'config.controller': 1},
      options: {unique: false, background: false}
    }, {
      // cover counting configs in use by meter ID, if present
      collection: collectionName,
      fields: {'config.meterId': 1},
      options: {
        partialFilterExpression: {
          'config.meterId': {$exists: true}
        },
        unique: false, background: false
      }
    }]);
  });
}

/**
 * An object containing information on the query plan.
 *
 * @typedef {object} ExplainObject
 */

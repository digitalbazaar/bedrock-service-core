/*!
 * Copyright (c) 2021-2025 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as configs from './http/configs.js';
import * as metering from './http/metering.js';
import * as middleware from './http/middleware.js';
import * as revocations from './http/revocations.js';
import * as schemas from '../schemas/bedrock-service-core.js';
import assert from 'assert-plus';
import {ConfigStorage} from './storage/ConfigStorage.js';
import {meters} from '@bedrock/meter-usage-reporter';
import '@bedrock/express';
import '@bedrock/mongodb';

// load config defaults
import './config.js';

// ensure oauth2 cache gets configured on startup
import './oauth2.js';

// export reusable metering helpers, middleware, and schemas
export {metering, middleware, schemas};

/* Note: This state is for tracking whether `createService` has been called too
late. It should be called during `bedrock.init` to ensure that route and
storage can be configured during the bedrock lifecycle. If routing and storage
for any service are not initialized before `bedrock.start`, an error will be
thrown. Tracking this produces helpful errors to developers that they
have accidentally misused the `createService` API. */
let services = new Map();
bedrock.events.on('bedrock.start', () => {
  // if any service is not initialized by now, it is too late
  if([...services.values()].some(s => !s._isInitialized())) {
    throw new Error(
      '"createService" must be called no later than the "bedrock.init" event.');
  }
  // clear services, initialization period has passed and this signals
  // that any future `createService` calls are too late
  services = null;
});

/**
 * Creates a new service. Only one service of each `serviceType` may be
 * created. This function MUST be called no later than `bedrock.init` in the
 * bedrock lifecycle.
 *
 * @param {object} options - The options to use.
 * @param {string} options.serviceType - The type of service.
 * @param {string} options.routePrefix - The route prefix for accessing the
 *   service's HTTP API.
 * @param {object} options.storageCost - A configuration object that includes
 *   the cost of storage for resources, operations, and zcap revocations.
 * @param {object} [options.cacheConfig] - The configuration cache config.
 * @param {Function} [options.usageAggregator] - The function to use to
 *   aggregate meter usage.
 * @param {ValidationOptions} [options.validation] - Custom validation schemas.
 *
 * @returns {Promise<object>} An object with service information and APIs.
 */
export async function createService({
  serviceType, routePrefix, storageCost,
  cacheConfig, usageAggregator,
  validation: {
    createConfigBody = schemas.createConfigBody,
    updateConfigBody = schemas.updateConfigBody,
    getConfigsQuery = schemas.getConfigsQuery,
    validateConfigFn,
    zcapReferenceIds
  } = {
    createConfigBody: schemas.createConfigBody,
    updateConfigBody: schemas.updateConfigBody,
    getConfigsQuery: schemas.getConfigsQuery
  }
} = {}) {
  if(!services) {
    // `createService` called too late for the service to be initialized
    throw new Error(
      '"createService" must be called no later than the "bedrock.init" event.');
  }
  // only one service per `serviceType` is permitted
  if(services.has(serviceType)) {
    throw new Error(`Only one "${serviceType}" service may be created.`);
  }
  assert.optionalFunc(validateConfigFn, 'validation.validateConfigFn');

  // create storage for service object configs
  const configStorage = new ConfigStorage(
    {serviceType, storageCost, cacheConfig});

  // if zcap reference IDs were given, assert and add validation rules
  if(zcapReferenceIds !== undefined) {
    assert.array(zcapReferenceIds, 'zcapReferenceIds');
    zcapReferenceIds.every((e, i) => {
      assert.object(e, `zcapReferenceIds[${i}]`);
      assert.string(e.referenceId, `zcapReferenceIds[${i}].referenceId`);
      assert.bool(e.required, `zcapReferenceIds[${i}].required`);
    });

    // create `zcaps` schema specific to service
    let anyRequired = false;
    const zcaps = structuredClone(schemas.zcaps);
    for(const {referenceId, required} of zcapReferenceIds) {
      zcaps.properties[referenceId] = schemas.delegatedZcap;
      if(required) {
        anyRequired = true;
      }
    }

    // add `zcaps` as a required property to configs
    createConfigBody = structuredClone(createConfigBody);
    updateConfigBody = structuredClone(updateConfigBody);
    const schemasToUpdate = [createConfigBody, updateConfigBody];
    for(const schema of schemasToUpdate) {
      if(anyRequired) {
        schema.required.push('zcaps');
      }
      if(!schema.properties.zcaps) {
        schema.properties.zcaps = zcaps;
      } else {
        // merge reference IDs into existing `zcaps` schema
        schema.properties.zcaps = {
          ...schema.properties.zcaps,
          properties: {
            ...zcaps.properties,
            ...schema.properties.zcaps.properties,
          }
        };
      }
    }
  }

  const service = {
    configStorage,
    serviceType,
    routePrefix,
    storageCost,
    usageAggregator,
    validation: {
      createConfigBody, updateConfigBody, getConfigsQuery, validateConfigFn
    },
    _routesInitialized: false,
    _storageInitialized: false,
    _isInitialized() {
      return service._routesInitialized && service._storageInitialized;
    }
  };

  // create default aggregator
  if(!usageAggregator) {
    usageAggregator = async ({meter, signal}) =>
      _aggregateUsage({meter, signal, service});
  }
  meters.setAggregator({serviceType, handler: usageAggregator});

  // track when routes and storage should have been initialized; if they
  // haven't been initialized before `bedrock.start` then `createService` was
  // called too late
  bedrock.events.on('bedrock-express.configure.routes', app => {
    // add event handlers for all services
    configs.addRoutes({app, service});
    revocations.addRoutes({app, service});

    service._routesInitialized = true;
  });
  bedrock.events.on('bedrock-mongodb.ready', () => {
    service._storageInitialized = true;
  });

  return service;
}

async function _aggregateUsage({meter, signal, service} = {}) {
  const {id: meterId} = meter;
  return service.configStorage.getUsage({meterId, signal});
}

/**
 * @typedef ValidationOptions
 *
 * @property {object} [createConfigBody] - Custom JSON
 *   schema for creating a service object configuration.
 * @property {object} [updateConfigBody] - Custom JSON
 *   schema for updating a service object configuration.
 * @property {object} [getConfigsQuery] - Custom JSON schema
 *   for getting a service object configuration.
 * @property {object} [validateConfigFn] - Custom function to call after
 *   JSON schema validation has run; it may throw to reject a bad configuration
 *   for any custom reason.
 * @property {Array} [zcapReferenceIds] - An array of
 *   `{referenceId, required}` elements describing any expected zcap
 *   reference IDs and whether they must be present in configs.
 */

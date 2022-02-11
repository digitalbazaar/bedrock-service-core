/*!
 * Copyright (c) 2021-2022 Digital Bazaar, Inc. All rights reserved.
 */
import 'bedrock-express';
import 'bedrock-mongodb';
import * as configs from './http/configs.js';
import * as revocations from './http/revocations.js';
import bedrock from 'bedrock';
import {ConfigStorage} from './storage/ConfigStorage.js';
import meters from 'bedrock-meter-usage-reporter';
import {
  postConfigBody as _postConfigBody,
  getConfigsQuery as _getConfigsQuery
} from '../schemas/bedrock-service-core.js';

// load config defaults
import './config.js';

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
 * @param {function} [options.usageAggregator] - The function to use to
 *   aggregate meter usage.
 * @param {object} [options.validation] - Custom validation schemas.
 * @param {object} [options.validation.postConfigBody] - Custom JSON schema
 *   for posting a service object configuration.
 * @param {object} [options.validation.getConfigsQuery] - Custom JSON schema
 *   for getting a service object configuration.
 *
 * @returns {Promise<object>} An object with service information and APIs.
 */
export async function createService({
  serviceType, routePrefix, storageCost, usageAggregator,
  validation: {
    postConfigBody = _postConfigBody,
    getConfigsQuery = _getConfigsQuery
  } = {postConfigBody: _postConfigBody, getConfigsQuery: _getConfigsQuery}
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

  // create storage for service object configs
  const configStorage = new ConfigStorage({serviceType});

  const service = {
    configStorage,
    serviceType,
    routePrefix,
    storageCost,
    usageAggregator,
    validation: {postConfigBody, getConfigsQuery},
    _routesInitialized: false,
    _storageInitialized: false,
    _isInitialized() {
      return service._routesInitialized && service._storageInitialized;
    }
  };

  // create default aggregator
  if(!usageAggregator) {
    usageAggregator = async (meter, signal) =>
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
}

async function _aggregateUsage({meter, signal, service} = {}) {
  const {id: meterId} = meter;
  return service.configStorage.getUsage({meterId, signal});
}

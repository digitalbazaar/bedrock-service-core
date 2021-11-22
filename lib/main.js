/*!
 * Copyright (c) 2021 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from 'bedrock';
import 'bedrock-express';
import 'bedrock-mongodb';
import * as helpers from './helpers.js';
import meters from 'bedrock-meter-usage-reporter';
import * as instances from './http/instances.js';
import {
  postConfigBody, getConfigsQuery
} from '../../schemas/bedrock-service-object';
import * as revocations from './http/revocations.js';

import './config.js';

const {config} = bedrock;

/* Note: This state is for tracking whether `createService` has been called too
late. It must be called no later than `bedrock.init` to ensure that route and
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
    postConfigBody = postConfigBody,
    getConfigsQuery = getConfigsQuery
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

  // create storage for service objects
  // FIXME: use `serviceType` as suffix for collection name
  const storage = {};

  const service = {
    serviceType,
    routePrefix,
    storage,
    storageCost,
    usageAggregator,
    validation: {postConfigBody, getConfigsQuery},
    _routesInitialized: false,
    _storageInitialized: false,
    _isInitialized() {
      return service._routesInitialized && service._storageInitialized;
    }
  };

  // add event handlers for all services
  instances.addRoutes({app, service});
  revocations.addRoutes({app, service});

  // create default aggregator
  if(!usageAggregator) {
    usageAggregator = async (meter, signal) =>
      _aggregateUsage({meter, signal, storageCost});
  }
  meters.setAggregator({serviceType, handler: usageAggregator});

  // track when routes and storage should have been initialized; these handlers
  // will run after those created above -- and if they don't run before
  // `bedrock.start` then `createService` was called too late
  bedrock.events.on('bedrock-express.configure.routes', () => {
    service._routesInitialized = true;
  });
  bedrock.events.on('bedrock-mongodb.ready', () => {
    service._storageInitialized = true;
  });
};

// FIXME: will aggregating usage only involve operations not storage, which
// is externalized (and metered elsewhere)?

async function _aggregateUsage({/*meter, signal,*/ storageCost} = {}) {
  //const {id: meterId} = meter;
  const [usage, revocationCount] = await Promise.all([
    // FIXME: implement `instances.getCount({collectionName, meterId})`???
    // FIXME: implement `storage.getUsage()`
    //storage.getStorageUsage({meterId, signal}),
    {storage: 0},
    // FIXME: get zcap revocation count associated with this meter
    // https://github.com/digitalbazaar/bedrock-kms-http/issues/55
    0
  ]);

  // add revocation storage
  usage.storage += revocationCount * storageCost.revocation;

  return usage;
}

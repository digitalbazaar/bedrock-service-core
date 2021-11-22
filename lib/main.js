/*!
 * Copyright (c) 2021 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from 'bedrock';
import 'bedrock-express';
import 'bedrock-mongodb';
import * as helpers from './helpers.js';
import meters from 'bedrock-meter-usage-reporter';
import * as instances from './http/instances.js';
import * as revocations from './http/revocations.js';

import './config.js';

const {config} = bedrock;

/* Note: This state is for tracking whether `createService` has been called too
late. It must be called no later than during `bedrock.init` and before
`bedrock.start`. Tracking this produces helpful errors to developers that they
have accidentally misused the `createService` API. */
let services = new Map();
let bedrockInitEmitted = false;

bedrock.events.on('bedrock-express.configure.routes', app => {
  // configure routes for all created services
  await Promise.all([...services.values()].map(s => {
    // add event handlers for all services
    const {routePrefix, storageCost} = s;
    instances.addRoutes({app, routePrefix, storageCost});
    revocations.addRoutes({app, routePrefix, storageCost});
  }));
});

bedrock.events.on('bedrock-mongodb.ready', async () => {
  // configure storage for all created services
  // FIXME: init storage

  // FIXME: could add event handlers for routes and database for every
  // service ... and check to see if all services were initialized when
  // we get to `bedrock.start`?
});

bedrock.events.on('bedrock.start', () => {
  // set meter aggregator for all services
  for(const {serviceType, usageAggregator: handler} of services.values()) {
    meters.setAggregator({serviceType, handler});
  }
});

bedrock.events.on('bedrock.init', () => {
  bedrockInitEmitted = true;
  // ensure all services have been initialized
  Promise.all(services.values().map(s => s._init()));
});
bedrock.events.on('bedrock.start', () => {
  // if any service is not initialized by now, it is too late
  if([...services.values()].some(s => !s._initialized)) {
    throw new Error(
      '"createService" must be called no later than the "bedrock.init" event.');
  }
  // clear services, initialization period is finished
  services = null;
});

// FIXME: document this function; it handles both route setup for service
// objects and the handler for meter aggregation
// FIXME: move this function out of `http.js` to top level
// FIXME: enable storage to be passed in here? maybe just accept storage
// `collectionName` for instances here? ... will probably want to enable
// getting storage API instance independently of service init() ... or
// this should just return it and rename this to `createService` and it
// returns `{instances}` or `{storage}` or similar
export async function createService({
  serviceType, routePrefix, storageCost, usageAggregator
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
  // FIXME:
  const storage = {};

  const service = {
    serviceType,
    routePrefix,
    storageCost,
    usageAggregator,
    storage,
    _routesInitialized: false,
    _storageInitialized: false,
    _initialized() {
      return service._routesInitialized && service._storageInitialized;
    }
  };

  // add event handlers for all services
  instances.addRoutes({app, routePrefix, storageCost});
  revocations.addRoutes({app, routePrefix, storageCost});

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

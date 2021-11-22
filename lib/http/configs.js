/*!
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
import {asyncHandler} from 'bedrock-express';
import {authorizeZcapInvocation} from './authz.js';
import cors from 'cors';
import * as helpers from './helpers.js';
import {meters} from 'bedrock-meter-usage-reporter';
import {validate} from '../validator.js';

export function addRoutes({app, service}) {
  const {routePrefix, serviceType, storage, storageCost, validation} = service;
  const {postConfigBody, getConfigsQuery} = validation;

  // Note: config routes are fixed off of the route prefix
  const routes = {
    configs: routePrefix,
    config: `${routePrefix}/:id`
  };
  const {baseUri} = config.server;
  const serviceObjectRoot = `${baseUri}${routes.configs}`;

  /* Note: CORS is used on all endpoints. This is safe because authorization
  uses HTTP signatures + capabilities, not cookies; CSRF is not possible. */

  // create a new service object
  app.options(routes.configs, cors());
  app.post(
    routes.configs,
    cors(),
    validate({bodySchema: postConfigBody}),
    // meter must be checked for available usage and to obtain the meter's
    // controller prior to checking the zcap invocation (as the invocation
    // will use the meter's controller as the root controller for service
    // object creation)
    asyncHandler(async (req, res, next) => {
      const {body: {meterId}} = req;
      // FIXME: needs adjustment
      // FIXME: do we need to allow for storage cost to be externalized
      // here, i.e., only ops have a cost here? or will all services that
      // use this lib need this?
      const {meter, hasAvailable} = await meters.hasAvailable({
        id: meterId, serviceType, resources: {storage: storageCost.resource}
      });
      // store meter information on `req` and call next middleware
      req.meterCheck = {meter, hasAvailable};
      // call `next` on the next tick to ensure the promise from this function
      // resolves and does not reject because some subsequent middleware throws
      // an error
      process.nextTick(next);
    }),
    // now that the meter information has been obtained, check zcap invocation
    authorizeZcapInvocation({
      async getExpectedTarget() {
        // use root service object endpoint as expected target; controller will
        // be dynamically set according to the meter referenced by the meter
        // capability
        return {expectedTarget: serviceObjectRoot};
      },
      async getRootController({req, rootInvocationTarget}) {
        if(rootInvocationTarget !== serviceObjectRoot) {
          throw new BedrockError(
            'The request URL does not match the root invocation target. ' +
            'Ensure that the capability is for the root service object ' +
            'endpoint.',
            'URLMismatchError', {
              // this error will be a `cause` in the onError handler;
              // this httpStatusCode is not operative
              httpStatusCode: 400,
              public: true,
              rootInvocationTarget,
              serviceObjectRoot
            });
        }
        // use meter's controller as the root controller for the service
        // object creation endpoint
        return req.meterCheck.meter.controller;
      }
    }),
    asyncHandler(async (req, res) => {
      const {body: {meterId}, meterCheck: {hasAvailable}} = req;
      if(!hasAvailable) {
        // insufficient remaining storage
        throw new BedrockError('Permission denied.', 'NotAllowedError', {
          httpStatusCode: 403,
          public: true,
        });
      }

      // FIXME: this is a high-latency call -- consider adding the meter
      // in parallel with inserting the service object config, optimistically
      // presuming it will be added; we could decide that the case of a
      // missing/invalid meter is a possible state we have to deal in other
      // cases anyway

      // add meter
      await meters.upsert({id: meterId, serviceType});

      // do not allow client to choose service object ID
      delete req.body.id;
      const id = helpers.getId(
        {localId: await helpers.generateRandom()});
      const config = {id, ...req.body};

      // insert config to create a service object for the controller
      const record = await service.configStorage.insert({config});
      res.status(201).location(id).json(record.config);
    }));

  // get configs by query
  app.get(
    routes.configs,
    cors(),
    validate({querySchema: getConfigsQuery}),
    authorizeZcapInvocation({
      async getExpectedTarget() {
        // expected target is the base URL
        return {expectedTarget: serviceObjectRoot};
      },
      // root controller is the submitted `controller` -- queries may only
      // happen on a per-controller basis
      async getRootController({req, rootInvocationTarget}) {
        if(rootInvocationTarget === serviceObjectRoot) {
          return req.query.controller;
        }
        throw new Error(
          `Invalid root invocation target "${rootInvocationTarget}".`);
      }
    }),
    asyncHandler(async (req, res) => {
      const {controller} = req.query;
      const results = await service.configStorage.find({
        controller, req, options: {projection: {_id: 0, config: 1}}
      });
      res.json(results.map(r => r.config));
    }));

  // update a service object config
  app.options(routes.config, cors());
  app.post(
    routes.config,
    validate({bodySchema: postConfigBody}),
    // FIXME: if a new meter is sent, set the root controller to be that of
    // the meter; otherwise set it to be that of the config
    authorizeZcapInvocation({
      getExpectedTarget: _getExpectedConfigTarget
    }),
    asyncHandler(async (req, res) => {
      const id = helpers.getId({localId: req.params.id});
      const config = req.body;
      if(id !== config.id) {
        throw new BedrockError(
          'Configuration "id" does not match.',
          'DataError', {
            httpStatusCode: 400,
            public: true,
            expected: id,
            actual: config.id
          });
      }

      const {configStorage} = service;
      const {config: existingConfig} = await configStorage.get({id, req});

      // add meter if a new one was given
      let {meterId} = config;
      if(meterId && meterId !== existingConfig.meterId) {
        // FIXME: only enable once root controller FIXME is addressed above
        // for the case where a new meter is sent
        throw new Error('Not implemented; meter cannot be changed.');
        await meters.upsert({id: meterId, serviceType});
      } else {
        ({meterId} = existingConfig);
      }

      // ensure `meterId` is set on config (using either existing one or new
      // one)
      config.meterId = meterId;

      await configStorage.update({config});
      res.json(config);

      // meter operation usage
      helpers.reportOperationUsageWithoutWaiting({id});
    }));

  // get a service object config
  app.get(
    routes.config,
    cors(),
    authorizeZcapInvocation({
      async getExpectedTarget({req}) {
        // expected target is the service object itself
        const id = helpers.getId({localId: req.params.id});
        return {expectedTarget: id};
      }
    }),
    asyncHandler(async (req, res) => {
      const id = helpers.getId({localId: req.params.id});
      const {config} = await service.configStorage.get({id, req});
      res.json(config);

      // meter operation usage
      helpers.reportOperationUsageWithoutWaiting({id});
    }));
}

async function _getExpectedConfigTarget({req}) {
  // ensure the `configId` matches the request URL (i.e., that the caller
  // POSTed a config with an ID that matches up with the URL to which they
  // POSTed); this is not a security issue if this check is not performed,
  // however, it can help clients debug errors on their end
  const {body: {id: configId}} = req;
  const requestUrl = `${req.protocol}://${req.get('host')}${req.url}`;
  if(configId !== requestUrl) {
    throw new BedrockError(
      'The request URL does not match the configuration ID.',
      'URLMismatchError', {
        // this error will be a `cause` in the onError handler;
        // this httpStatusCode is not operative
        httpStatusCode: 400,
        public: true,
        configId,
        requestUrl,
      });
  }
  return {expectedTarget: configId};
}

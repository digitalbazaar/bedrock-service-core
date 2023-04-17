/*!
 * Copyright (c) 2018-2023 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as middleware from './middleware.js';
import {generateRandom, getId} from '../helpers.js';
import {asyncHandler} from '@bedrock/express';
import cors from 'cors';
import {meters} from '@bedrock/meter-usage-reporter';
import {reportOperationUsage} from './metering.js';
import {createValidateMiddleware as validate} from '@bedrock/validation';

const {util: {BedrockError}} = bedrock;

export function addRoutes({app, service}) {
  const {
    configStorage, routePrefix, serviceType, storageCost, validation
  } = service;
  const {
    createConfigBody, updateConfigBody, getConfigsQuery, validateConfigFn
  } = validation;

  // Note: config routes are fixed off of the route prefix
  const routes = {
    configs: routePrefix,
    config: `${routePrefix}/:localId`
  };
  const {baseUri} = bedrock.config.server;
  const serviceObjectRoot = `${baseUri}${routes.configs}`;

  const getConfigMiddleware = middleware.createGetConfigMiddleware({service});

  /* Note: CORS is used on all endpoints. This is safe because authorization
  uses HTTP signatures + capabilities, not cookies; CSRF is not possible. */

  // create a new service object
  app.options(routes.configs, cors());
  app.post(
    routes.configs,
    cors(),
    validate({bodySchema: createConfigBody}),
    // meter must be checked for available usage and to obtain the meter's
    // controller prior to checking the zcap invocation (as the invocation
    // will use the meter's controller as the root controller for service
    // object creation)
    asyncHandler(async (req, res, next) => {
      const {body: {meterId}} = req;
      const {meter, hasAvailable} = await meters.hasAvailable({
        id: meterId, serviceType, resources: {storage: storageCost.resource}
      });
      // store meter information on `req` and call next middleware
      req.meterCheck = {meter, hasAvailable};
      next();
    }),
    // now that the meter information has been obtained, check zcap invocation
    middleware.authorizeZcapInvocation({
      async getExpectedValues() {
        return {
          host: bedrock.config.server.host,
          // expect root invocation target to match this route; the root zcap
          // will have its controller dynamically set to the controller of the
          // meter used as below in `getRootController`
          rootInvocationTarget: serviceObjectRoot
        };
      },
      async getRootController({req}) {
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

      // do not allow client to choose service object ID
      delete req.body.id;
      const id = getId({routePrefix, localId: await generateRandom()});
      const config = {id, ...req.body};

      // run custom validate config function, if any
      if(validateConfigFn) {
        const {valid, error} = await validateConfigFn({config, op: 'create'});
        if(!valid) {
          throw new BedrockError(
            'ConfigFn validation failed.', 'ValidationError', {
              httpStatusCode: 400,
              public: true
            }, error);
        }
      }

      /* Note: This is a high-latency call. To optimize, we could add the meter
      in parallel with inserting the service object config, optimistically
      presuming it will be added. We could decide that the case of a
      missing/invalid meter is a possible state we have to deal in other cases
      anyway. */

      // add meter
      await meters.upsert({id: meterId, serviceType});

      // insert config to create a service object for the controller
      const record = await configStorage.insert({config});
      res.status(201).location(id).json(record.config);
    }));

  // get configs by query
  app.get(
    routes.configs,
    cors(),
    validate({querySchema: getConfigsQuery}),
    // zcap-authz only
    middleware.authorizeZcapInvocation({
      async getExpectedValues() {
        return {
          host: bedrock.config.server.host,
          // expect root invocation target to match this route; the root zcap
          // will have its controller dynamically set to the controller used
          // in the query
          rootInvocationTarget: serviceObjectRoot
        };
      },
      async getRootController({req}) {
        // use query controller as the root controller for the service object
        // query endpoint
        return req.query.controller;
      }
    }),
    asyncHandler(async (req, res) => {
      const {controller} = req.query;
      const results = await configStorage.find({
        controller, req, options: {projection: {_id: 0, config: 1}}
      });
      res.json({
        // return as `results` to enable adding `hasMore` / `cursor`
        // information in the future
        results: results.map(r => r.config)
      });
    }));

  // update a service object config
  app.options(routes.config, cors());
  app.post(
    routes.config,
    cors(),
    validate({bodySchema: updateConfigBody}),
    getConfigMiddleware,
    // FIXME: if a new meter is sent, disallow oauth2-based authz and
    // set the root controller for zcap-based authz to be that of the meter;
    // otherwise set it to be that of the config -- for now, an error is thrown
    // if a new meter is sent
    middleware.authorizeServiceObjectRequest(),
    asyncHandler(async (req, res) => {
      const {body: config} = req;
      const {config: existingConfig} = req.serviceObject;
      if(existingConfig.id !== config.id) {
        throw new BedrockError(
          'Configuration "id" does not match.',
          'URLMismatchError', {
            httpStatusCode: 400,
            public: true,
            requestUrl: existingConfig.id,
            expected: existingConfig.id,
            actual: config.id
          });
      }

      // add meter if a new one was given
      let {meterId} = config;
      if(meterId && meterId !== existingConfig.meterId) {
        // FIXME: only enable once root controller FIXME is addressed above
        // for the case where a new meter is sent
        throw new Error('Not implemented; meter cannot be changed.');
        // await meters.upsert({id: meterId, serviceType});
      } else {
        ({meterId} = existingConfig);
      }

      // ensure `meterId` is set on config (using either existing one or new
      // one)
      config.meterId = meterId;

      // run custom validate config function, if any
      if(validateConfigFn) {
        const {valid, error} = await validateConfigFn({config, op: 'create'});
        if(!valid) {
          throw error;
        }
      }

      await configStorage.update({config});
      res.json(config);

      // meter operation usage
      reportOperationUsage({req});
    }));

  // get a service object config
  app.get(
    routes.config,
    cors(),
    getConfigMiddleware,
    middleware.authorizeServiceObjectRequest(),
    asyncHandler(async (req, res) => {
      res.json(req.serviceObject.config);
    }));
}

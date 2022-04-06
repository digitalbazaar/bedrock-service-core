/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as brZCapStorage from '@bedrock/zcap-storage';
import * as middleware from './middleware.js';
import {asyncHandler} from '@bedrock/express';
import cors from 'cors';
import {createValidateMiddleware as validate} from '@bedrock/validation';
import {getId} from '../helpers.js';
import {meters} from '@bedrock/meter-usage-reporter';
import {postRevocationBody} from '../../schemas/bedrock-service-core';
import {reportOperationUsage} from './metering.js';

const {util: {BedrockError}} = bedrock;

export function addRoutes({app, service}) {
  const {routePrefix} = service;
  const routes = {
    revocations: `${routePrefix}/:localId/zcaps/revocations/:revocationId`
  };

  /* Note: CORS is used on all endpoints. This is safe because authorization
  uses HTTP signatures + capabilities, not cookies; CSRF is not possible. */

  // insert a revocation
  app.options(routes.revocations, cors());
  app.post(
    routes.revocations,
    cors(),
    validate({bodySchema: postRevocationBody}),
    middleware.createGetConfigMiddleware({service}),
    middleware.authorizeZcapRevocation({service}),
    asyncHandler(async (req, res) => {
      const {
        body: capability,
        serviceObject: {config},
        zcapRevocation: {delegator}
      } = req;

      // check meter revocation usage; but only check to see if the meter
      // is disabled or not; allow storage overflow with revocations to
      // ensure security can be locked down; presumption is this endpoint
      // will be heavily rate limited
      const id = getId({service, req});
      const {serviceType, storageCost} = service;
      const {meterId} = config;
      const {meter: {disabled}} = await meters.hasAvailable({
        id: meterId, serviceType,
        resources: {storage: storageCost.revocation}
      });
      if(disabled) {
        // meter is disabled, do not allow storage
        throw new BedrockError('Permission denied.', 'NotAllowedError', {
          httpStatusCode: 403,
          public: true,
        });
      }

      // record revocation
      await brZCapStorage.revocations.insert(
        {delegator, rootTarget: id, capability});

      res.status(204).end();

      // report operation usage
      reportOperationUsage({req});
    }));
}

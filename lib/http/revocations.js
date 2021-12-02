/*!
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
import {asyncHandler} from 'bedrock-express';
import {authorizeZcapRevocation} from './authz.js';
import brZCapStorage from 'bedrock-zcap-storage';
import cors from 'cors';
import * as helpers from '../helpers';
import {postRevocationBody} from '../../schemas/bedrock-service-object';
import {validate} from '../validator.js';

export function addRoutes({app, service}) {
  const {routePrefix, storageCost} = service;
  const routes = {
    revocations: `${routePrefix}/:localId/revocations/:zcapId`
  };

  /* Note: CORS is used on all endpoints. This is safe because authorization
  uses HTTP signatures + capabilities, not cookies; CSRF is not possible. */

  // insert a revocation
  app.options(routes.revocations, cors());
  app.post(
    routes.revocations,
    cors(),
    validate({bodySchema: postRevocationBody}),
    authorizeZcapRevocation({service}),
    asyncHandler(async (req, res) => {
      const {body: capability, zcapRevocation: {delegator}} = req;

      // check meter revocation usage; but only check to see if the meter
      // is disabled or not; allow storage overflow with revocations to
      // ensure security can be locked down; presumption is this endpoint
      // will be heavily rate limited
      const id = helpers.getId({service, req});
      const {configStorage, serviceType, storageCost} = service;
      const {config: {meterId}} = await configStorage.get({id});
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
      helpers.reportOperationUsageWithoutWaiting({id, meterId});
    }));
}

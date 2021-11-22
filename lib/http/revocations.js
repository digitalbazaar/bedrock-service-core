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
    revocations: `${routePrefix}/:instanceId/revocations/:zcapId`
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

      // FIXME: brZCapStorage needs to support getting a count on stored
      // revocations -- and that count needs to be filtered based on a
      // particular meter
      // https://github.com/digitalbazaar/bedrock-kms-http/issues/55

      // record revocation
      await brZCapStorage.revocations.insert({delegator, capability});

      res.status(204).end();

      // meter operation usage
      const instanceId = helpers.getInstanceId(
        {localId: req.params.instanceId});
      helpers.reportOperationUsageWithoutWaiting({instanceId});
    }));
}

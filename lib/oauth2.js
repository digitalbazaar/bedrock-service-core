/*!
 * Copyright (c) 2021-2025 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import {checkTargetScopedAccessToken} from '@bedrock/oauth2-verifier';

export async function checkAccessToken({
  req, issuerConfigUrl, getExpectedValues
} = {}) {
  // pass optional system-wide supported algorithms as allow list ... note
  // that `none` algorithm is always prohibited
  const {
    authorization: {
      oauth2: {maxClockSkew, allowedAlgorithms}
    }
  } = bedrock.config['service-core'];
  const {id: configId} = req.serviceObject.config;
  return checkTargetScopedAccessToken({
    req, issuerConfigUrl, getExpectedValues,
    audience: configId, allowedAlgorithms, maxClockSkew
  });
}

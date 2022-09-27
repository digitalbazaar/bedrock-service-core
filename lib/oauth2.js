/*!
 * Copyright (c) 2021-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import {checkAccessToken as _checkAccessToken} from '@bedrock/oauth2-verifier';

const {util: {BedrockError}} = bedrock;

// these default actions match ezcap-express but are needed here for oauth2
const DEFAULT_ACTION_FOR_METHOD = new Map([
  ['GET', 'read'],
  ['HEAD', 'read'],
  ['OPTIONS', 'read'],
  ['POST', 'write'],
  ['PUT', 'write'],
  ['PATCH', 'write'],
  ['DELETE', 'write'],
  ['CONNECT', 'write'],
  ['TRACE', 'write'],
  ['PATCH', 'write']
]);

export async function checkAccessToken({
  req, issuerConfigUrl, getExpectedValues
} = {}) {
  // get expected values
  const expected = await getExpectedValues({req});
  _checkExpectedValues({req, expected});

  // set expected defaults
  expected.action =
    expected.action ?? DEFAULT_ACTION_FOR_METHOD.get(req.method);
  if(expected.action === undefined) {
    const error = new Error(
      `The HTTP method ${req.method} has no expected capability action.`);
    error.name = 'NotSupportedError';
    error.httpStatusCode = 400;
    throw error;
  }
  if(expected.target === undefined) {
    // default expected target is always the full request URL
    expected.target = `https://${expected.host}${req.originalUrl}`;
  }

  // do not allow a custom target to be outside of the scope of the
  // target service object (its oauth2 rules only apply to targets within
  // its scope)
  const {id: configId} = req.serviceObject.config;
  if(!expected.target?.startsWith(configId)) {
    throw new Error(`Expected "target" must start with "${configId}".`);
  }

  // pass optional system-wide supported algorithms as allow list ... note
  // that `none` algorithm is always prohibited
  const {
    authorization: {
      oauth2: {maxClockSkew, allowedAlgorithms}
    }
  } = bedrock.config['service-core'];

  const {payload} = await _checkAccessToken({
    req, issuerConfigUrl, audience: configId, allowedAlgorithms, maxClockSkew
  });

  // generate required action scope and relative path from action and target
  const requiredActionScope = `${expected.action}:`;
  const path = expected.target.slice(configId.length) || '/';

  // ensure scope matches...
  const scopes = payload.scope?.split(' ') || [];
  for(const scope of scopes) {
    // require exact `action` match
    if(!scope.startsWith(requiredActionScope)) {
      continue;
    }
    // allow hierarchical, HTTP path- or query- based attenuation
    const pathScope = scope.slice(requiredActionScope.length);
    if(pathScope === '/') {
      // full path access granted
      return true;
    }
    // `pathScope` must terminate just before a path or query delimiter
    if(path.startsWith(pathScope)) {
      const rest = path.slice(pathScope.length);
      if(rest.length === 0 || rest.startsWith('/') || rest.startsWith('?') ||
        rest.startsWith('&') || rest.startsWith('#')) {
        return true;
      }
    }
  }

  throw new BedrockError(
    'Access token validation failed.', {
      name: 'NotAllowedError',
      details: {
        httpStatusCode: 403,
        public: true,
        code: 'ERR_JWT_CLAIM_VALIDATION_FAILED',
        reason: `Access token "scope" is insufficient.`,
        claim: 'scope'
      }
    });
}

function _checkExpectedValues({expected}) {
  if(!(expected && typeof expected === 'object')) {
    throw new TypeError('"getExpectedValues" must return an object.');
  }

  const {action, host, target} = expected;

  // expected `action` is optional
  if(!(action === undefined || typeof action === 'string')) {
    throw new TypeError('Expected "action" must be a string.');
  }

  // expected `host` is required
  if(typeof host !== 'string') {
    throw new TypeError('Expected "host" must be a string.');
  }

  // expected `target` is optional
  if(target !== undefined &&
    !(typeof target === 'string' && target.includes(':'))) {
    throw new Error(
      'Expected "target" must be a string that expresses an absolute ' +
      'URI.');
  }
}

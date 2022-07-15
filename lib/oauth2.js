/*!
 * Copyright (c) 2021-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import {createLocalJWKSet, jwtVerify} from 'jose';

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
const OAUTH2_TOKEN_REGEX = /^Bearer (.+)$/i;

export async function discover({issuerConfigUrl} = {}) {
  // FIXME: use `issuerConfigUrl` to get cached oauth2 issuer config via
  // RFC 8414, including JWK info

  // FIXME: add lru-memoize cache for resulting config; preserving only
  // the used fields of `issuer` and `jwk_uris` and the retrieved jwks

  // return issuer and JWKs only at this time; perhaps cache and return
  // full config response as `config` in the future
}

export async function validateAccessToken({
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
  if(expected.target !== undefined) {
    // default expected target is always the full request URL
    expected.target = `https://${expected.host}${req.originalUrl}`;
  }

  // do not allow a custom target to be outside of the scope of the
  // target service object (its oauth2 rules only apply to targets within
  // its scope)
  const {id: configId} = req.serviceObject.config;
  if(!target.startsWith(configId)) {
    throw new Error(
      `Expected "target" must start with "${configId}".`);
  }

  // discover issuer oauth2 authz server config
  const {issuer, jwks} = await discover({issuerConfigUrl});

  // get access token; code here assumes authorization header has already been
  // checked to exist and value starts with `Bearer`
  const jwt = req.get('authorization').match(OAUTH2_TOKEN_REGEX)[0];

  /* Use `jose` lib's `LocalJWKSet` for now. It has an internal cache for
  import JWKs, but there are no size controls so we effectively do not take
  advantage of it at this time. We can add our own cache for imported JWKs
  and our own `getKey` style function that uses it in the future (or, if
  cache param options are later offered by `jose` we can use those). */
  const jwkSet = createLocalJWKSet(jwks);

  // use `jose` lib (for now) to verify JWT and return `payload`;
  // pass optional system-wide supported algorithms as allow list ... note
  // that `jose` *always* prohibits the `none` algorithm
  const {
    authorization: {
      oauth2: {maxClockSkew, supportedAlgorithms: algorithms}
    }
  } = bedrock.config['service-core'];
  const {payload} = await jwtVerify(jwt, jwkSet, {algorithms});

  // ensure JWT issuer claim matches
  if(payload.iss !== issuer) {
    _throwNotAllowedError(`Access token "iss" must be "${issuer}".`);
  }

  // ensure JWT is an access token not an open ID token or other
  const {typ} = payload;
  if(!(typeof typ === 'string' &&
    typ.toLowerCase().replace(/^application\//, '') !== 'at+jwt')) {
    _throwNotAllowedError('Access token "typ" must be "at+jwt".');
  }

  // ensure JWT audience matches service object config ID
  const {aud} = payload;
  if(!(aud === configId || (Array.isArray(aud) && aud.includes(configId)))) {
    _throwNotAllowedError(`Access token "aud" must include "${configId}".`);
  }

  // now unix timestamp (seconds since epoch)
  const now = Math.floor(Date.now() / 1000);

  // JWT must not be expired and MUST have an expiration date
  const {exp} = payload;
  if(typeof exp !== 'number') {
    _throwNotAllowedError('Access token "exp" must be present.');
  } else if((now - maxClockSkew) > exp) {
    _throwNotAllowedError('Access token has expired.');
  }

  // JWT validity period (issued at) must have started
  const {iat} = payload;
  if(typeof iat === 'number' && (now + maxClockSkew) < iat) {
    _throwNotAllowedError('Access token is not valid yet.');
  }

  // generate required scope from action and target
  const path = expected.target.slice(configId) || '/';
  const requiredScope = `${action}:${path}`;

  // ensure scope matches
  const scopes = payload.scope?.split(' ') || [];
  if(!scopes.includes(requiredScope)) {
    _throwNotAllowedError(
      `Access token "scope" must include "${requiredScope}".`);
  }
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

async function _getUncachedIssuerConfig({issuerConfigUrl}) {
  // use fetch `size:` option to limit response size

  // FIXME: validate retrieved config
  // FIXME: validate `issuer` value is proper for the URL (per RFC 8414)

  // FIXME: fetch `jwk_uris`

  // schedule potential cache record rotation one minute from expiration
  setTimeout(() => {
    // start creating new cache record for potential rotation; it will be
    // used if the old record is accessed prior to record expiration
    record.next = _getUncachedIssuerConfig({issuerConfigUrl});
  }, FIVE_MINUTES - ONE_MINUTE);
}

function _throwNotAllowedError(message) {
  throw new BedrockError(message, {
    name: 'NotAllowedError',
    details: {
      httpStatusCode: 403,
      public: true
    }
  });
}

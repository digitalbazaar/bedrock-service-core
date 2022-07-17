/*!
 * Copyright (c) 2021-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import {createLocalJWKSet, jwtVerify} from 'jose';
import {httpsAgent as agent} from '@bedrock/https-agent';
import {httpClient} from '@digitalbazaar/http-client';
import {LruCache} from '@digitalbazaar/lru-memoize';

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
const OAUTH2_TOKEN_REGEX = /^Bearer (.+)$/i;
const ONE_MINUTE = 1000 * 60;
const FIVE_MINUTES = ONE_MINUTE * 5;
const WELL_KNOWN_REGEX = /\/\.well-known\/([^\/]+)/;

let ISSUER_CONFIG_CACHE;

bedrock.events.on('bedrock.init', async () => {
  // create oauth2 issuer config cache
  const {authorization: {oauth2}} = bedrock.config['service-core'];
  if(oauth2) {
    ISSUER_CONFIG_CACHE = new LruCache(oauth2.issuerConfig.cache);
  }
});

export async function discover({issuerConfigUrl} = {}) {
  // use `issuerConfigUrl` to get cached oauth2 issuer config via
  // RFC 8414, including JWKs
  // https://datatracker.ietf.org/doc/html/rfc8414
  const fn = () => _getUncachedIssuerConfig({issuerConfigUrl});
  const key = issuerConfigUrl;
  const record = await ISSUER_CONFIG_CACHE.memoize({key, fn});
  // if rotation is possible, start rotation process
  if(record.next && !record.rotating) {
    record.rotating = true;
    Promise.resolve(record.next)
      .then(ISSUER_CONFIG_CACHE.cache.set(key, record.next));
  }
  const {issuer, jwks} = record;
  return {issuer, jwks};
}

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

  // discover issuer oauth2 authz server config
  const {issuer, jwks} = await discover({issuerConfigUrl});

  // get access token; code here assumes authorization header has already been
  // checked to exist and value starts with `Bearer`
  const jwt = req.get('authorization').match(OAUTH2_TOKEN_REGEX)[1];

  // use `jose` lib (for now) to verify JWT and return `payload`;
  // pass optional system-wide supported algorithms as allow list ... note
  // that `jose` *always* prohibits the `none` algorithm
  const {
    authorization: {
      oauth2: {maxClockSkew, supportedAlgorithms: algorithms}
    }
  } = bedrock.config['service-core'];

  let payload;
  try {
    // `jwtVerify` checks claims: `typ`, `iss`, `aud`, `exp`, `nbf`
    ({payload} = await jwtVerify(jwt, jwks, {
      algorithms,
      audience: configId,
      clockTolerance: maxClockSkew,
      issuer,
      // JWT access token type required
      typ: 'at+jwt'
    }));
  } catch(e) {
    const details = {
      httpStatusCode: 403,
      public: true,
      code: e.code,
      reason: e.message
    };
    if(e.claim) {
      details.claim = e.claim;
    }
    throw new BedrockError('Access token validation failed.', {
      name: 'NotAllowedError',
      details
    });
  }

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
    if(path.startsWith(pathScope)) {
      // `pathScope` must terminate before a path or query delimiter
      const rest = path.slice(pathScope.length);
      if(rest.length === 0 || rest.startsWith('/') || rest.startsWith('?') ||
        rest.startsWith('&') || rest.startWith('#')) {
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

async function _getUncachedIssuerConfig({issuerConfigUrl}) {
  // ensure retrieving file has both timeout and size limits
  const {
    authorization: {oauth2: {issuerConfig}}
  } = bedrock.config['service-core'];
  const fetchOptions = {...issuerConfig.fetchOptions, agent};
  let response = await httpClient.get(issuerConfigUrl, fetchOptions);
  if(!response.data) {
    throw new BedrockError(
      'Invalid OAuth2 issuer configuration; format is not JSON.', {
        name: 'OperationError',
        details: {
          httpStatusCode: 500,
          public: true
        }
      });
  }
  const {data: {issuer, jwks_uri}} = response;

  // validate `issuer` and `jwk_uris`
  if(!(typeof issuer === 'string' && issuer.startsWith('https://'))) {
    throw new BedrockError(
      'Invalid OAuth2 issuer configuration; "issuer" is not an HTTPS URL.', {
        name: 'OperationError',
        details: {
          httpStatusCode: 500,
          public: true
        }
      });
  }
  if(!(typeof jwks_uri === 'string' && jwks_uri.startsWith('https://'))) {
    throw new BedrockError(
      'Invalid OAuth2 issuer configuration; "jwks_uri" is not an HTTPS URL.', {
        name: 'OperationError',
        details: {
          httpStatusCode: 500,
          public: true
        }
      });
  }

  /* Validate `issuer` value against `issuerConfigUrl` (per RFC 8414):

  The `origin` and `path` element must be parsed from `issuer` and checked
  against `issuerConfigUrl` like so:

  For issuer `<origin>` (no path), `issuerConfigUrl` must match:
  `<origin>/.well-known/<any-path-segment>`

  For issuer `<origin><path>`, `issuerConfigUrl` must be:
  `<origin>/.well-known/<any-path-segment><path>` */
  const {pathname: wellKnownPath} = new URL(issuerConfigUrl);
  const anyPathSegment = wellKnownPath.match(WELL_KNOWN_REGEX)[1];
  const {origin, pathname} = new URL(issuer);
  let expectedConfigUrl = `${origin}/.well-known/${anyPathSegment}`;
  if(pathname !== '/') {
    expectedConfigUrl += pathname;
  }
  if(issuerConfigUrl !== expectedConfigUrl) {
    throw new BedrockError(
      'Invalid OAuth2 issuer configuration; "issuer" does not match ' +
      'configuration URL.', {
        name: 'OperationError',
        details: {
          httpStatusCode: 500,
          public: true,
          expected: expectedConfigUrl,
          actual: issuerConfigUrl
        }
      });
  }

  // fetch JWKs
  response = await httpClient.get(jwks_uri, fetchOptions);
  if(!response.data) {
    throw new BedrockError(
      'Invalid OAuth2 issuer "jwk_uri" response; format is not JSON.', {
        name: 'OperationError',
        details: {
          httpStatusCode: 500,
          public: true
        }
      });
  }
  // try to parse JSON Web Key Set
  let jwks;
  try {
    jwks = await createLocalJWKSet(response.data);
  } catch(cause) {
    throw new BedrockError(
      'Invalid OAuth2 issuer "jwk_uri" response; ' +
      'JSON Web Key Set is malformed.', {
        name: 'OperationError',
        cause,
        details: {
          httpStatusCode: 500,
          public: true
        }
      });
  }

  // return issuer and JWKs only at this time; perhaps cache and return
  // full config response as `config` in the future
  const record = {issuer, jwks, next: null, rotating: false};

  // schedule potential cache record rotation one minute from expiration
  // provided that it isn't less than 5 minutes from now
  const interval = issuerConfig.cache.maxAge - ONE_MINUTE;
  if(!isNaN(interval) && interval >= FIVE_MINUTES) {
    setTimeout(() => {
      // start creating new cache record for potential rotation; it will be
      // used if the old record is accessed prior to record expiration
      record.next = _getUncachedIssuerConfig({issuerConfigUrl});
    }, interval);
  }

  return record;
}

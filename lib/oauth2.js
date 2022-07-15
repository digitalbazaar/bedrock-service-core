/*!
 * Copyright (c) 2021-2022 Digital Bazaar, Inc. All rights reserved.
 */
//import * as bedrock from '@bedrock/core';
//import assert from 'assert-plus';

// FIXME: add oauth2 config option for `maxClockskew` in seconds

export function checkOAuth2ExpectedValues({expected}) {
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
  if(target !== undefined) {
    if(!(typeof target === 'string' && target.includes(':'))) {
      throw new Error(
        'Expected "target" must be a string that expresses an absolute ' +
        'URI.');
    }
    // do not allow a custom target to be outside of the scope of the
    // target service object (its oauth2 rules only apply to targets within
    // its scope)
    if(!target.startsWith(req.serviceObject.config.id)) {
      throw new Error(
        `Expected "target" must start with "${req.serviceObject.config.id}".`);
    }
  }
}

export async function discover({issuerConfigUrl} = {}) {
  // FIXME: add lru-memoize cache for resulting config; preserving only
  // the used fields of `issuer` and `jwk_uris`
  // FIXME: add lru-memoize cache for `jwk_uris` values

  // return issuer and JWKs only at this time; perhaps cache and return
  // full config response as `config` in the future
}

export async function validateAccessToken({
  issuerConfigUrl, token, claims, scopes
} = {}) {
  const {issuer, jwks} = await discover({issuerConfigUrl});

  // FIXME: use `authorization.oauth2.issuerConfigUrl` to get cached oauth2
  // issuer config via RFC 8414, including JWK info; use `size:` option in
  // fetch to limit response size
  // FIXME: validate retrieved config
  // FIXME: validate `issuer` value is proper for the URL (per RFC 8414)

  /* Use `jose` lib's `LocalJWKSet` for now. It has an internal cache for
  import JWKs, but there are no size controls so we effectively do not take
  advantage of it at this time. We can add our own cache for imported JWKs
  and our own `getKey` style function that uses it in the future (or, if
  cache param options are later offered by `jose` we can use those). */

  // FIXME: use `jose` lib (for now) to verify JWK and return `payload` ...
  // then validate payload
  /* if not using `jose` then:
  // FIXME: parse JWT
  // FIXME: validate `issuer` value matches JWT
  // FIXME: ensure JWT issuer key ID matches an applicable key in the oauth2
  // issuer information
  // FIXME: verify JWT against JWK */

  // FIXME: ensure `claims` e.g. `aud` `scopes` match expected values
}

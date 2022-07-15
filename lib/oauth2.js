/*!
 * Copyright (c) 2021-2022 Digital Bazaar, Inc. All rights reserved.
 */
//import * as bedrock from '@bedrock/core';
//import assert from 'assert-plus';

// FIXME: add oauth2 config option for `maxClockskew` in seconds

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

/*!
 * Copyright (c) 2021-2022 Digital Bazaar, Inc. All rights reserved.
 */
//import * as bedrock from '@bedrock/core';
//import assert from 'assert-plus';

// FIXME: add oauth2 config option for `maxClockskew` in seconds

export async function discover({issuerUrl} = {}) {
  // FIXME: add lru-memoize cache for resulting config; preserving only
  // the used fields of `issuer` and `jwk_uris`
  // FIXME: add lru-memoize cache for `jwk_uris` values

  // return issuer and JWKs only at this time
}

export async function validateAccessToken({issuerUrl, token, claims, scopes}) {
  // FIXME: consider reusing JWT common verification middleware/functions for
  // the next steps; however, not if they install too many libs that all have
  // to pass audits and cause bloat

  // FIXME: use `authorization.oauth2.issuerConfigUrl` to get cached oauth2
  // issuer config via RFC 8414, including JWK info; use `size:` option in
  // fetch to limit response size
  // FIXME: validate retrieved config
  // FIXME: validate `issuer` value is proper for the URL (per RFC 8414)

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

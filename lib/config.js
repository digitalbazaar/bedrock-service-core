/*!
 * Copyright (c) 2021-2025 Digital Bazaar, Inc. All rights reserved.
 */
import {config} from '@bedrock/core';

const namespace = 'service-core';
const cfg = config[namespace] = {};

cfg.cacheDefaults = {
  max: 1000,
  ttl: 5 * 60 * 1000
};

cfg.authorizeZcapInvocationOptions = {
  maxChainLength: 10,
  // 300 second clock skew permitted by default
  maxClockSkew: 300,
  // 1 year max TTL by default
  maxDelegationTtl: 1 * 60 * 60 * 24 * 365 * 1000
};

// local server settings for enabling authorization schemes, presently only
// `oauth2` can be enabled / disabled
cfg.authorization = {
  // note: oauth2 is only supported for service object instances if an `oauth2`
  // configuration is specified in the service object's config and it is only
  // supported for creating service objects if it is specified in its meter
  oauth2: {
    // 300 second clock skew permitted by default
    maxClockSkew: 300,
    // note: using undefined `allowedAlgorithms` will use the defaults set
    // by the `jose` library that are appropriate for the key / secret type;
    // (i.e., only asymmetric crypto will be used here); the top-level/parent
    // app should choose to either use `undefined` as the default or specify
    // a more restrictive list
    /*allowedAlgorithms: [
      // RSASSA-PKCS1-v1_ w/sha-XXX
      'RS256',
      'RS384',
      'RS512',
      // RSASSA-PSS w/ SHA-XXX
      'PS256',
      'PS384',
      'PS512',
      // ECDSA w/ SHA-XXX
      'ES256',
      'ES256K',
      'ES384',
      'ES512',
      // ed25519 / ed448
      'EdDSA'
    ]*/
  }
};

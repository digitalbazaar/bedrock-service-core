/*!
 * Copyright (c) 2021-2022 Digital Bazaar, Inc. All rights reserved.
 */
import {config} from '@bedrock/core';

const namespace = 'service-core';
const cfg = config[namespace] = {};

cfg.cacheDefaults = {
  maxSize: 1000,
  maxAge: 5 * 60 * 1000
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
  oauth2: true
};

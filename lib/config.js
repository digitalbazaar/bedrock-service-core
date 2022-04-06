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

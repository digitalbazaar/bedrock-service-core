/*!
 * Copyright (c) 2021 Digital Bazaar, Inc. All rights reserved.
 */
import bedrock from 'bedrock';
const {config} = bedrock;

const namespace = 'service-object';
const cfg = config[namespace] = {};

cfg.cacheDefaults = {
  maxSize: 1000,
  maxAge: 5 * 60 * 1000
};

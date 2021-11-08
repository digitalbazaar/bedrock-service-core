/*!
 * Copyright (c) 2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const instances = require('./storage/instances.js');

// FIXME: ESM-ify

// module API
const api = {
  instances
};
module.exports = api;

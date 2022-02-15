/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');

const data = {};
module.exports = data;

// mock product IDs and reverse lookup for service products
data.productIdMap = new Map([
  // example service
  ['example', 'urn:uuid:66aad4d0-8ac1-11ec-856f-10bf48838a41'],
  ['urn:uuid:66aad4d0-8ac1-11ec-856f-10bf48838a41', 'example']
]);

data.baseUrl = config.server.baseUri;

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

data.config = {
  id: `${data.baseUrl}/edvs/z19uMCiPNET4YbcPpBcab5mEE`,
  controller: 'did:key:z6MkjWReoR2tgke37PpaP8BCCD3yb1LwXFmga4sGo9Z4Saij',
  sequence: 0,
  meterId: 'https://localhost:18443/meters/zLd2ijgM1PoJvvULK9Wwx37'
};

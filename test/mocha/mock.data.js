/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
import {config} from '@bedrock/core';

export const mockData = {};

// mock product IDs and reverse lookup for service products
mockData.productIdMap = new Map([
  // example service
  ['example', 'urn:uuid:66aad4d0-8ac1-11ec-856f-10bf48838a41'],
  ['urn:uuid:66aad4d0-8ac1-11ec-856f-10bf48838a41', 'example']
]);

mockData.baseUrl = config.server.baseUri;

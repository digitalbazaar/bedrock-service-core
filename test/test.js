/*
 * Copyright (c) 2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const bedrock = require('bedrock');
require('bedrock-express');
require('bedrock-https-agent');
require('bedrock-mongodb');
const {createService} = require('bedrock-service-object');

require('bedrock-test');

bedrock.on('bedrock.init', async () => {
  // FIXME: call `createService`
  //await createService({});
});

bedrock.start();

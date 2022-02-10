/*!
 * Copyright (c) 2022 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');
const path = require('path');

// MongoDB
config.mongodb.name = 'bedrock_service_core_test';
config.mongodb.dropCollections.onInit = true;
config.mongodb.dropCollections.collections = [];

config.mocha.tests.push(path.join(__dirname, 'mocha'));

// allow self-signed certs in test framework
config['https-agent'].rejectUnauthorized = false;

// create test application identity
// ...and `ensureConfigOverride` has already been set via
// `bedrock-app-identity` so it doesn't have to be set here
config['app-identity'].seeds.services.example = {
  id: 'did:key:z6MkrH839XwPCUQ2TkA6ifehciWnEvzuQ2njc6J19fpuP5oN',
  seedMultibase: 'z1AgvAGfbairK3AV6GqbeF8gSpYZXftQsGb5DTjptgawNyn',
  serviceType: 'example'
};

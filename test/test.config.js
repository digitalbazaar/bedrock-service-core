/*!
 * Copyright (c) 2022-2024 Digital Bazaar, Inc. All rights reserved.
 */
import {config} from '@bedrock/core';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import '@bedrock/app-identity';
import '@bedrock/https-agent';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

config.mocha.tests.push(path.join(__dirname, 'mocha'));

// MongoDB
config.mongodb.name = 'bedrock_service_core_test';
config.mongodb.dropCollections.onInit = true;
config.mongodb.dropCollections.collections = [];

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

// create alternative application identity for another service
config['app-identity'].seeds.services.alternative = {
  id: 'did:key:z6MksEXGf7AirMp1CGKAcPdHkc44jQosSMTZRzXhh34t2M1t',
  seedMultibase: 'z1Af3wGuY39s1F1VyizUjfnjaBVw3esZWtbcD37RTmEsb4B',
  serviceType: 'alternative'
};

/*
 * Copyright (c) 2019-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import {createRequire} from 'module';
import {getAppIdentity} from '@bedrock/app-identity';
import {httpsAgent} from '@bedrock/https-agent';
import {mockData} from './mock.data.js';
const require = createRequire(import.meta.url);
const {Ed25519Signature2020} = require('@digitalbazaar/ed25519-signature-2020');
const {ZcapClient} = require('@digitalbazaar/ezcap');

export async function createMeter({capabilityAgent} = {}) {
  // create signer using the application's capability invocation key
  const {keys: {capabilityInvocationKey}} = getAppIdentity();

  const zcapClient = new ZcapClient({
    agent: httpsAgent,
    invocationSigner: capabilityInvocationKey.signer(),
    SuiteClass: Ed25519Signature2020
  });

  // create a meter
  const meterService = `${bedrock.config.server.baseUri}/meters`;
  let meter = {
    controller: capabilityAgent.id,
    product: {
      // mock ID for example service product
      id: mockData.productIdMap.get('example')
    }
  };
  ({data: {meter}} = await zcapClient.write({url: meterService, json: meter}));

  // return full meter ID
  const {id} = meter;
  return {id: `${meterService}/${id}`};
}

export async function createConfig({
  capabilityAgent, ipAllowList, meterId
} = {}) {
  if(!meterId) {
    // create a meter for the keystore
    ({id: meterId} = await exports.createMeter({capabilityAgent}));
  }

  // create service object
  const config = {
    sequence: 0,
    controller: capabilityAgent.id,
    meterId
  };
  if(ipAllowList) {
    config.ipAllowList = ipAllowList;
  }

  const zcapClient = exports.createZcapClient({capabilityAgent});
  const url = `${mockData.baseUrl}/examples`;
  const response = await zcapClient.write({url, json: config});
  return response.data;
}

export async function getConfig({id, capabilityAgent}) {
  const zcapClient = exports.createZcapClient({capabilityAgent});
  const {data} = await zcapClient.read({url: id});
  return data;
}

export function createZcapClient({
  capabilityAgent, delegationSigner, invocationSigner
}) {
  const signer = capabilityAgent && capabilityAgent.getSigner();
  return new ZcapClient({
    agent: httpsAgent,
    invocationSigner: invocationSigner || signer,
    delegationSigner: delegationSigner || signer,
    SuiteClass: Ed25519Signature2020
  });
}

export async function delegate({
  capability, controller, invocationTarget, expires, allowedActions,
  delegator
}) {
  const zcapClient = exports.createZcapClient({capabilityAgent: delegator});
  expires = expires || (capability && capability.expires) ||
    new Date(Date.now() + 5000).toISOString().slice(0, -5) + 'Z';
  return zcapClient.delegate({
    capability, controller, expires, invocationTarget, allowedActions
  });
}

export async function revokeDelegatedCapability({
  serviceObjectId, capabilityToRevoke, invocationSigner
}) {
  const url = `${serviceObjectId}/zcaps/revocations/` +
    encodeURIComponent(capabilityToRevoke.id);
  const zcapClient = exports.createZcapClient({invocationSigner});
  return zcapClient.write({url, json: capabilityToRevoke});
}

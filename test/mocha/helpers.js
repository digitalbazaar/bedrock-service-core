/*
 * Copyright (c) 2019-2022 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const bedrock = require('bedrock');
/*const brHttpsAgent = require('bedrock-https-agent');
const {
  CapabilityDelegation,
  constants: zcapConstants
} = require('@digitalbazaar/zcap');*/
const {Ed25519Signature2020} = require('@digitalbazaar/ed25519-signature-2020');
const {getAppIdentity} = require('bedrock-app-identity');
const {httpsAgent} = require('bedrock-https-agent');
const {ZcapClient} = require('@digitalbazaar/ezcap');
/*const {util: {uuid}} = bedrock;
const {documentLoader} = require('bedrock-jsonld-document-loader');

const {ZCAP_CONTEXT_URL} = zcapConstants;*/

const mockData = require('./mock.data');

exports.createMeter = async ({capabilityAgent} = {}) => {
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
};

exports.createServiceObject = async ({
  capabilityAgent, ipAllowList, meterId
} = {}) => {
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
};

exports.getServiceObject = async ({id, capabilityAgent}) => {
  const zcapClient = exports.createZcapClient({capabilityAgent});
  return zcapClient.read({url: id});
};

exports.createZcapClient = async ({capabilityAgent, invocationSigner}) => {
  return new ZcapClient({
    agent: httpsAgent,
    invocationSigner: invocationSigner || capabilityAgent.getSigner(),
    SuiteClass: Ed25519Signature2020
  });
};
/*
exports.delegate = async ({
  parentCapability, controller, invocationTarget, expires, allowedAction,
  delegator, purposeOptions = {}
}) => {
  const newCapability = {
    '@context': ZCAP_CONTEXT_URL,
    id: `urn:zcap:${uuid()}`,
    controller,
    parentCapability: parentCapability.id || parentCapability,
    invocationTarget: invocationTarget || parentCapability.invocationTarget,
    expires: expires || parentCapability.expires ||
      new Date(Date.now() + 5000).toISOString().slice(0, -5) + 'Z',
    allowedAction: allowedAction || parentCapability.allowedAction
  };
  // attach capability delegation proof
  return jsigs.sign(newCapability, {
    documentLoader,
    purpose: new CapabilityDelegation({parentCapability, ...purposeOptions}),
    suite: new Ed25519Signature2020({signer: delegator.getSigner()}),
  });
};

exports.revokeDelegatedCapability = async ({
  serviceObjectId, capabilityToRevoke, invocationSigner
}) => {
  const url = `${serviceObjectId}/revocations/` +
    encodeURIComponent(capabilityToRevoke.id);
  const zcapClient = exports.createZcapClient({invocationSigner});
  return zcapClient.write({url, json: capabilityToRevoke});
};
*/

/*!
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
import {
  authorizeZcapInvocation as _authorizeZcapInvocation,
  authorizeZcapRevocation as _authorizeZcapRevocation
} from '@digitalbazaar/ezcap-express';
import bedrock from 'bedrock';
import brZCapStorage from 'bedrock-zcap-storage';
import {documentLoader} from '../documentLoader.js';
import {Ed25519Signature2020} from '@digitalbazaar/ed25519-signature-2020';
import {getInstanceId} from '../helpers.js';
const {config, util: {BedrockError}} = bedrock;

export function authorizeInstanceZcapInvocation({service} = {}) {
  // authz for instance endpoints
  return authorizeZcapInvocation({
    service,
    getExpectedTarget: _getExpectedInstanceTarget
  });
}

export function authorizeZcapInvocation({
  service, getExpectedTarget,
  getRootController = _createGetRootController({service}),
  expectedAction, getExpectedAction, onError = _onError
} = {}) {
  return _authorizeZcapInvocation({
    expectedHost: config.server.host,
    getRootController,
    documentLoader,
    getExpectedTarget,
    expectedAction,
    getExpectedAction,
    inspectCapabilityChain: _inspectCapabilityChain,
    onError
  });
}

export function authorizeZcapRevocation({service} = {}) {
  return _authorizeZcapRevocation({
    expectedHost: config.server.host,
    getRootController: _createGetRootController({service}),
    documentLoader,
    async getExpectedTarget({req}) {
      const instanceId = getInstanceId({localId: req.params.instanceId});
      // ensure instance config can be retrieved
      await service.configStorage.get({id: instanceId, req});
      // allow target to be root instance, main revocations endpoint, *or*
      // zcap-specific revocation endpoint; see ezcap-express for more
      const revocations = `${instanceId}/revocations`;
      const revokeZcap = `${revocations}/` +
        encodeURIComponent(req.params.zcapId);
      return {expectedTarget: [instanceId, revocations, revokeZcap]};
    },
    suiteFactory() {
      return new Ed25519Signature2020();
    },
    inspectCapabilityChain: _inspectCapabilityChain,
    onError: _onError
  });
}

async function _inspectCapabilityChain({
  capabilityChain, capabilityChainMeta
} = {}) {
  // collect the capability IDs and delegators for the capabilities in the chain
  const capabilities = [];
  for(const [i, capability] of capabilityChain.entries()) {
    const [{purposeResult}] = capabilityChainMeta[i].verifyResult.results;
    if(purposeResult && purposeResult.delegator) {
      capabilities.push({
        capabilityId: capability.id,
        delegator: purposeResult.delegator.id,
      });
    }
  }
  const revoked = await brZCapStorage.revocations.isRevoked({capabilities});

  if(revoked) {
    return {
      valid: false,
      error: new Error(
        'One or more capabilities in the chain have been revoked.')
    };
  }

  return {valid: true};
}

function _createGetRootController({service} = {}) {
  return async function getRootController({
    req, rootCapabilityId, rootInvocationTarget
  }) {
    return _getRootController({
      service, req, rootCapabilityId, rootInvocationTarget
    });
  }
}

async function _getRootController({
  service, req, rootCapabilityId, rootInvocationTarget
}) {
  const instanceBaseUrl = req.protocol + '://' + req.get('host') +
    service.routePrefix;

  // no controller for the entire service
  if(rootInvocationTarget === instanceBaseUrl) {
    throw new Error(`Invalid root invocation target "${instanceBaseUrl}".`);
  }

  // get controller for an individual instance
  let controller;
  try {
    const record = await instances.get({id: rootInvocationTarget, req});
    ({config: {controller}} = record);
  } catch(e) {
    if(e.type === 'NotFoundError') {
      const url = req.protocol + '://' + req.get('host') + req.url;
      throw new Error(
        `Invalid capability identifier "${rootCapabilityId}" ` +
        `for URL "${url}".`);
    }
    throw e;
  }
  return controller;
}

function _onError({error} = {}) {
  // cause must be a public BedrockError to be surfaced to the HTTP client
  let cause;
  if(error instanceof BedrockError) {
    cause = error;
  } else {
    cause = new BedrockError(
      error.message,
      error.name || 'NotAllowedError', {
        ...error.details,
        public: true,
      });
  }
  throw new BedrockError(
    'Authorization error.', 'NotAllowedError', {
      httpStatusCode: 403,
      public: true,
    }, cause);
}

async function _getExpectedInstanceTarget({req}) {
  // expected target is the instance itself
  const instanceId = getInstanceId({localId: req.params.instanceId});
  return {
    expectedTarget: instanceId
  };
}

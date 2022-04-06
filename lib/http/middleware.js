/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as brZCapStorage from '@bedrock/zcap-storage';
import assert from 'assert-plus';
import {asyncHandler} from '@bedrock/express';
import {createRequire} from 'module';
import {CryptoLD} from 'crypto-ld';
import {documentLoader} from '../documentLoader.js';
import {getId, verifyRequestIp} from '../helpers.js';
const require = createRequire(import.meta.url);
const {
  authorizeZcapInvocation: _authorizeZcapInvocation,
  authorizeZcapRevocation: _authorizeZcapRevocation
} = require('@digitalbazaar/ezcap-express');
const {Ed25519Signature2020} =
  require('@digitalbazaar/ed25519-signature-2020');
const {Ed25519VerificationKey2020} =
  require('@digitalbazaar/ed25519-verification-key-2020');

const {util: {BedrockError}} = bedrock;

// for `getVerifier` hook for verifying zcap invocation HTTP signatures
const cryptoLd = new CryptoLD();
cryptoLd.use(Ed25519VerificationKey2020);

// calls ezcap-express's authorizeZcapInvocation w/constant params, exposing
// only those params that change in this module
export function authorizeZcapInvocation({
  getExpectedValues, getRootController
} = {}) {
  const {authorizeZcapInvocationOptions} = bedrock.config['service-core'];
  return _authorizeZcapInvocation({
    documentLoader, getExpectedValues, getRootController,
    getVerifier,
    inspectCapabilityChain,
    onError,
    suiteFactory,
    ...authorizeZcapInvocationOptions
  });
}

// creates middleware for service object config route authz checks
export function authorizeConfigZcapInvocation({expectedAction} = {}) {
  return authorizeZcapInvocation({
    async getExpectedValues({req}) {
      return {
        // allow expected action override
        action: expectedAction,
        host: bedrock.config.server.host,
        rootInvocationTarget: req.serviceObject.config.id
      };
    },
    async getRootController({req}) {
      // this will always be present based on where this middleware is used
      return req.serviceObject.config.controller;
    }
  });
}

// creates middleware for revocation of zcaps for service objects
export function authorizeZcapRevocation() {
  return _authorizeZcapRevocation({
    documentLoader,
    expectedHost: bedrock.config.server.host,
    async getRootController({req}) {
      // this will always be present based on where this middleware is used
      return req.serviceObject.config.controller;
    },
    getVerifier,
    inspectCapabilityChain,
    onError,
    suiteFactory
  });
}

// gets the service object config for the current request and caches it in
// `req.service.config`
export function createGetConfigMiddleware({service} = {}) {
  assert.object(service, 'service');
  return asyncHandler(async function _getConfig(req, res, next) {
    if(!req.serviceObject) {
      const id = getId({service, req});
      const {configStorage} = service;
      const {config} = await configStorage.get({id});

      // verify that request is from an IP that is allowed to access the config
      const {verified} = verifyRequestIp({config, req});
      if(!verified) {
        throw new BedrockError(
          'Permission denied. Source IP is not allowed.', 'NotAllowedError', {
            httpStatusCode: 403,
            public: true,
          });
      }

      req.serviceObject = {config, service};
    }
    next();
  });
}

// hook used to verify zcap invocation HTTP signatures
async function getVerifier({keyId, documentLoader}) {
  const key = await cryptoLd.fromKeyId({id: keyId, documentLoader});
  const verificationMethod = await key.export(
    {publicKey: true, includeContext: true});
  const verifier = key.verifier();
  return {verifier, verificationMethod};
}

async function inspectCapabilityChain({
  capabilityChain, capabilityChainMeta
}) {
  // if capability chain has only root, there's nothing to check as root
  // zcaps cannot be revoked
  if(capabilityChain.length === 1) {
    return {valid: true};
  }

  // collect capability IDs and delegators for all delegated capabilities in
  // chain (skip root) so they can be checked for revocation
  const capabilities = [];
  for(const [i, capability] of capabilityChain.entries()) {
    // skip root zcap, it cannot be revoked
    if(i === 0) {
      continue;
    }
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

function onError({error}) {
  // cause must be a public BedrockError to be surfaced to the HTTP client
  let cause;
  if(error instanceof BedrockError) {
    cause = error;
  } else {
    let details = {};
    if(error.details && error.details.public) {
      details = error.details;
    }
    cause = new BedrockError(
      error.message,
      error.name || 'NotAllowedError', {
        ...details,
        public: true,
      });
  }
  throw new BedrockError(
    'Authorization error.', 'NotAllowedError', {
      httpStatusCode: 403,
      public: true,
    }, cause);
}

// hook used to create suites for verifying zcap delegation chains
async function suiteFactory() {
  return new Ed25519Signature2020();
}

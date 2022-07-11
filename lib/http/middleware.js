/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as brZCapStorage from '@bedrock/zcap-storage';
import {
  authorizeZcapInvocation as _authorizeZcapInvocation,
  authorizeZcapRevocation as _authorizeZcapRevocation
} from '@digitalbazaar/ezcap-express';
import {getId, verifyRequestIp} from '../helpers.js';
import assert from 'assert-plus';
import {asyncHandler} from '@bedrock/express';
import {CryptoLD} from 'crypto-ld';
import {documentLoader} from '../documentLoader.js';
import {
  Ed25519Signature2020
} from '@digitalbazaar/ed25519-signature-2020';
import {
  Ed25519VerificationKey2020
} from '@digitalbazaar/ed25519-verification-key-2020';

const {util: {BedrockError}} = bedrock;

// for `getVerifier` hook for verifying zcap invocation HTTP signatures
const cryptoLd = new CryptoLD();
cryptoLd.use(Ed25519VerificationKey2020);

// authorizes a request using the enabled authz method that matches the
// authz method detected in the request
export function authorizeRequest({
  getExpectedValues, getRootController
} = {}) {
  const {authorization} = bedrock.config['service-core'];

  const authzMiddleware = {};
  if(authorization.zcap) {
    authzMiddleware.zcap = authorizeZcapInvocation({
      getExpectedValues, getRootController
    });
  }
  if(authorization.oauth2) {
    authzMiddleware.oauth2 = authorizeOAuth2AccessToken({
      getExpectedValues, getRootController
    });
  }

  return _useDetectedAuthzMethod({authzMiddleware});
}

export function authorizeConfigRequest({expectedAction} = {}) {
  return authorizeRequest({
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

// checks OAuth2 JWT access token against root controller and expected values
export function authorizeOAuth2AccessToken({
  getExpectedValues, getRootController
} = {}) {
  // FIXME: `getExpectedValues` must return audience and required scope(s)
  // ...
}

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

// creates middleware for service object config route zcap authz checks; keep
// this method only for backwards compatibility
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
  if(!(error instanceof BedrockError)) {
    // always expose cause message and name; expose cause details as
    // BedrockError if error is marked public
    let details = {};
    if(error.details && error.details.public) {
      details = error.details;
    }
    error = new BedrockError(
      error.message,
      error.name || 'NotAllowedError', {
        ...details,
        public: true,
      }, error);
  }
  throw new BedrockError(
    'Authorization error.', 'NotAllowedError', {
      httpStatusCode: 403,
      public: true,
    }, error);
}

// hook used to create suites for verifying zcap delegation chains
async function suiteFactory() {
  return new Ed25519Signature2020();
}

// create middleware that uses detected authz middleware
function _useDetectedAuthzMethod({authzMiddleware}) {
  return function useDetectedAuthzMethod(req, res, next) {
    const zcap = !!req.get('capability-invocation');
    const oauth2 = req.get('authorization')?.startsWith('Bearer ');
    if(zcap && oauth2) {
      return next(new BedrockError(
        'Only one authorization method is permitted per request.',
        'NotAllowedError', {
          httpStatusCode: 403,
          public: true,
        }));
    }

    // use middleware that matches authz method used in request
    let mw;
    if(zcap) {
      mw = authzMiddleware.zcap;
    } else if(isOAuth2) {
      mw = authzMiddleware.oauth2;
    }
    // ensure an authz middleware always executes, including in cases where
    // no authz method was used in request or where matching method is not
    // enabled
    mw = mw || authzMiddleware.zcap || authzMiddleware.oauth2;

    const middlewares = Array.isArray(mw) ? mw.slice() : mw;
    _invokeMiddlewares({req, res, next, middlewares});
  };
}

function _invokeMiddlewares({req, res, next, middlewares}) {
  if(!Array.isArray(middlewares)) {
    return middlewares(req, res, next);
  }
  if(middlewares.length === 1) {
    return middlewares[0](req, res, next);
  }
  const middleware = middlewares.shift();
  const localNext = (...args) => {
    if(args.length === 0) {
      return _invokeMiddlewares({req, res, next, middlewares});
    }
    next(...args);
  };
  middleware(req, res, localNext);
}

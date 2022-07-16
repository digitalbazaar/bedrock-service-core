/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
import cidrRegex from 'cidr-regex';

const controller = {
  title: 'controller',
  type: 'string',
  maxLength: 4096
};

const id = {
  title: 'id',
  type: 'string',
  maxLength: 4096
};

const ipAllowList = {
  type: 'array',
  minItems: 1,
  items: {
    type: 'string',
    // leading and trailing slashes in regex must be removed
    pattern: cidrRegex({exact: true}).toString().slice(1, -1),
  }
};

const meterId = {
  title: 'Meter ID',
  type: 'string',
  maxLength: 4096
};

const sequence = {
  title: 'sequence',
  type: 'integer',
  minimum: 0,
  maximum: Number.MAX_SAFE_INTEGER - 1
};

export const config = {
  title: 'Service Object Configuration',
  type: 'object',
  required: ['controller', 'meterId', 'sequence'],
  additionalProperties: false,
  properties: {
    // config for optional zcap-alternative authorization methods
    authorization: {
      title: 'Additional Authorization Configuration',
      type: 'object',
      // only `oauth2` is supported at this time
      required: ['oauth2'],
      additionalProperties: false,
      properties: {
        oauth2: {
          title: 'OAuth2 Authorization Configuration',
          type: 'object',
          required: ['issuerConfigUrl'],
          additionalProperties: false,
          properties: {
            // `oauth2` URL for authorization server metadata
            issuerConfigUrl: {
              title: 'Authorization Server Metadata URL',
              type: 'string',
              pattern: '\\/\\.well-known\\/([^\\/]+)',
              maxLength: 4096
            }
          }
        }
      }
    },
    controller,
    ipAllowList,
    meterId,
    sequence
  }
};
export const createConfigBody = {
  ...config,
  title: 'createConfigBody'
};

export const updateConfigBody = {
  title: 'updateConfigBody',
  type: 'object',
  additionalProperties: false,
  required: ['controller', 'id', 'meterId', 'sequence'],
  properties: {
    controller,
    id,
    ipAllowList,
    meterId,
    sequence
  }
};

export const getConfigsQuery = {
  title: 'Service Object Configuration Query',
  type: 'object',
  required: ['controller'],
  additionalProperties: false,
  properties: {
    controller
  }
};

export const delegatedZcap = {
  title: 'Delegated ZCAP',
  type: 'object',
  additionalProperties: false,
  required: [
    '@context', 'controller', 'expires', 'id', 'invocationTarget',
    'parentCapability', 'proof'
  ],
  properties: {
    controller,
    id,
    allowedAction: {
      anyOf: [{
        type: 'string'
      }, {
        type: 'array',
        minItems: 1,
        items: {type: 'string'}
      }]
    },
    expires: {
      // FIXME: w3c datetime
      title: 'expires',
      type: 'string'
    },
    '@context': {
      title: '@context',
      anyOf: [{
        type: 'string'
      }, {
        type: 'array',
        minItems: 1,
        items: {type: 'string'}
      }]
    },
    invocationTarget: {
      title: 'Invocation Target',
      type: 'string'
    },
    parentCapability: {
      title: 'Parent Capability',
      type: 'string'
    },
    proof: {
      title: 'Proof',
      type: 'object',
      additionalProperties: false,
      required: [
        'verificationMethod', 'type', 'created', 'proofPurpose',
        'capabilityChain', 'proofValue'
      ],
      properties: {
        verificationMethod: {
          title: 'verificationMethod',
          type: 'string'
        },
        type: {
          title: 'type',
          type: 'string'
        },
        created: {
          title: 'created',
          type: 'string'
        },
        proofPurpose: {
          title: 'proofPurpose',
          type: 'string'
        },
        capabilityChain: {
          title: 'capabilityChain',
          type: 'array',
          minItems: 1,
          items: {
            type: ['string', 'object']
          }
        },
        proofValue: {
          title: 'proofValue',
          type: 'string'
        },
      }
    }
  }
};
export const postRevocationBody = {...delegatedZcap};

export const zcaps = {
  title: 'ZCAPs',
  type: 'object',
  required: [],
  additionalProperties: false,
  // to be extended in `createService`
  properties: {}
};

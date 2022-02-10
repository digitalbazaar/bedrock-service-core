/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
const controller = {
  title: 'controller',
  type: 'string'
};

export const config = {
  title: 'Service Object Configuration',
  type: 'object',
  required: ['controller', 'sequence', 'meterId'],
  additionalProperties: true,
  properties: {
    id: {
      type: 'string'
    },
    controller: {
      type: 'string'
    },
    sequence: {
      type: 'integer',
      minimum: 0
    },
    meterId: {
      type: 'string'
    }
  }
};
export const postConfigBody = config;

export const getConfigsQuery = {
  title: 'Service Object Configuration Query',
  type: 'object',
  required: ['controller'],
  additionalProperties: false,
  properties: {
    controller: {
      type: 'string'
    }
  }
};

export const delegatedZcap = {
  title: 'delegatedZcap',
  type: 'object',
  additionalProperties: false,
  required: [
    '@context', 'controller', 'expires', 'id', 'invocationTarget',
    'parentCapability', 'proof'
  ],
  properties: {
    controller,
    id: {
      title: 'id',
      type: 'string'
    },
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

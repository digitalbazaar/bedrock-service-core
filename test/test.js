/*!
 * Copyright (c) 2022-2025 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import {createService, schemas} from '@bedrock/service-core';
import {asyncHandler} from '@bedrock/express';
import {getServiceIdentities} from '@bedrock/app-identity';
import {handlers} from '@bedrock/meter-http';
import {mockData} from './mocha/mock.data.js';
import '@bedrock/https-agent';
import '@bedrock/meter';
import '@bedrock/meter-usage-reporter';
import '@bedrock/server';

bedrock.events.on('bedrock.init', async () => {
  /* Handlers need to be added before `bedrock.start` is called. These are
  no-op handlers to enable meter usage without restriction */
  handlers.setCreateHandler({
    handler({meter} = {}) {
      // use configured meter usage reporter as service ID for tests
      const clientName = mockData.productIdMap.get(meter.product.id);
      const serviceIdentites = getServiceIdentities();
      const serviceIdentity = serviceIdentites.get(clientName);
      if(!serviceIdentity) {
        throw new Error(`Could not find identity "${clientName}".`);
      }
      meter.serviceId = serviceIdentity.id;
      return {meter};
    }
  });
  handlers.setUpdateHandler({handler: ({meter} = {}) => ({meter})});
  handlers.setRemoveHandler({handler: ({meter} = {}) => ({meter})});
  handlers.setUseHandler({handler: ({meter} = {}) => ({meter})});

  // create `example` service
  /*const service =*/await createService({
    serviceType: 'example',
    routePrefix: '/examples',
    storageCost: {
      config: 1,
      revocation: 1
    }
  });

  // create `alternative` service that allows the client to provide IDs
  const alternativeCreateConfigBody = structuredClone(schemas.createConfigBody);
  alternativeCreateConfigBody.properties.id =
    schemas.updateConfigBody.properties.id;
  const alternativeService = await createService({
    serviceType: 'alternative',
    routePrefix: '/alternatives',
    storageCost: {
      config: 1,
      revocation: 1
    },
    validation: {
      createConfigBody: alternativeCreateConfigBody
    }
  });

  bedrock.events.on('bedrock-express.configure.routes', app => {
    app.post('/test-get-usage', asyncHandler(async (req, res) => {
      const {meterId} = req.body;
      const configIds = [];
      const usage = await alternativeService.configStorage.getUsage({
        meterId,
        signal: new AbortController().signal,
        async addUsage({config, usage}) {
          usage.storage += 100;
          configIds.push(config.id);
        }
      });
      res.json({usage, configIds});
    }));
  });
});

// mock oauth2 authz server routes
bedrock.events.on('bedrock-express.configure.routes', app => {
  app.get(mockData.oauth2IssuerConfigRoute, (req, res) => {
    res.json(mockData.oauth2Config);
  });
  app.get('/oauth2/jwks', (req, res) => {
    res.json(mockData.jwks);
  });
});

import '@bedrock/test';
bedrock.start();

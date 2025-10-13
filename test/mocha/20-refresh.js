/*!
 * Copyright (c) 2019-2025 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as helpers from './helpers.js';
import {CapabilityAgent} from '@digitalbazaar/webkms-client';
import {mockData} from './mock.data.js';

describe('bedrock-service-core refresh feature', () => {
  let capabilityAgent;
  before(async () => {
    const secret = '53ad64ce-8e1d-11ec-bb12-10bf48838a41';
    const handle = 'test';
    capabilityAgent = await CapabilityAgent.fromSecret({secret, handle});
  });
  it('should find a config to refresh', async () => {
    // function to be called when refreshing the created config
    const configId = `${mockData.baseUrl}/refreshables/${crypto.randomUUID()}`;
    const configRefreshPromise = new Promise(resolve =>
      mockData.refreshHandlerListeners.set(
        configId, ({record}) => resolve(record)));

    const expectedAfter = Date.now() + bedrock.config['service-core']
      .configStorage.refresh.isolateTimeout;

    let err;
    let result;
    try {
      const {id: meterId} = await helpers.createMeter({
        capabilityAgent, serviceName: 'refreshing'
      });
      result = await helpers.createConfig({
        capabilityAgent, meterId, servicePath: '/refreshables',
        options: {id: configId}
      });
    } catch(e) {
      err = e;
    }
    assertNoError(err);
    should.exist(result);
    result.should.have.keys([
      'controller', 'id', 'sequence', 'meterId'
    ]);
    result.sequence.should.equal(0);
    const {id: capabilityAgentId} = capabilityAgent;
    result.controller.should.equal(capabilityAgentId);

    // wait for refresh promise to resolve
    const record = await configRefreshPromise;
    record.config.id.should.equal(configId);
    record.config.sequence.should.equal(0);
    record.meta.refresh.enabled.should.equal(true);
    record.meta.refresh.after.should.be.gte(expectedAfter);
  });
  it('should refresh a config', async () => {
    // function to be called when refreshing the created config
    const expectedAfter = Date.now() + 987654321;
    const configId = `${mockData.baseUrl}/refreshables/${crypto.randomUUID()}`;
    const configRefreshPromise = new Promise(resolve =>
      mockData.refreshHandlerListeners.set(configId, async ({record}) => {
        // update record
        await mockData.refreshingService.configStorage.update({
          config: {...record.config, sequence: record.config.sequence + 1},
          refresh: {
            enabled: true,
            after: expectedAfter
          }
        });
        resolve(mockData.refreshingService.configStorage.get({id: configId}));
      }));

    let err;
    let result;
    try {
      const {id: meterId} = await helpers.createMeter({
        capabilityAgent, serviceName: 'refreshing'
      });
      result = await helpers.createConfig({
        capabilityAgent, meterId, servicePath: '/refreshables',
        options: {id: configId}
      });
    } catch(e) {
      err = e;
    }
    assertNoError(err);
    should.exist(result);
    result.should.have.keys([
      'controller', 'id', 'sequence', 'meterId'
    ]);
    result.sequence.should.equal(0);
    const {id: capabilityAgentId} = capabilityAgent;
    result.controller.should.equal(capabilityAgentId);

    // wait for refresh promise to resolve
    const record = await configRefreshPromise;
    record.config.id.should.equal(configId);
    record.config.sequence.should.equal(1);
    record.meta.refresh.enabled.should.equal(true);
    record.meta.refresh.after.should.equal(expectedAfter);
  });
  it('should fail to refresh a config', async () => {
    // function to be called when refreshing the created config
    const expectedAfter = Date.now() + bedrock.config['service-core']
      .configStorage.refresh.isolateTimeout;
    const notExpectedAfter = Date.now() + 987654321;
    const configId = `${mockData.baseUrl}/refreshables/${crypto.randomUUID()}`;
    const configRefreshPromise = new Promise(resolve =>
      mockData.refreshHandlerListeners.set(configId, async ({record}) => {
        // update record
        try {
          await mockData.refreshingService.configStorage.update({
            // use same sequence to trigger error
            config: {...record.config, sequence: record.config.sequence},
            refresh: {
              enabled: true,
              after: notExpectedAfter
            }
          });
        } catch(e) {
          resolve(record);
          throw e;
        }
        // should not happen because `update` must throw
        resolve(false);
      }));

    let err;
    let result;
    try {
      const {id: meterId} = await helpers.createMeter({
        capabilityAgent, serviceName: 'refreshing'
      });
      result = await helpers.createConfig({
        capabilityAgent, meterId, servicePath: '/refreshables',
        options: {id: configId}
      });
    } catch(e) {
      err = e;
    }
    assertNoError(err);
    should.exist(result);
    result.should.have.keys([
      'controller', 'id', 'sequence', 'meterId'
    ]);
    result.sequence.should.equal(0);
    const {id: capabilityAgentId} = capabilityAgent;
    result.controller.should.equal(capabilityAgentId);

    // wait for refresh promise to resolve
    const record = await configRefreshPromise;
    record.config.id.should.equal(configId);
    record.config.sequence.should.equal(0);
    record.meta.refresh.enabled.should.equal(true);
    record.meta.refresh.after.should.not.equal(notExpectedAfter);
    record.meta.refresh.after.should.be.gte(expectedAfter);
  });
});

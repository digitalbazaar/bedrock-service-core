/*!
 * Copyright (c) 2025 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as helpers from './helpers.js';
import {CapabilityAgent} from '@digitalbazaar/webkms-client';
import sinon from 'sinon';

// get logger for spying - using the package path since tests run from test dir
import {logger} from '@bedrock/service-core/lib/logger.js';

describe('zcap expiration logging', function() {
  let capabilityAgent;
  let capabilityAgent2;

  before(async () => {
    const secret = '53ad64ce-8e1d-11ec-bb12-10bf48838a41';
    const handle = 'test';
    capabilityAgent = await CapabilityAgent.fromSecret({secret, handle});

    capabilityAgent2 = await CapabilityAgent.fromSecret({
      secret: 's2', handle: 'h2'
    });
  });

  describe('near-expiration logging', () => {
    let loggerWarningSpy;
    let loggerErrorSpy;

    beforeEach(() => {
      loggerWarningSpy = sinon.spy(logger, 'warning');
      loggerErrorSpy = sinon.spy(logger, 'error');
    });

    afterEach(() => {
      loggerWarningSpy.restore();
      loggerErrorSpy.restore();
    });

    it('logs warning when zcap is near expiration', async () => {
      const config = await helpers.createConfig({capabilityAgent});

      // delegate a zcap that expires in 1 hour (within default 7 day threshold)
      const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
      const zcap = await helpers.delegate({
        controller: capabilityAgent2.id,
        invocationTarget: config.id,
        delegator: capabilityAgent,
        expires: oneHourFromNow.toISOString().slice(0, -5) + 'Z'
      });

      // use the delegated zcap
      const zcapClient = helpers.createZcapClient({
        capabilityAgent: capabilityAgent2
      });

      let err;
      try {
        await zcapClient.read({capability: zcap});
      } catch(e) {
        err = e;
      }
      assertNoError(err);

      // verify warning was logged
      loggerWarningSpy.called.should.equal(true);
      const warningCall = loggerWarningSpy.getCall(0);
      warningCall.args[0].should.equal('Zcap is near expiration.');
      const logData = warningCall.args[1];
      logData.should.have.property('logName', 'zcap-expiration');
      logData.should.have.property('event', 'zcap-near-expiration');
      logData.should.have.property('capabilityId');
      logData.should.have.property('invocationTarget');
      logData.should.have.property('expires');
      logData.should.have.property('timeUntilExpirationMs');
      logData.should.have.property('thresholdMs');
      logData.timeUntilExpirationMs.should.be.a('number');
      logData.timeUntilExpirationMs.should.be.above(0);
    });

    it('does not log when zcap is not near expiration', async () => {
      const config = await helpers.createConfig({capabilityAgent});

      // delegate a zcap that expires in 30 days (outside default 7 day
      // threshold)
      const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const zcap = await helpers.delegate({
        controller: capabilityAgent2.id,
        invocationTarget: config.id,
        delegator: capabilityAgent,
        expires: thirtyDaysFromNow.toISOString().slice(0, -5) + 'Z'
      });

      // use the delegated zcap
      const zcapClient = helpers.createZcapClient({
        capabilityAgent: capabilityAgent2
      });

      let err;
      try {
        await zcapClient.read({capability: zcap});
      } catch(e) {
        err = e;
      }
      assertNoError(err);

      // verify no warning was logged
      loggerWarningSpy.called.should.equal(false);
      loggerErrorSpy.called.should.equal(false);
    });

    // Note: Testing already-expired zcaps is not possible because the zcap
    // library validates expiration at delegation time and refuses to create
    // expired zcaps. The expired zcap logging will be triggered when a zcap
    // that was valid at delegation time has since expired. This scenario
    // occurs in real-world usage when zcaps are used after their TTL has
    // passed, but cannot be easily simulated in tests without mocking time.
  });

  describe('configuration options', () => {
    let loggerWarningSpy;
    let loggerErrorSpy;
    let originalConfig;

    beforeEach(() => {
      loggerWarningSpy = sinon.spy(logger, 'warning');
      loggerErrorSpy = sinon.spy(logger, 'error');
      // save original config
      originalConfig = {...bedrock.config['service-core'].zcapExpiration};
    });

    afterEach(() => {
      loggerWarningSpy.restore();
      loggerErrorSpy.restore();
      // restore original config
      bedrock.config['service-core'].zcapExpiration = originalConfig;
    });

    it('respects custom logName for alerting', async () => {
      // set custom log name
      bedrock.config['service-core'].zcapExpiration.logName =
        'custom-zcap-alert';

      const config = await helpers.createConfig({capabilityAgent});

      // delegate a zcap that expires in 1 hour
      const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
      const zcap = await helpers.delegate({
        controller: capabilityAgent2.id,
        invocationTarget: config.id,
        delegator: capabilityAgent,
        expires: oneHourFromNow.toISOString().slice(0, -5) + 'Z'
      });

      const zcapClient = helpers.createZcapClient({
        capabilityAgent: capabilityAgent2
      });

      let err;
      try {
        await zcapClient.read({capability: zcap});
      } catch(e) {
        err = e;
      }
      assertNoError(err);

      // verify custom log name was used
      loggerWarningSpy.called.should.equal(true);
      const logData = loggerWarningSpy.getCall(0).args[1];
      logData.should.have.property('logName', 'custom-zcap-alert');
    });

    it('respects custom threshold for near-expiration', async () => {
      // set threshold to 1 day
      bedrock.config['service-core'].zcapExpiration.logNearExpiration = {
        threshold: 24 * 60 * 60 * 1000 // 1 day
      };

      const config = await helpers.createConfig({capabilityAgent});

      // delegate a zcap that expires in 2 days (outside 1 day threshold)
      const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      const zcap = await helpers.delegate({
        controller: capabilityAgent2.id,
        invocationTarget: config.id,
        delegator: capabilityAgent,
        expires: twoDaysFromNow.toISOString().slice(0, -5) + 'Z'
      });

      const zcapClient = helpers.createZcapClient({
        capabilityAgent: capabilityAgent2
      });

      let err;
      try {
        await zcapClient.read({capability: zcap});
      } catch(e) {
        err = e;
      }
      assertNoError(err);

      // no warning should be logged (outside threshold)
      loggerWarningSpy.called.should.equal(false);
    });

    it('disables near-expiration logging when set to false', async () => {
      // disable near-expiration logging
      bedrock.config['service-core'].zcapExpiration.logNearExpiration = false;

      const config = await helpers.createConfig({capabilityAgent});

      // delegate a zcap that expires in 1 hour
      const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
      const zcap = await helpers.delegate({
        controller: capabilityAgent2.id,
        invocationTarget: config.id,
        delegator: capabilityAgent,
        expires: oneHourFromNow.toISOString().slice(0, -5) + 'Z'
      });

      const zcapClient = helpers.createZcapClient({
        capabilityAgent: capabilityAgent2
      });

      let err;
      try {
        await zcapClient.read({capability: zcap});
      } catch(e) {
        err = e;
      }
      assertNoError(err);

      // no warning should be logged
      loggerWarningSpy.called.should.equal(false);
    });

    // Note: Testing disabled expired zcap logging is not possible because the
    // zcap library validates expiration at delegation time. See note above.
  });
});

/*!
 * Copyright (c) 2025 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import {logger} from '../logger.js';
import {rangeDelay} from 'delay';

export class ConfigRefresher {
  constructor({configStorage, refreshHandler} = {}) {
    this.abortController = new AbortController();
    this.configStorage = configStorage;
    this.refreshHandler = refreshHandler;
    // a promise that resolves when the refresher has shutdown cleanly after
    // receiving an abort signal
    this.shutdownPromise = null;
    this._schedule();
  }

  async _getRefreshableRecord() {
    // return a refreshable config record that is ready to be refreshed
    const collection = this.configStorage._getCollection();
    const projection = {config: 1, meta: 1};
    const now = Date.now();
    return collection.findOne({
      'meta.refresh.enabled': true,
      'meta.refresh.after': {$lt: now}
    }, {projection});
  }

  async _markRecord({record}) {
    // try to mark record by extending `after` time based on configured
    // `isolateTime`
    const {
      refresh: {isolateTimeout}
    } = bedrock.config['service-core'].configStorage;
    const now = Date.now();
    const after = isolateTimeout;
    const collection = this.configStorage._getCollection();
    // only perform the update if the config hasn't changed:
    const {result} = await collection.updateOne({
      'config.id': record.config.id,
      'config.sequence': record.config.sequence,
      'meta.refresh.after': record.meta.refresh.after
    }, {
      $set: {'meta.refresh.after': after, 'meta.updated': now}
    });
    // return `true` only if record was updated
    return result.n === 1;
  }

  _schedule() {
    const {serviceType: name} = this.configStorage;

    bedrock.events.on('bedrock.ready', () => {
      // start the refresher which runs continuously
      // FIXME: run based on configuration (allow disabling via config)
      this.shutdownPromise = this._start();
    });

    bedrock.events.on('bedrock.exit', async () => {
      try {
        // abort refresh job
        this.abortController.abort();
        logger.debug(
          `Sent abort signal to config record refresher for "${name}"; ` +
          'awaiting shutdown...');
        await this.shutdownPromise;
        logger.debug(
          `Shutdown of config record refresher for "${name}" was successful.`);
      } catch(error) {
        logger.error(
          `Error during config record refresher shutdown for "${name}".`,
          {error});
      }
    });
  }

  async _start() {
    const {serviceType: name} = this.configStorage;
    const {refresh: {interval}} = bedrock.config['service-core'].configStorage;
    const {signal} = this.abortController;
    while(!signal.aborted) {
      try {
        // refresh an eligible config record
        if(await this._refreshOne()) {
          continue;
        }
        // no refreshable record found, so delay for `interval` plus some
        // fuzzing (up to 5 minutes) to help reduce the number of conflicting
        // updates from concurrent processes
        await rangeDelay(interval, interval + 5 * 60000, {signal});
      } catch(error) {
        if(error.name === 'AbortError') {
          break;
        }
        logger.error(
          `Error during config record refresh for "${name}".`, {error});
      }
    }
  }

  async _refreshOne() {
    /* Find a config record that is eligible to refresh. A config record is
    eligible for refreshing if it has:

    1. `meta.refresh.enabled = true`, AND
    2. `meta.refresh.after` is in the past.

    If an eligible record is not found, return `false`. If one is found, then
    attempt to isolate the record by marking it as ineligible for a short
    period of time. If the record is successfully marked, the specified
    `refresh` handler will be run to refresh the record. The handler is
    then responsible for updating the config record itself.

    If trying to find an eligible record, marking the record, or calling the
    handler results in an unexpected error, the error will be logged and
    treated as if no eligible records were found as a signal to reschedule the
    refresh job. This can be helpful in mitigating hard loops in the case that
    there are temporary database or network connectivity issues. If the error
    is a possible expected error (i.e., an update conflict error from a
    concurrent process changing the record), this error will be ignored.

    In the absence of unexpected errors, the process will then always return
    `true` to signal that at least one eligible record found, so that the
    refresh job will continue to look for more records to refresh.

    Note: The config record collection may be sharded based on config ID. This
    rules out another approach to this problem where an update query is sent to
    mark record(s) for refresh instead of grabbing one and then trying to mark
    it. This is because an efficient `update` query needs to include the shard
    key, but the required query would not include it and it woul not be known
    after the update in order to efficiently retrieve any marked records. */
    const {serviceType: name} = this.configStorage;
    let record;
    let marked;
    try {
      record = await this._getRefreshableRecord();
      if(!record) {
        // no eligible records to refresh at this time
        return false;
      }
      marked = await this._markRecord({record});
      if(marked) {
        // attempt record refresh
        await this.refreshHandler({record});
      }
    } catch(error) {
      if(error.name !== 'InvalidStateError') {
        logger.error(
          `Error during config record refresh for "${name}".`, {error});
      }
      // treat arbitrary failures as "no records" found case to cause refresh
      // job to wait for rescheduling (in order to prevent hard loops during
      // database / network connection outages)
      return false;
    }

    // no unexpected errors and at least one record found
    return true;
  }
}

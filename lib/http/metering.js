/*!
 * Copyright (c) 2019-2026 Digital Bazaar, Inc.
 */
import {logger} from '../logger.js';
import {meters} from '@bedrock/meter-usage-reporter';

export function reportOperationUsage({req, operations = 1, storage = 0} = {}) {
  // do not wait for usage to be reported
  const {config, config: {meterId: id}} = req.serviceObject;
  meters.use({id, operations, storage}).catch(
    error => logger.error(
      `Meter (${id}) usage error for service object "${config.id}".`,
      {error}));
}

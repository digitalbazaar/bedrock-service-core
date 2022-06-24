/*!
 * Copyright (c) 2019-2022 Digital Bazaar, Inc. All rights reserved.
 */
import {logger} from '../logger.js';
import {meters} from '@bedrock/meter-usage-reporter';

export function reportOperationUsage({req}) {
  // do not wait for usage to be reported
  const {config, config: {meterId: id}} = req.serviceObject;
  meters.use({id, operations: 1}).catch(
    error => logger.error(
      `Meter (${id}) usage error for service object "${config.id}".`,
      {error}));
}

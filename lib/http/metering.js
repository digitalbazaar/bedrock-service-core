/*!
 * Copyright (c) 2019-2022 Digital Bazaar, Inc. All rights reserved.
 */
const {meters} = require('bedrock-meter-usage-reporter');
const logger = require('../logger.js');

export function reportOperationUsage({req}) {
  // do not wait for usage to be reported
  const {config, config: {meterId: id}} = req.serviceObject;
  meters.use({id, operations: 1}).catch(
    error => logger.error(
      `Meter (${id}) usage error for service object "${config.id}".`,
      {error}));
}

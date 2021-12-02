/*!
 * Copyright (c) 2021 Digital Bazaar, Inc. All rights reserved.
 */
import assert from 'assert-plus';
import bedrock from 'bedrock';
import forwarded from 'forwarded';
import {generateId, decodeId} from 'bnid';
import {logger} from './logger.js';
import {meters} from 'bedrock-meter-usage-reporter';
import {Netmask} from 'netmask';

const {config, util: {BedrockError}} = bedrock;

// get a fully qualified service object ID from a `service` and `req` OR
// from a `routePrefix` and `localId`
export function getId({service, req, routePrefix, localId} = {}) {
  let invalid;
  if(service || req) {
    assert.object(service, 'service');
    assert.object(req, 'req');
    if(routePrefix || localId) {
      invalid = true;
    } else {
      ({routePrefix} = service);
      ({localId} = req.params);
    }
  } else if(routePrefix || localId) {
    assert.string(routePrefix, 'routePrefix');
    assert.string(localId, 'localId');
    invalid = routePrefix || localId;
  } else {
    invalid = true;
  }
  if(invalid) {
    throw new TypeError(
      '"service" and "req" must be given OR "routePrefix" and "localId"; ' +
      'not both.');
  }
  const {baseUri} = config.server;
  return `${baseUri}${routePrefix}/${localId}`;
}

export async function generateRandom() {
  // 128-bit random number, base58 multibase + multihash encoded
  return generateId({
    bitLength: 128,
    encoding: 'base58',
    multibase: true,
    multihash: true
  });
}

export function reportOperationUsageWithoutWaiting({id, meterId} = {}) {
  // do not await
  _reportOperationUsage({id, meterId}).catch();
}

export function parseLocalId({id} = {}) {
  // format: <base>/<localId>
  const idx = id.lastIndexOf('/');
  const localId = id.substr(idx + 1);
  return {
    base: id.substring(0, idx),
    localId: exports.decodeLocalId({localId})
  };
}

export function decodeLocalId({localId} = {}) {
  // convert to `Buffer` for database storage savings
  return Buffer.from(decodeId({
    id: localId,
    encoding: 'base58',
    multibase: true,
    multihash: true,
    expectedSize: 16
  }));
};

export function verifyRequestIp({config, req}) {
  const {ipAllowList} = config;
  if(!ipAllowList) {
    return {verified: true};
  }

  // the first IP in the sourceAddresses array will *always* be the IP
  // reported by Express.js via `req.connection.remoteAddress`. Any additional
  // IPs will be from the `x-forwarded-for` header.
  const sourceAddresses = forwarded(req);

  // ipAllowList is an array of CIDRs
  for(const cidr of ipAllowList) {
    const netmask = new Netmask(cidr);
    for(const address of sourceAddresses) {
      if(netmask.contains(address)) {
        return {verified: true};
      }
    }
  }

  return {verified: false};
};

async function _reportOperationUsage({id, meterId}) {
  try {
    await meters.use({id: meterId, operations: 1});
  } catch(error) {
    let message = 'Meter ';
    if(meterId) {
      message += `(${meterId}) `;
    }
    message += `usage error for service object "${id}".`;
    logger.error(message, {error});
  }
}

/*!
 * Copyright (c) 2021-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import {decodeId, generateId} from 'bnid';
import assert from 'assert-plus';
import forwarded from 'forwarded';
import ipaddr from 'ipaddr.js';

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
    invalid = !(routePrefix && localId);
  } else {
    invalid = true;
  }
  if(invalid) {
    throw new TypeError(
      '"service" and "req" must be given OR "routePrefix" and "localId"; ' +
      'not both.');
  }
  const {baseUri} = bedrock.config.server;
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

export function parseLocalId({id} = {}) {
  // format: <base>/<localId>
  const idx = id.lastIndexOf('/');
  const localId = id.substr(idx + 1);
  return {
    base: id.substring(0, idx),
    localId: decodeLocalId({localId})
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
}

export function verifyRequestIp({config, req}) {
  // skip check if no IP allow list configured
  const {ipAllowList} = config;
  if(!ipAllowList) {
    return {verified: true};
  }

  // the first IP in the sourceAddresses array will *always* be the IP
  // reported by Express.js via `req.connection.remoteAddress`. Any additional
  // IPs will be from the `x-forwarded-for` header.
  const sourceAddresses = forwarded(req);

  // build list of allowed IP ranges from IPv4/IPv6 CIDRs
  const ipAllowRangeList = {
    allow: ipAllowList.map(cidr => ipaddr.parseCIDR(cidr))
  };

  // check if any source address allowed
  const verified = sourceAddresses.some(address => {
    const ip = ipaddr.parse(address);
    // check if in allow list, else deny
    return ipaddr.subnetMatch(ip, ipAllowRangeList, 'deny') === 'allow';
  });

  return {verified};
}

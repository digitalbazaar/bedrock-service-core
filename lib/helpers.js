/*!
 * Copyright (c) 2021 Digital Bazaar, Inc. All rights reserved.
 */
import base58 from 'base58-universal';
import bedrock from 'bedrock';
import crypto from 'crypto';
import {logger} from './logger.js';
import {meters} from 'bedrock-meter-usage-reporter';
import {promisify} from 'util';
const getRandomBytes = promisify(crypto.randomBytes);
const {config, util: {BedrockError}} = bedrock;

export function assert128BitId(id) {
  try {
    // verify ID is base58-encoded multibase multicodec encoded 16 bytes
    const buf = base58.decode(id.substr(1));
    // multibase base58 (starts with 'z')
    // 128-bit random number, multicodec encoded
    // 0x00 = identity tag, 0x10 = length (16 bytes) + 16 random bytes
    if(!(id.startsWith('z') &&
      buf.length === 18 && buf[0] === 0x00 && buf[1] === 0x10)) {
      throw new Error('Invalid identifier.');
    }
  } catch(e) {
    throw new BedrockError(
      `Identifier "${id}" must be base58-encoded multibase, ` +
      'multicodec array of 16 random bytes.',
      'SyntaxError',
      {public: true, httpStatusCode: 400});
  }
}

export function getId({routePrefix, localId} = {}) {
  exports.assert128BitId(localId);
  const {baseUri} = config.server;
  return `${baseUri}${routePrefix}/${localId}`;
}

export async function generateRandom() {
  // FIXME: use bnid w/multihash encoding?

  // 128-bit random number, multibase encoded
  // 0x00 = identity tag, 0x10 = length (16 bytes)
  const buf = Buffer.concat([
    Buffer.from([0x00, 0x10]),
    await getRandomBytes(16)
  ]);
  // multibase encoding for base58 starts with 'z'
  return `z${base58.encode(buf)}`;
}

export function reportOperationUsageWithoutWaiting({id} = {}) {
  // do not await
  _reportOperationUsage({id}).catch();
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
  // convert to `Buffer` for storage savings (`z<base58-encoded ID>`)
  // where the ID is multicodec encoded 16 byte random value
  // 0x00 = identity tag, 0x10 = length (16 bytes) header
  return Buffer.from(base58.decode(localId.slice(1)).slice(2));
};

async function _reportOperationUsage({id}) {
  let meterId;
  try {
    const {config} = await instances.get({id});
    meterId = config.meterId;
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

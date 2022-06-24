/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
import {documentLoader as brDocumentLoader}
  from '@bedrock/jsonld-document-loader';
import {didIo} from '@bedrock/did-io';

import '@bedrock/did-context';
import '@bedrock/security-context';
import '@bedrock/veres-one-context';

// load config defaults
import './config.js';

export async function documentLoader(url) {
  if(url.startsWith('did:')) {
    const document = await didIo.get({did: url});
    return {
      contextUrl: null,
      documentUrl: url,
      document
    };
  }

  // finally, try the bedrock document loader
  return brDocumentLoader(url);
}

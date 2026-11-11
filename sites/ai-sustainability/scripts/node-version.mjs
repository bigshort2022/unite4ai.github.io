#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

const SUPPORTED_NODE_MAJOR = 24;

export function supportsNodeVersion(version) {
  const match = /^v(\d+)\.\d+\.\d+$/.exec(version);
  return match !== null && Number(match[1]) === SUPPORTED_NODE_MAJOR;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!supportsNodeVersion(process.version)) {
    console.error(`Node.js 24 is required; found ${process.version}.`);
    process.exitCode = 1;
  }
}

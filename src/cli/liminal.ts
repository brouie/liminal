#!/usr/bin/env node
/**
 * Liminal CLI - minimal entrypoint using the Public Submission API.
 *
 * Commands:
 *  - liminal submit <tx.json>   (expects { "txId": "..." })
 *  - liminal status <txId>
 *  - liminal receipt <txId>
 *
 * Production-oriented defaults:
 *  - LIMINAL_ENV defaults to "production" if unset.
 *  - Uses production pipeline and persistence (no mocks).
 */

import { readFileSync } from 'fs';
import path from 'path';
import {
  submitTransaction,
  getTransactionStatus,
  getReceipt,
} from '../main/api';

// Default to production unless explicitly overridden
if (!process.env.LIMINAL_ENV && !process.env.NODE_ENV) {
  process.env.LIMINAL_ENV = 'production';
}

function print(obj: unknown) {
  console.log(JSON.stringify(obj, null, 2));
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function handleSubmit(filePath: string) {
  if (!filePath) fail('Usage: liminal submit <tx.json>');
  const resolved = path.resolve(process.cwd(), filePath);
  let parsed: any;
  try {
    const content = readFileSync(resolved, 'utf-8');
    parsed = JSON.parse(content);
  } catch (err: any) {
    fail(`Unable to read tx file: ${err?.message ?? String(err)}`);
  }
  const txId = parsed.txId;
  if (!txId || typeof txId !== 'string') {
    fail('tx.json must include a string "txId" field');
  }
  const result = await submitTransaction(txId);
  print(result);
}

function handleStatus(txId: string) {
  if (!txId) fail('Usage: liminal status <txId>');
  const result = getTransactionStatus(txId);
  print(result);
}

function handleReceipt(txId: string) {
  if (!txId) fail('Usage: liminal receipt <txId>');
  const result = getReceipt(txId);
  print(result);
}

async function main() {
  const [, , cmd, arg] = process.argv;
  switch (cmd) {
    case 'submit':
      await handleSubmit(arg);
      break;
    case 'status':
      handleStatus(arg);
      break;
    case 'receipt':
      handleReceipt(arg);
      break;
    default:
      fail('Usage: liminal <submit|status|receipt> <arg>');
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

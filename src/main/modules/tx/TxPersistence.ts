/**
 * TxPersistence - simple file-backed snapshot store for transactions.
 *
 * Minimal, deterministic persistence for Phase 4.0 restart safety.
 * Only stores TxObject snapshots; does NOT modify policy, gates, or submission logic.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { TxObject } from '../../../shared/tx-types';
import { isProd } from '../../config/env';

export interface TxPersistenceSnapshot {
  transactions: TxObject[];
}

class TxPersistence {
  private readonly dataDir: string;
  private readonly filePath: string;

  constructor() {
    // In prod, prefer Electron userData; in dev/test or when Electron unavailable, use cwd/data.
    let electronApp: any = undefined;
    if (isProd()) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        electronApp = require('electron').app;
      } catch {
        electronApp = undefined;
      }
    }

    const baseDir =
      isProd() && electronApp?.getPath
        ? join(electronApp.getPath('userData'), 'tx-store')
        : join(process.cwd(), 'data');
    this.dataDir = baseDir;
    this.filePath = join(baseDir, 'tx-store.json');
    this.ensureDir();
  }

  private ensureDir() {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  save(snapshot: TxPersistenceSnapshot): void {
    this.ensureDir();
    writeFileSync(this.filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
  }

  load(): TxPersistenceSnapshot | null {
    if (!existsSync(this.filePath)) return null;
    try {
      const content = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(content) as TxPersistenceSnapshot;
      if (!parsed.transactions || !Array.isArray(parsed.transactions)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  clear(): void {
    if (existsSync(this.filePath)) {
      rmSync(this.filePath);
    }
  }
}

let instance: TxPersistence | null = null;

export function getTxPersistence(): TxPersistence {
  if (!instance) {
    instance = new TxPersistence();
  }
  return instance;
}

export function resetTxPersistence(): void {
  instance = null;
}

export function clearTxPersistenceStore(): void {
  const inst = getTxPersistence();
  inst.clear();
}

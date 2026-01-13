/**
 * TxAuditLogger - structured, deterministic audit logs for submission lifecycle.
 *
 * Minimal in-memory logger; no side effects beyond recording in-process events.
 * Stages covered: create → dry-run → sign → submit → confirm/fail.
 */

import { TxState } from '../../../shared/tx-types';

export type AuditStage =
  | 'CREATE'
  | 'DRY_RUN_COMPLETE'
  | 'SIGN_COMPLETE'
  | 'SUBMIT_ATTEMPT'
  | 'SUBMIT_CONFIRMED'
  | 'SUBMIT_FAILED';

export interface AuditLogEntry {
  txId: string;
  contextId: string;
  phase: 'PHASE_4.0';
  stage: AuditStage;
  state: TxState;
  timestamp: number;
}

class TxAuditLogger {
  private logs: AuditLogEntry[] = [];

  record(entry: Omit<AuditLogEntry, 'timestamp' | 'phase'>): void {
    const log: AuditLogEntry = {
      ...entry,
      phase: 'PHASE_4.0',
      timestamp: Date.now(),
    };
    this.logs.push(log);
  }

  getLogs(txId?: string): AuditLogEntry[] {
    if (!txId) return [...this.logs];
    return this.logs.filter(l => l.txId === txId);
  }

  clear(): void {
    this.logs = [];
  }
}

let auditLoggerInstance: TxAuditLogger | null = null;

export function getTxAuditLogger(): TxAuditLogger {
  if (!auditLoggerInstance) {
    auditLoggerInstance = new TxAuditLogger();
  }
  return auditLoggerInstance;
}

export function resetTxAuditLogger(): void {
  auditLoggerInstance = null;
}

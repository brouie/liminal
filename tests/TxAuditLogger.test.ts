import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTxPipeline, resetTxPipeline, getTxAuditLogger, resetTxAuditLogger } from '../src/main/modules/tx';
import { TxState, SimulatedTxPayload } from '../src/shared/tx-types';

const payload: SimulatedTxPayload = {
  programId: 'prog',
  instructionData: '00',
  instructionCount: 1,
  accounts: [],
  estimatedAmount: 0,
  origin: 'test-origin',
};

describe('TxAuditLogger', () => {
  beforeEach(() => {
    resetTxAuditLogger();
    resetTxPipeline();
  });

  afterEach(() => {
    resetTxAuditLogger();
    resetTxPipeline();
  });

  it('records CREATE stage when transaction is created', () => {
    const pipeline = getTxPipeline();
    const logger = getTxAuditLogger();

    const tx = pipeline.createTransaction('ctx-audit', payload);

    const logs = logger.getLogs(tx.txId);
    expect(logs.length).toBeGreaterThan(0);
    const createLog = logs.find(l => l.stage === 'CREATE');
    expect(createLog).toBeDefined();
    if (createLog) {
      expect(createLog.txId).toBe(tx.txId);
      expect(createLog.contextId).toBe(tx.contextId);
      expect(createLog.state).toBe(TxState.TX_NEW);
      expect(createLog.phase).toBe('PHASE_4.0');
    }
  });

  it('stores structured entries for submission stages', () => {
    const logger = getTxAuditLogger();
    logger.record({
      stage: 'SUBMIT_CONFIRMED',
      txId: 'tx-log-test',
      contextId: 'ctx-log',
      state: TxState.TX_CONFIRMED,
    });

    const logs = logger.getLogs('tx-log-test');
    expect(logs.length).toBe(1);
    const entry = logs[0];
    expect(entry.stage).toBe('SUBMIT_CONFIRMED');
    expect(entry.phase).toBe('PHASE_4.0');
    expect(entry.txId).toBe('tx-log-test');
    expect(entry.contextId).toBe('ctx-log');
    expect(entry.state).toBe(TxState.TX_CONFIRMED);
    expect(typeof entry.timestamp).toBe('number');
  });
});

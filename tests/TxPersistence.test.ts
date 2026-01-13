import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { getTxPipeline, resetTxPipeline } from '../src/main/modules/tx';
import { clearTxPersistenceStore, getTxPersistence } from '../src/main/modules/tx/TxPersistence';
import { getTransactionStatus, getReceipt } from '../src/main/api';
import { TxState, TxObject, SimulatedTxPayload, SubmissionResult } from '../src/shared/tx-types';
import { getTxStateMachine } from '../src/main/modules/tx';

const payload: SimulatedTxPayload = {
  programId: 'prog',
  instructionData: '00',
  instructionCount: 1,
  accounts: [],
  estimatedAmount: 0,
  origin: 'test-origin',
};

function buildTx(
  txId: string,
  state: TxState,
  extra?: Partial<TxObject>
): TxObject {
  const now = Date.now();
  return {
    txId,
    contextId: 'ctx-test',
    state,
    stateHistory: [{ state, timestamp: now }],
    payload,
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

describe('Tx Persistence & Restart Safety', () => {
  beforeEach(() => {
    clearTxPersistenceStore();
    resetTxPipeline();
  });

  afterEach(() => {
    clearTxPersistenceStore();
    resetTxPipeline();
  });

  it('restores transaction status after restart', () => {
    const persistence = getTxPersistence();
    const snapshotTx = buildTx('tx_persist_status', TxState.TX_SUBMIT);
    persistence.save({ transactions: [snapshotTx] });

    resetTxPipeline(); // simulate restart
    getTxPipeline(); // instantiate
    const loaded = persistence.load();
    if (loaded?.transactions) {
      getTxStateMachine().hydrate(loaded.transactions);
    }
    const status = getTransactionStatus(snapshotTx.txId);

    expect(status.ok).toBe(true);
    if (status.ok) {
      expect(status.data.txId).toBe(snapshotTx.txId);
      expect(status.data.state).toBe(TxState.TX_SUBMIT);
    }
  });

  it('restores receipt data after restart', () => {
    const persistence = getTxPersistence();
    const submissionResult: SubmissionResult = {
      submissionId: 'sub123',
      success: true,
      signature: 'sig123',
      slot: 42,
      rpcEndpointId: 'endpoint-1',
      rpcRouteId: 'route-1',
      timestamp: Date.now(),
    };
    const snapshotTx = buildTx('tx_persist_receipt', TxState.TX_CONFIRMED, {
      submissionResult,
      signingResult: {
        success: true,
        signerScope: { origin: payload.origin, contextId: 'ctx-test', grantedAt: Date.now(), active: true },
      } as any,
      dryRunResult: { success: true, timestamp: Date.now() } as any,
      riskScore: { level: 'LOW', score: 0 } as any,
      strategySelection: { strategy: 'S0_NORMAL' } as any,
      classification: { type: 'UNKNOWN' } as any,
    });
    persistence.save({ transactions: [snapshotTx] });

    resetTxPipeline(); // simulate restart
    getTxPipeline(); // instantiate and restore
    const receipt = getReceipt(snapshotTx.txId);

    expect(receipt.ok).toBe(true);
    if (receipt.ok) {
      expect(receipt.data.txId).toBe(snapshotTx.txId);
      expect(receipt.data.submissionResult?.success).toBe(true);
      expect(receipt.data.submissionResult?.signature).toBe('sig123');
    }
  });
});

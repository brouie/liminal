import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { getTxPipeline, resetTxPipeline } from '../src/main/modules/tx';
import { clearTxPersistenceStore, getTxPersistence } from '../src/main/modules/tx/TxPersistence';
import { getTransactionStatus, getReceipt } from '../src/main/api';
import { TxState, TxObject, SimulatedTxPayload, SubmissionResult } from '../src/shared/tx-types';
import { getTxStateMachine } from '../src/main/modules/tx';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';

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
  const persistDir = join(process.cwd(), 'tmp-test-persist');

  function clean() {
    try {
      if (existsSync(persistDir)) {
        rmSync(persistDir, { recursive: true, force: true });
      }
    } catch {
      // best effort
    }
  }

  beforeEach(() => {
    process.env.LIMINAL_PERSIST_PATH = persistDir;
    clean();
    clearTxPersistenceStore();
    resetTxPipeline();
  });

  afterEach(() => {
    clean();
    clearTxPersistenceStore();
    resetTxPipeline();
    delete process.env.LIMINAL_PERSIST_PATH;
  });

  it('restores transaction status after restart', () => {
    const persistence = getTxPersistence();
    const snapshotTx = buildTx('tx_persist_status', TxState.TX_SUBMIT);
    persistence.save({ transactions: [snapshotTx] });

    resetTxPipeline(); // simulate restart
    const loaded = persistence.load();
    if (loaded?.transactions) {
      getTxStateMachine().hydrate(loaded.transactions);
    }
    getTxPipeline(); // instantiate (uses hydrated state machine)
    const tx = getTxStateMachine().getTransaction(snapshotTx.txId);

    expect(tx).toBeDefined();
    if (tx) {
      expect(tx.txId).toBe(snapshotTx.txId);
      expect(tx.state).toBe(TxState.TX_SUBMIT);
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

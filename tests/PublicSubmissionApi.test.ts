import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  submitTransaction,
  getTransactionStatus,
  getReceipt,
  type SubmissionApiErrorCode,
} from '../src/main/api';
import { getTxPipeline, resetTxPipeline } from '../src/main/modules/tx';
import {
  InvariantId,
  InvariantViolationError,
  TxState,
} from '../src/shared/tx-types';

const baseTx = {
  txId: 'tx_1',
  contextId: 'ctx_1',
  state: TxState.TX_CONFIRMED,
  stateHistory: [],
  payload: {} as any,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

describe('Public Submission API', () => {
  beforeEach(() => {
    resetTxPipeline();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetTxPipeline();
  });

  it('submitTransaction returns ok with tx data on success', async () => {
    const pipeline = getTxPipeline();
    const tx = { ...baseTx };
    vi.spyOn(pipeline, 'getTransaction').mockReturnValue(tx as any);
    vi.spyOn(pipeline, 'submitTransaction').mockResolvedValue(tx as any);

    const result = await submitTransaction(tx.txId);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.txId).toBe(tx.txId);
      expect(pipeline.submitTransaction).toHaveBeenCalledWith(tx.txId);
    }
  });

  it('submitTransaction surfaces invariant violations as typed errors', async () => {
    const pipeline = getTxPipeline();
    const tx = { ...baseTx };
    vi.spyOn(pipeline, 'getTransaction').mockReturnValue(tx as any);
    vi.spyOn(pipeline, 'submitTransaction').mockRejectedValue(
      new InvariantViolationError(
        'Kill-switch active',
        InvariantId.KILL_SWITCH_OVERRIDES_ALL,
        1
      )
    );

    const result = await submitTransaction(tx.txId);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe<SubmissionApiErrorCode>('INVARIANT_VIOLATION');
      expect(result.error.invariantId).toBe(InvariantId.KILL_SWITCH_OVERRIDES_ALL);
    }
  });

  it('submitTransaction returns NOT_FOUND when tx missing', async () => {
    const pipeline = getTxPipeline();
    vi.spyOn(pipeline, 'getTransaction').mockReturnValue(undefined);

    const result = await submitTransaction('missing_tx');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe<SubmissionApiErrorCode>('NOT_FOUND');
    }
  });

  it('getTransactionStatus returns status when available', () => {
    const pipeline = getTxPipeline();
    const tx = { ...baseTx, state: TxState.TX_SUBMIT };
    vi.spyOn(pipeline, 'getTransaction').mockReturnValue(tx as any);

    const result = getTransactionStatus(tx.txId);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.txId).toBe(tx.txId);
      expect(result.data.state).toBe(TxState.TX_SUBMIT);
    }
  });

  it('getTransactionStatus returns NOT_FOUND when missing', () => {
    const pipeline = getTxPipeline();
    vi.spyOn(pipeline, 'getTransaction').mockReturnValue(undefined);

    const result = getTransactionStatus('missing_tx');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe<SubmissionApiErrorCode>('NOT_FOUND');
    }
  });

  it('getReceipt returns receipt when available', () => {
    const pipeline = getTxPipeline();
    const receipt = {
      txId: 'tx_receipt',
      submitted: true,
      submissionResult: { success: true, signature: 'sig', slot: 1 } as any,
    } as any;
    vi.spyOn(pipeline, 'getReceiptData').mockReturnValue(receipt);

    const result = getReceipt(receipt.txId);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.txId).toBe(receipt.txId);
      expect(result.data.submissionResult?.success).toBe(true);
    }
  });

  it('getReceipt returns NOT_FOUND when missing', () => {
    const pipeline = getTxPipeline();
    vi.spyOn(pipeline, 'getReceiptData').mockReturnValue(undefined);

    const result = getReceipt('missing_tx');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe<SubmissionApiErrorCode>('NOT_FOUND');
    }
  });
});

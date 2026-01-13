/**
 * Liminal - Public Submission API (Phase 4.0)
 *
 * Minimal, stable API surface for external callers to submit transactions and
 * query status/receipts. This layer is a thin wrapper over the existing Phase
 * 4.0 pipeline and does not alter any core logic, policy gates, or invariants.
 */

import { getTxPipeline } from '../modules/tx';
import {
  InvariantId,
  InvariantViolationError,
  TxObject,
  TxReceiptData,
  TxState,
} from '../../shared/tx-types';

export type SubmissionApiErrorCode =
  | 'NOT_FOUND'
  | 'INVARIANT_VIOLATION'
  | 'UNKNOWN';

export interface SubmissionApiError {
  code: SubmissionApiErrorCode;
  message: string;
  invariantId?: InvariantId;
}

export type SubmissionApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: SubmissionApiError };

export interface TransactionStatus {
  txId: string;
  state: TxState;
  submissionResult?: TxObject['submissionResult'];
}

/**
 * Submit a transaction by ID using the Phase 4.0 pipeline.
 */
export async function submitTransaction(
  txId: string
): Promise<SubmissionApiResult<TxObject>> {
  const pipeline = getTxPipeline();
  const existing = pipeline.getTransaction(txId);
  if (!existing) {
    return notFound();
  }

  try {
    const result = await pipeline.submitTransaction(txId);
    return { ok: true, data: result };
  } catch (error) {
    return toApiError(error);
  }
}

/**
 * Get the current transaction status (state + submission result).
 */
export function getTransactionStatus(txId: string): SubmissionApiResult<TransactionStatus> {
  const pipeline = getTxPipeline();
  const tx = pipeline.getTransaction(txId);
  if (!tx) {
    return notFound();
  }

  return {
    ok: true,
    data: {
      txId: tx.txId,
      state: tx.state,
      submissionResult: tx.submissionResult,
    },
  };
}

/**
 * Get the transaction receipt.
 */
export function getReceipt(txId: string): SubmissionApiResult<TxReceiptData> {
  const pipeline = getTxPipeline();
  const receipt = pipeline.getReceiptData(txId);
  if (!receipt) {
    return notFound();
  }

  return { ok: true, data: receipt };
}

// ---------- helpers ----------

function notFound(): SubmissionApiResult<never> {
  return {
    ok: false,
    error: { code: 'NOT_FOUND', message: 'Transaction not found' },
  };
}

function toApiError(error: unknown): SubmissionApiResult<never> {
  if (error instanceof InvariantViolationError) {
    return {
      ok: false,
      error: {
        code: 'INVARIANT_VIOLATION',
        message: error.message,
        invariantId: error.invariantId,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: 'UNKNOWN',
      message: error instanceof Error ? error.message : 'Unknown error',
    },
  };
}

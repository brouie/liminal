/**
 * Liminal - Transaction State Machine
 * 
 * Manages deterministic state transitions for simulated transactions.
 * 
 * PHASE 3.0 RULES:
 * - DRY-RUN ONLY
 * - NO real Solana RPC calls
 * - NO signing
 * - NO wallets
 * - NO actual execution
 */

import { v4 as uuidv4 } from 'uuid';
import {
  TxState,
  TxObject,
  SimulatedTxPayload,
  TX_VALID_TRANSITIONS,
} from '../../../shared/tx-types';
import { ContextId } from '../../../shared/types';

/**
 * Error for invalid state transitions
 */
export class InvalidTxStateTransitionError extends Error {
  constructor(
    public readonly txId: string,
    public readonly from: TxState,
    public readonly to: TxState
  ) {
    super(`Invalid transaction state transition: ${from} -> ${to} for tx ${txId}`);
    this.name = 'InvalidTxStateTransitionError';
  }
}

/**
 * Error for transaction not found
 */
export class TxNotFoundError extends Error {
  constructor(public readonly txId: string) {
    super(`Transaction not found: ${txId}`);
    this.name = 'TxNotFoundError';
  }
}

/**
 * Transaction State Machine
 * 
 * Manages the lifecycle of simulated transactions.
 * All operations are deterministic and side-effect-free.
 */
export class TxStateMachine {
  /** In-memory transaction store */
  private transactions: Map<string, TxObject> = new Map();
  
  /** Transactions by context */
  private contextTransactions: Map<ContextId, Set<string>> = new Map();
  
  /**
   * Create a new simulated transaction
   * Starts in TX_NEW state
   * 
   * @param contextId - Context ID this tx belongs to
   * @param payload - Simulated transaction payload
   * @returns New transaction object
   */
  createTransaction(contextId: ContextId, payload: SimulatedTxPayload): TxObject {
    const txId = `tx_${uuidv4()}`;
    const now = Date.now();
    
    const txObject: TxObject = {
      txId,
      contextId,
      state: TxState.TX_NEW,
      stateHistory: [
        {
          state: TxState.TX_NEW,
          timestamp: now,
          reason: 'Transaction created',
        },
      ],
      payload,
      createdAt: now,
      updatedAt: now,
    };
    
    this.transactions.set(txId, txObject);
    
    // Track by context
    if (!this.contextTransactions.has(contextId)) {
      this.contextTransactions.set(contextId, new Set());
    }
    this.contextTransactions.get(contextId)!.add(txId);
    
    return { ...txObject };
  }
  
  /**
   * Get transaction by ID
   * 
   * @param txId - Transaction ID
   * @returns Transaction object or undefined
   */
  getTransaction(txId: string): TxObject | undefined {
    const tx = this.transactions.get(txId);
    return tx ? { ...tx } : undefined;
  }
  
  /**
   * Get all transactions for a context
   * 
   * @param contextId - Context ID
   * @returns Array of transaction objects
   */
  getContextTransactions(contextId: ContextId): TxObject[] {
    const txIds = this.contextTransactions.get(contextId);
    if (!txIds) return [];
    
    return Array.from(txIds)
      .map(id => this.transactions.get(id))
      .filter((tx): tx is TxObject => tx !== undefined)
      .map(tx => ({ ...tx }));
  }
  
  /**
   * Check if a state transition is valid
   * 
   * @param from - Current state
   * @param to - Target state
   * @returns Whether transition is valid
   */
  isValidTransition(from: TxState, to: TxState): boolean {
    const validTargets = TX_VALID_TRANSITIONS[from];
    return validTargets.includes(to);
  }
  
  /**
   * Transition transaction to new state
   * 
   * @param txId - Transaction ID
   * @param targetState - Target state
   * @param reason - Optional reason for transition
   * @returns Updated transaction object
   * @throws InvalidTxStateTransitionError if transition is invalid
   * @throws TxNotFoundError if transaction not found
   */
  transitionTo(txId: string, targetState: TxState, reason?: string): TxObject {
    const tx = this.transactions.get(txId);
    if (!tx) {
      throw new TxNotFoundError(txId);
    }
    
    if (!this.isValidTransition(tx.state, targetState)) {
      throw new InvalidTxStateTransitionError(txId, tx.state, targetState);
    }
    
    const now = Date.now();
    const previousState = tx.state;
    
    tx.state = targetState;
    tx.stateHistory.push({
      state: targetState,
      timestamp: now,
      reason: reason || `Transition from ${previousState}`,
    });
    tx.updatedAt = now;
    
    return { ...tx };
  }
  
  /**
   * Get current state of a transaction
   * 
   * @param txId - Transaction ID
   * @returns Current state
   * @throws TxNotFoundError if transaction not found
   */
  getState(txId: string): TxState {
    const tx = this.transactions.get(txId);
    if (!tx) {
      throw new TxNotFoundError(txId);
    }
    return tx.state;
  }
  
  /**
   * Check if transaction is in a specific state
   * 
   * @param txId - Transaction ID
   * @param state - State to check
   * @returns Whether transaction is in the specified state
   */
  isInState(txId: string, state: TxState): boolean {
    const tx = this.transactions.get(txId);
    return tx ? tx.state === state : false;
  }
  
  /**
   * Check if transaction is in a terminal state
   * 
   * @param txId - Transaction ID
   * @returns Whether transaction is terminal
   */
  isTerminal(txId: string): boolean {
    const tx = this.transactions.get(txId);
    if (!tx) return false;
    return (
      tx.state === TxState.TX_SIMULATED_CONFIRM ||
      tx.state === TxState.TX_CONFIRMED ||
      tx.state === TxState.TX_FAILED ||
      tx.state === TxState.TX_ABORTED
    );
  }
  
  /**
   * Abort a transaction
   * 
   * @param txId - Transaction ID
   * @param reason - Abort reason
   * @returns Updated transaction object
   * @throws TxNotFoundError if transaction not found
   * @throws InvalidTxStateTransitionError if already terminal
   */
  abort(txId: string, reason: string): TxObject {
    const tx = this.transactions.get(txId);
    if (!tx) {
      throw new TxNotFoundError(txId);
    }
    
    if (this.isTerminal(txId)) {
      throw new InvalidTxStateTransitionError(
        txId,
        tx.state,
        TxState.TX_ABORTED
      );
    }
    
    const now = Date.now();
    
    tx.state = TxState.TX_ABORTED;
    tx.abortReason = reason;
    tx.stateHistory.push({
      state: TxState.TX_ABORTED,
      timestamp: now,
      reason,
    });
    tx.updatedAt = now;
    
    return { ...tx };
  }
  
  /**
   * Update transaction with classification data
   * 
   * @param txId - Transaction ID
   * @param data - Partial transaction data to update
   * @returns Updated transaction object
   */
  updateTransaction(txId: string, data: Partial<TxObject>): TxObject {
    const tx = this.transactions.get(txId);
    if (!tx) {
      throw new TxNotFoundError(txId);
    }
    
    // Only allow updating specific fields
    if (data.classification !== undefined) {
      tx.classification = data.classification;
    }
    if (data.riskScore !== undefined) {
      tx.riskScore = data.riskScore;
    }
    if (data.strategySelection !== undefined) {
      tx.strategySelection = data.strategySelection;
    }
    if (data.dryRunResult !== undefined) {
      tx.dryRunResult = data.dryRunResult;
    }
    // Phase 3.1: Signing result
    if (data.signingResult !== undefined) {
      tx.signingResult = data.signingResult;
    }
    // Phase 3.2: Submission attempt result
    if (data.submissionAttempt !== undefined) {
      tx.submissionAttempt = data.submissionAttempt;
    }
    // Phase 3.3: Intent ID
    if (data.intentId !== undefined) {
      tx.intentId = data.intentId;
    }
    
    tx.updatedAt = Date.now();
    
    return { ...tx };
  }
  
  /**
   * Delete a transaction
   * 
   * @param txId - Transaction ID
   * @returns Whether deletion was successful
   */
  deleteTransaction(txId: string): boolean {
    const tx = this.transactions.get(txId);
    if (!tx) return false;
    
    // Remove from context tracking
    const contextTxs = this.contextTransactions.get(tx.contextId);
    if (contextTxs) {
      contextTxs.delete(txId);
      if (contextTxs.size === 0) {
        this.contextTransactions.delete(tx.contextId);
      }
    }
    
    return this.transactions.delete(txId);
  }
  
  /**
   * Clear all transactions for a context
   * 
   * @param contextId - Context ID
   * @returns Number of transactions cleared
   */
  clearContext(contextId: ContextId): number {
    const txIds = this.contextTransactions.get(contextId);
    if (!txIds) return 0;
    
    const count = txIds.size;
    for (const txId of txIds) {
      this.transactions.delete(txId);
    }
    this.contextTransactions.delete(contextId);
    
    return count;
  }
  
  /**
   * Get all transactions (for debugging)
   */
  getAllTransactions(): TxObject[] {
    return Array.from(this.transactions.values()).map(tx => ({ ...tx }));
  }
  
  /**
   * Hydrate state machine from persisted transactions (clears existing).
   * Only manipulates in-memory maps; does not trigger transitions.
   */
  hydrate(transactions: TxObject[]): void {
    this.transactions.clear();
    this.contextTransactions.clear();
    
    for (const tx of transactions) {
      this.transactions.set(tx.txId, { ...tx });
      
      if (!this.contextTransactions.has(tx.contextId)) {
        this.contextTransactions.set(tx.contextId, new Set());
      }
      this.contextTransactions.get(tx.contextId)!.add(tx.txId);
    }
  }
  
  /**
   * Clear all transactions
   */
  clear(): void {
    this.transactions.clear();
    this.contextTransactions.clear();
  }
}

// Singleton instance
let txStateMachine: TxStateMachine | null = null;

/**
 * Get the TxStateMachine singleton
 */
export function getTxStateMachine(): TxStateMachine {
  if (!txStateMachine) {
    txStateMachine = new TxStateMachine();
  }
  return txStateMachine;
}

/**
 * Reset the TxStateMachine singleton (for testing)
 */
export function resetTxStateMachine(): void {
  if (txStateMachine) {
    txStateMachine.clear();
  }
  txStateMachine = null;
}


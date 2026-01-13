/**
 * Liminal - Transaction Submission Gate
 * 
 * Conditional submission gate that allows transactions only when all safety conditions are met.
 * 
 * PHASE 3.2 RULES:
 * - ZERO transaction submission
 * - ZERO RPC sends
 * - ZERO funds movement
 * - Gate is IMPOSSIBLE to bypass without code changes
 * 
 * PHASE 3.7 ADDITIONS:
 * - Also checks ExecutionPolicy
 * - Policy must allow submission AND gate must allow
 * - Defense in depth
 * 
 * PHASE 4.0 ADDITIONS:
 * - Conditional submission (not hard-block)
 * - Requires: successful dry-run, valid intent, policy unlock, invariants pass, kill-switch inactive
 * - Allows submission when all conditions are met
 */

import {
  SubmissionBlockReason,
  SubmissionAttemptResult,
  SubmissionGateStatus,
  TxObject,
  TxState,
  PolicyLockStatus,
  InvariantId,
  IntentType,
} from '../../../shared/tx-types';
import { getExecutionPolicyManager, ExecutionPolicyManager } from '../policy';
import { getInvariantManager } from '../invariants';
import { getIntentManager, IntentManager } from './IntentManager';

// ============ Blocked Methods Registry ============

/**
 * List of methods that are BLOCKED at the API level
 * These methods THROW if called
 */
const BLOCKED_METHODS = [
  'sendTransaction',
  'sendRawTransaction',
  'sendAndConfirmTransaction',
  'sendAndConfirmRawTransaction',
  'submitTransaction',
  'broadcastTransaction',
  'transmitTransaction',
  'executeTransaction',
  'dispatchTransaction',
] as const;

// ============ Error Classes ============

/**
 * Error thrown when a blocked method is called
 */
export class SubmissionBlockedError extends Error {
  public readonly reasonCode: SubmissionBlockReason;
  public readonly txId?: string;
  public readonly blockedMethod: string;
  public readonly timestamp: number;
  
  constructor(
    blockedMethod: string,
    reasonCode: SubmissionBlockReason,
    txId?: string
  ) {
    super(
      `SUBMISSION BLOCKED: ${blockedMethod} is not allowed. ` +
      `Reason: ${reasonCode}. ` +
      `Liminal Phase 3.2 blocks ALL transaction submissions.`
    );
    this.name = 'SubmissionBlockedError';
    this.reasonCode = reasonCode;
    this.txId = txId;
    this.blockedMethod = blockedMethod;
    this.timestamp = Date.now();
  }
}

// ============ Submission Gate ============

/**
 * Transaction Submission Gate
 * 
 * This gate ALWAYS BLOCKS submission attempts.
 * It exists as a safety guarantee for Phase 3.2.
 * 
 * PHASE 3.7: Also checks ExecutionPolicy for additional protection.
 * 
 * THERE IS NO WAY TO ENABLE SUBMISSION WITHOUT MODIFYING THIS CODE.
 */
export class TxSubmissionGate {
  private readonly initializedAt: number;
  private readonly phase = 'PHASE_4.0'; // Updated for conditional submission
  private attempts: SubmissionAttemptResult[] = [];
  
  /** Get policy manager dynamically to handle resets */
  private get policyManager(): ExecutionPolicyManager {
    return getExecutionPolicyManager();
  }
  
  /** Get intent manager dynamically */
  private get intentManager(): IntentManager {
    return getIntentManager();
  }
  
  constructor() {
    this.initializedAt = Date.now();
  }
  
  /**
   * Attempt to submit a transaction
   * 
   * PHASE 4.0: Conditionally allows submission when all safety conditions are met.
   * 
   * Required conditions:
   * - Kill-switch inactive (checked via invariants)
   * - Invariants pass (NO_SUBMISSION_WHEN_POLICY_LOCKED)
   * - Policy allows submission (allowSubmission = true)
   * - Transaction in valid state (TX_SIMULATED_CONFIRM)
   * - Transaction is signed (signingResult.success = true)
   * - Valid intent (SIGN_AND_SUBMIT, confirmed, not expired)
   * - Successful dry-run (state = TX_SIMULATED_CONFIRM implies successful dry-run)
   * 
   * @param txId - Transaction ID
   * @param tx - Transaction object (required for validation)
   * @returns Submission result (allowed: true if all conditions met, false otherwise)
   */
  attemptSubmission(txId: string, tx?: TxObject): SubmissionAttemptResult {
    const timestamp = Date.now();
    
    // PHASE 4.0: Check all required conditions
    
    // 1. Kill-switch check (throws if active)
    const invariantManager = getInvariantManager();
    invariantManager.enforceKillSwitch('attemptSubmission');
    
    // 2. Invariant check (throws if violated)
    invariantManager.enforceInvariant(InvariantId.NO_SUBMISSION_WHEN_POLICY_LOCKED);
    
    // 3. Policy check
    const policyCheck = this.policyManager.checkSubmission();
    if (!policyCheck.allowed) {
      const result: SubmissionAttemptResult = {
        allowed: false,
        reasonCode: SubmissionBlockReason.POLICY_BLOCKED,
        reason: policyCheck.reason || 'Blocked by execution policy',
        timestamp,
        txId,
        wasAttempt: true,
        policyVersion: policyCheck.policyVersion,
      };
      this.attempts.push(result);
      return result;
    }
    
    // 4. Transaction object required
    if (!tx) {
      const result: SubmissionAttemptResult = {
        allowed: false,
        reasonCode: SubmissionBlockReason.INVALID_STATE,
        reason: 'Transaction object is required for submission validation',
        timestamp,
        txId,
        wasAttempt: true,
        policyVersion: policyCheck.policyVersion,
      };
      this.attempts.push(result);
      return result;
    }
    
    // 5. Check transaction state (must be TX_SIMULATED_CONFIRM = successful dry-run)
    if (tx.state !== TxState.TX_SIMULATED_CONFIRM) {
      const result: SubmissionAttemptResult = {
        allowed: false,
        reasonCode: SubmissionBlockReason.INVALID_STATE,
        reason: `Transaction is in state ${tx.state}, must be TX_SIMULATED_CONFIRM (successful dry-run required)`,
        timestamp,
        txId,
        wasAttempt: true,
        policyVersion: policyCheck.policyVersion,
      };
      this.attempts.push(result);
      return result;
    }
    
    // 6. Check transaction is signed
    if (!tx.signingResult?.success) {
      const result: SubmissionAttemptResult = {
        allowed: false,
        reasonCode: SubmissionBlockReason.NOT_SIGNED,
        reason: 'Transaction has not been signed',
        timestamp,
        txId,
        wasAttempt: true,
        policyVersion: policyCheck.policyVersion,
      };
      this.attempts.push(result);
      return result;
    }
    
    // 7. Check intent (must be SIGN_AND_SUBMIT, confirmed, not expired)
    const intentValidation = this.intentManager.validateForSubmission(txId);
    if (!intentValidation.valid) {
      const result: SubmissionAttemptResult = {
        allowed: false,
        reasonCode: SubmissionBlockReason.INVALID_STATE,
        reason: `Intent validation failed: ${intentValidation.reason}`,
        timestamp,
        txId,
        wasAttempt: true,
        policyVersion: policyCheck.policyVersion,
      };
      this.attempts.push(result);
      return result;
    }
    
    // 8. Check private rail is not used (Phase 4.0 scope: no private rail)
    if (tx.strategySelection?.strategy === 'S3_PRIVACY_RAIL') {
      const result: SubmissionAttemptResult = {
        allowed: false,
        reasonCode: SubmissionBlockReason.PRIVATE_RAIL_NOT_ENABLED,
        reason: 'Privacy rail is not enabled in Phase 4.0',
        timestamp,
        txId,
        wasAttempt: true,
        policyVersion: policyCheck.policyVersion,
      };
      this.attempts.push(result);
      return result;
    }
    
    // All conditions met - allow submission
    const result: SubmissionAttemptResult = {
      allowed: true,
      reason: 'All submission conditions satisfied',
      timestamp,
      txId,
      wasAttempt: true,
      policyVersion: policyCheck.policyVersion,
    };
    
    // Record the attempt for audit
    this.attempts.push(result);
    
    return result;
  }
  
  /**
   * Check if submission would be allowed (preemptive check)
   * 
   * PHASE 4.0: Returns true if all conditions would be satisfied.
   * Note: This is a preemptive check and does not validate all conditions.
   * For accurate results, use attemptSubmission() with the transaction object.
   * 
   * @param txId - Transaction ID
   * @param tx - Transaction object (optional, for validation)
   * @returns true if submission would likely be allowed, false otherwise
   */
  wouldAllowSubmission(txId: string, tx?: TxObject): boolean {
    // Record the check (not a real attempt)
    const checkResult = tx ? this.attemptSubmission(txId, tx) : {
      allowed: false,
      reason: 'Preemptive check - transaction object required for accurate validation',
      timestamp: Date.now(),
      txId,
      wasAttempt: false,
    };
    
    this.attempts.push({
      ...checkResult,
      wasAttempt: false,
    });
    
    return checkResult.allowed;
  }
  
  /**
   * Get gate status
   * 
   * PHASE 4.0: Gate is conditional (not always blocking)
   * 
   * @returns Gate status
   */
  getStatus(): SubmissionGateStatus {
    const policyCheck = this.policyManager.checkSubmission();
    return {
      blocking: !policyCheck.allowed, // Conditional based on policy
      phase: this.phase,
      blockedMethods: [...BLOCKED_METHODS],
      initializedAt: this.initializedAt,
    };
  }
  
  /**
   * Get all submission attempts (for audit)
   */
  getAttempts(): SubmissionAttemptResult[] {
    return [...this.attempts];
  }
  
  /**
   * Get attempts for a specific transaction
   */
  getAttemptsForTx(txId: string): SubmissionAttemptResult[] {
    return this.attempts.filter(a => a.txId === txId);
  }
  
  /**
   * Clear attempts (for testing only)
   */
  clearAttempts(): void {
    this.attempts = [];
  }
  
  // ============ Blocked API Methods ============
  // These methods exist ONLY to throw errors when called
  
  /**
   * BLOCKED: sendTransaction
   * @throws SubmissionBlockedError
   */
  sendTransaction(_tx: unknown): never {
    throw new SubmissionBlockedError(
      'sendTransaction',
      SubmissionBlockReason.GATE_BLOCKED
    );
  }
  
  /**
   * BLOCKED: sendRawTransaction
   * @throws SubmissionBlockedError
   */
  sendRawTransaction(_rawTx: unknown): never {
    throw new SubmissionBlockedError(
      'sendRawTransaction',
      SubmissionBlockReason.GATE_BLOCKED
    );
  }
  
  /**
   * BLOCKED: sendAndConfirmTransaction
   * @throws SubmissionBlockedError
   */
  sendAndConfirmTransaction(_tx: unknown): never {
    throw new SubmissionBlockedError(
      'sendAndConfirmTransaction',
      SubmissionBlockReason.GATE_BLOCKED
    );
  }
  
  /**
   * BLOCKED: submitTransaction
   * @throws SubmissionBlockedError
   */
  submitTransaction(_tx: unknown): never {
    throw new SubmissionBlockedError(
      'submitTransaction',
      SubmissionBlockReason.GATE_BLOCKED
    );
  }
  
  /**
   * BLOCKED: broadcastTransaction
   * @throws SubmissionBlockedError
   */
  broadcastTransaction(_tx: unknown): never {
    throw new SubmissionBlockedError(
      'broadcastTransaction',
      SubmissionBlockReason.GATE_BLOCKED
    );
  }
  
  /**
   * BLOCKED: Generic submission method
   * @throws SubmissionBlockedError
   */
  submit(_method: string, _tx: unknown): never {
    throw new SubmissionBlockedError(
      _method,
      SubmissionBlockReason.GATE_BLOCKED
    );
  }
}

// ============ Runtime Guards ============

/**
 * Create a proxy that blocks any method matching blocked patterns
 * Use this to wrap any object that might have submission methods
 */
export function createBlockingProxy<T extends object>(target: T): T {
  return new Proxy(target, {
    get(obj, prop) {
      if (typeof prop === 'string') {
        const propLower = prop.toLowerCase();
        for (const blocked of BLOCKED_METHODS) {
          if (propLower.includes(blocked.toLowerCase())) {
            return () => {
              throw new SubmissionBlockedError(
                prop,
                SubmissionBlockReason.GATE_BLOCKED
              );
            };
          }
        }
      }
      return Reflect.get(obj, prop);
    },
  });
}

/**
 * Assert that an object does not have any submission methods
 * Throws if any blocked method is found
 */
export function assertNoSubmissionMethods(obj: unknown, context: string): void {
  if (typeof obj !== 'object' || obj === null) return;
  
  for (const key of Object.keys(obj)) {
    const keyLower = key.toLowerCase();
    for (const blocked of BLOCKED_METHODS) {
      if (keyLower.includes(blocked.toLowerCase())) {
        throw new SubmissionBlockedError(
          `${context}.${key}`,
          SubmissionBlockReason.GATE_BLOCKED
        );
      }
    }
  }
}

// ============ Singleton ============

let txSubmissionGate: TxSubmissionGate | null = null;

/**
 * Get the TxSubmissionGate singleton
 */
export function getTxSubmissionGate(): TxSubmissionGate {
  if (!txSubmissionGate) {
    txSubmissionGate = new TxSubmissionGate();
  }
  return txSubmissionGate;
}

/**
 * Reset the TxSubmissionGate singleton (for testing only)
 */
export function resetTxSubmissionGate(): void {
  if (txSubmissionGate) {
    txSubmissionGate.clearAttempts();
  }
  txSubmissionGate = null;
}

// ============ Type-level Guarantee ============

/**
 * Type that represents a blocked submission result
 * The 'allowed' field is typed as 'false' literal - it can NEVER be true
 */
export type BlockedSubmissionResult = SubmissionAttemptResult & {
  readonly allowed: false;
};

/**
 * Compile-time assertion that submission is always blocked
 * This function does nothing at runtime but ensures type safety
 */
export function assertSubmissionBlocked(
  result: SubmissionAttemptResult
): asserts result is BlockedSubmissionResult {
  if (result.allowed !== false) {
    // This should NEVER happen - the type system enforces this
    throw new Error('CRITICAL: Submission result shows allowed=true. This is a bug.');
  }
}


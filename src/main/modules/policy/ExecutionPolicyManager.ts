/**
 * Liminal - Execution Policy Manager
 * 
 * Manages the execution policy that controls dangerous capabilities.
 * 
 * PHASE 3.7 RULES:
 * - All flags default to FALSE
 * - Policy is LOCKED by default
 * - Requires explicit unlock with reason + author
 * - All changes are audited
 * - ADDS PROTECTION ONLY - NO execution enabled
 */

import { randomBytes } from 'crypto';
import {
  ExecutionPolicy,
  ExecutionPolicyFlags,
  PolicyLockStatus,
  PolicyUnlockRecord,
  PolicyCheckResult,
  PolicyViolationError,
} from '../../../shared/tx-types';

// ============ Default Policy ============

/**
 * Create default policy flags - ALL FALSE for safety
 */
function createDefaultFlags(): ExecutionPolicyFlags {
  return {
    allowSubmission: false,
    allowPrivateRail: false,
    allowRelayer: false,
    allowZkProofs: false,
    allowFundMovement: false,
  };
}

/**
 * Create default execution policy - LOCKED with all flags FALSE
 */
function createDefaultPolicy(): ExecutionPolicy {
  return {
    flags: createDefaultFlags(),
    lockStatus: PolicyLockStatus.LOCKED,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    version: 1,
    unlockHistory: [],
  };
}

// ============ ExecutionPolicyManager ============

/**
 * Execution Policy Manager
 * 
 * Controls access to dangerous capabilities through explicit policy flags.
 * 
 * Key principles:
 * - All flags default to FALSE (safe by default)
 * - Policy is LOCKED at creation
 * - Unlocking requires explicit reason and author
 * - All unlock attempts are logged
 * - Even after unlock, flags are still FALSE unless explicitly changed
 * 
 * PHASE 3.7: This is a FIREWALL that prevents accidental feature creep.
 */
export class ExecutionPolicyManager {
  private policy: ExecutionPolicy;
  private auditLog: PolicyUnlockRecord[] = [];
  
  constructor() {
    this.policy = createDefaultPolicy();
  }
  
  // ============ Policy Inspection ============
  
  /**
   * Get the current policy (read-only snapshot)
   */
  getPolicy(): ExecutionPolicy {
    return { ...this.policy, flags: { ...this.policy.flags } };
  }
  
  /**
   * Get current policy flags
   */
  getFlags(): ExecutionPolicyFlags {
    return { ...this.policy.flags };
  }
  
  /**
   * Get current lock status
   */
  getLockStatus(): PolicyLockStatus {
    return this.policy.lockStatus;
  }
  
  /**
   * Check if policy is locked
   */
  isLocked(): boolean {
    return this.policy.lockStatus === PolicyLockStatus.LOCKED;
  }
  
  /**
   * Get policy version
   */
  getVersion(): number {
    return this.policy.version;
  }
  
  // ============ Policy Checks ============
  
  /**
   * Check if submission is allowed
   */
  checkSubmission(): PolicyCheckResult {
    return this.checkFlag('allowSubmission', 'Transaction submission');
  }
  
  /**
   * Check if private rail is allowed
   */
  checkPrivateRail(): PolicyCheckResult {
    return this.checkFlag('allowPrivateRail', 'Private rail execution');
  }
  
  /**
   * Check if relayer is allowed
   */
  checkRelayer(): PolicyCheckResult {
    return this.checkFlag('allowRelayer', 'Relayer usage');
  }
  
  /**
   * Check if ZK proofs are allowed
   */
  checkZkProofs(): PolicyCheckResult {
    return this.checkFlag('allowZkProofs', 'ZK proof generation');
  }
  
  /**
   * Check if fund movement is allowed
   */
  checkFundMovement(): PolicyCheckResult {
    return this.checkFlag('allowFundMovement', 'Fund movement');
  }
  
  /**
   * Generic flag check
   */
  private checkFlag(
    flag: keyof ExecutionPolicyFlags,
    actionName: string
  ): PolicyCheckResult {
    const allowed = this.policy.flags[flag];
    
    return {
      allowed,
      policyVersion: this.policy.version,
      lockStatus: this.policy.lockStatus,
      reason: allowed ? undefined : `${actionName} blocked by policy (${flag} = false)`,
      blockedByFlag: allowed ? undefined : flag,
      timestamp: Date.now(),
    };
  }
  
  // ============ Enforcement ============
  
  /**
   * Enforce submission policy - throws if not allowed
   */
  enforceSubmission(): void {
    const check = this.checkSubmission();
    if (!check.allowed) {
      throw new PolicyViolationError(
        check.reason!,
        'allowSubmission',
        this.policy.version
      );
    }
  }
  
  /**
   * Enforce private rail policy - throws if not allowed
   */
  enforcePrivateRail(): void {
    const check = this.checkPrivateRail();
    if (!check.allowed) {
      throw new PolicyViolationError(
        check.reason!,
        'allowPrivateRail',
        this.policy.version
      );
    }
  }
  
  /**
   * Enforce relayer policy - throws if not allowed
   */
  enforceRelayer(): void {
    const check = this.checkRelayer();
    if (!check.allowed) {
      throw new PolicyViolationError(
        check.reason!,
        'allowRelayer',
        this.policy.version
      );
    }
  }
  
  /**
   * Enforce fund movement policy - throws if not allowed
   */
  enforceFundMovement(): void {
    const check = this.checkFundMovement();
    if (!check.allowed) {
      throw new PolicyViolationError(
        check.reason!,
        'allowFundMovement',
        this.policy.version
      );
    }
  }
  
  // ============ Policy Lock Management ============
  
  /**
   * Request unlock of the policy
   * 
   * PHASE 3.7: In this phase, unlock is recorded but flags remain FALSE.
   * Future phases may implement actual unlock logic.
   * 
   * @param reason - Why unlock is requested
   * @param author - Who is requesting
   * @returns Unlock record
   */
  requestUnlock(reason: string, author: string): PolicyUnlockRecord {
    if (!reason || reason.trim().length === 0) {
      throw new Error('Unlock reason is required');
    }
    if (!author || author.trim().length === 0) {
      throw new Error('Unlock author is required');
    }
    
    const unlockRecord: PolicyUnlockRecord = {
      unlockId: `unlock_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`,
      flag: 'allowSubmission', // Generic unlock - no specific flag
      newValue: false, // No actual change in Phase 3.7
      previousValue: false,
      reason: reason.trim(),
      author: author.trim(),
      timestamp: Date.now(),
      approved: false, // Never approved in Phase 3.7
    };
    
    // Record the attempt
    this.auditLog.push(unlockRecord);
    
    // Update policy with unlock attempt
    this.policy = {
      ...this.policy,
      lockStatus: PolicyLockStatus.PENDING_UNLOCK,
      modifiedAt: Date.now(),
      version: this.policy.version + 1,
      unlockHistory: [...this.policy.unlockHistory, unlockRecord],
    };
    
    // Immediately re-lock (Phase 3.7 never approves)
    this.policy = {
      ...this.policy,
      lockStatus: PolicyLockStatus.LOCKED,
    };
    
    return unlockRecord;
  }
  
  /**
   * Request to change a specific flag
   * 
   * PHASE 3.7: Always rejected - flags cannot be changed
   * 
   * @param flag - Flag to change
   * @param newValue - New value
   * @param reason - Why change is requested
   * @param author - Who is requesting
   * @returns Unlock record (always rejected)
   */
  requestFlagChange(
    flag: keyof ExecutionPolicyFlags,
    newValue: boolean,
    reason: string,
    author: string
  ): PolicyUnlockRecord {
    if (!reason || reason.trim().length === 0) {
      throw new Error('Flag change reason is required');
    }
    if (!author || author.trim().length === 0) {
      throw new Error('Flag change author is required');
    }
    
    const previousValue = this.policy.flags[flag];
    
    const unlockRecord: PolicyUnlockRecord = {
      unlockId: `unlock_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`,
      flag,
      newValue,
      previousValue,
      reason: reason.trim(),
      author: author.trim(),
      timestamp: Date.now(),
      approved: false, // Never approved in Phase 3.7
    };
    
    // Record the attempt
    this.auditLog.push(unlockRecord);
    
    // Update policy unlock history but DON'T change the flag
    this.policy = {
      ...this.policy,
      modifiedAt: Date.now(),
      version: this.policy.version + 1,
      unlockHistory: [...this.policy.unlockHistory, unlockRecord],
    };
    
    return unlockRecord;
  }
  
  // ============ Audit Trail ============
  
  /**
   * Get full audit log
   */
  getAuditLog(): PolicyUnlockRecord[] {
    return [...this.auditLog];
  }
  
  /**
   * Get unlock history from policy
   */
  getUnlockHistory(): PolicyUnlockRecord[] {
    return [...this.policy.unlockHistory];
  }
  
  /**
   * Get policy state for receipt/audit
   */
  getPolicyState(): {
    version: number;
    lockStatus: PolicyLockStatus;
    flags: ExecutionPolicyFlags;
    unlockAttempts: number;
  } {
    return {
      version: this.policy.version,
      lockStatus: this.policy.lockStatus,
      flags: { ...this.policy.flags },
      unlockAttempts: this.auditLog.length,
    };
  }
  
  // ============ Reset (for testing) ============
  
  /**
   * Reset to default policy (for testing only)
   */
  reset(): void {
    this.policy = createDefaultPolicy();
    this.auditLog = [];
  }
  
  // ============ Phase 4.0 Unlock ============
  
  /**
   * Unlock policy for Phase 4.0
   * 
   * PHASE 4.0: Allows policy unlock when explicitly requested.
   * All unlocks are audited with reason and author.
   * 
   * @param reason - Why unlock is requested
   * @param author - Who is requesting
   * @returns Unlock record
   */
  unlockForPhase4(reason: string, author: string): PolicyUnlockRecord {
    if (!reason || reason.trim().length === 0) {
      throw new Error('Unlock reason is required');
    }
    if (!author || author.trim().length === 0) {
      throw new Error('Unlock author is required');
    }
    
    const unlockRecord: PolicyUnlockRecord = {
      unlockId: `unlock_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`,
      flag: 'allowSubmission', // Generic unlock - enables policy changes
      newValue: true, // Policy unlocked
      previousValue: false,
      reason: reason.trim(),
      author: author.trim(),
      timestamp: Date.now(),
      approved: true, // Phase 4.0: unlock is approved
    };
    
    // Record the unlock
    this.auditLog.push(unlockRecord);
    
    // Update policy with unlock
    this.policy = {
      ...this.policy,
      lockStatus: PolicyLockStatus.UNLOCKED,
      modifiedAt: Date.now(),
      version: this.policy.version + 1,
      unlockHistory: [...this.policy.unlockHistory, unlockRecord],
    };
    
    return unlockRecord;
  }
  
  /**
   * Set flag value (requires unlocked policy)
   * 
   * PHASE 4.0: Allows flag changes when policy is unlocked.
   * 
   * @param flag - Flag to change
   * @param value - New value
   * @param reason - Why change is requested
   * @param author - Who is requesting
   */
  setFlag(flag: keyof ExecutionPolicyFlags, value: boolean, reason: string, author: string): void {
    if (this.policy.lockStatus === PolicyLockStatus.LOCKED) {
      throw new Error(`Policy is locked. Cannot change flag ${flag}.`);
    }
    
    if (!reason || reason.trim().length === 0) {
      throw new Error('Flag change reason is required');
    }
    if (!author || author.trim().length === 0) {
      throw new Error('Flag change author is required');
    }
    
    const previousValue = this.policy.flags[flag];
    
    const unlockRecord: PolicyUnlockRecord = {
      unlockId: `flag_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`,
      flag,
      newValue: value,
      previousValue,
      reason: reason.trim(),
      author: author.trim(),
      timestamp: Date.now(),
      approved: true,
    };
    
    // Record the change
    this.auditLog.push(unlockRecord);
    
    // Update policy
    this.policy = {
      ...this.policy,
      flags: {
        ...this.policy.flags,
        [flag]: value,
      },
      modifiedAt: Date.now(),
      version: this.policy.version + 1,
      unlockHistory: [...this.policy.unlockHistory, unlockRecord],
    };
  }
}

// ============ Singleton ============

let policyManager: ExecutionPolicyManager | null = null;

/**
 * Get the ExecutionPolicyManager singleton
 */
export function getExecutionPolicyManager(): ExecutionPolicyManager {
  if (!policyManager) {
    policyManager = new ExecutionPolicyManager();
  }
  return policyManager;
}

/**
 * Reset the ExecutionPolicyManager singleton (for testing)
 */
export function resetExecutionPolicyManager(): void {
  if (policyManager) {
    policyManager.reset();
  }
  policyManager = null;
}


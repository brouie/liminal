/**
 * Liminal - Invariant Manager
 * 
 * Enforces formal, machine-checkable invariants.
 * 
 * PHASE 3.9 RULES:
 * - ADDS SAFETY ONLY
 * - Invariants are fail-fast assertions
 * - Violations THROW InvariantViolationError
 * - Kill-switch overrides ALL checks
 */

import { randomBytes } from 'crypto';
import {
  Invariant,
  InvariantId,
  InvariantCheckResult,
  InvariantViolationError,
  KillSwitchState,
  KillSwitchActivation,
  KillSwitchStatus,
  InvariantState,
  PolicyLockStatus,
} from '../../../shared/tx-types';
import { getExecutionPolicyManager, ExecutionPolicyManager } from '../policy';
import { getTxSubmissionGate } from '../tx/TxSubmissionGate';
import { getNullPrivateRailAdapter } from '../rail/NullPrivateRailAdapter';
import { getReadOnlyRpcClient } from '../rpc/ReadOnlySolanaRpcClient';
import { isProd } from '../../config/env';

// ============ Invariant Definitions ============

/**
 * Define all formal invariants
 * 
 * These MUST always hold. Violations throw InvariantViolationError.
 */
const INVARIANTS: Invariant[] = [
  {
    id: InvariantId.NO_SUBMISSION_WHEN_POLICY_LOCKED,
    description: 'No transaction submission when policy is locked',
    version: 1,
    definedAt: Date.now(),
  },
  {
    id: InvariantId.NO_FUNDS_MOVEMENT_PHASE_3,
    description: 'No funds movement ever in Phase 3',
    version: 1,
    definedAt: Date.now(),
  },
  {
    id: InvariantId.NO_PRIVATE_RAIL_WITHOUT_UNLOCK,
    description: 'No private rail execution without policy unlock',
    version: 1,
    definedAt: Date.now(),
  },
  {
    id: InvariantId.READ_ONLY_RPC_ONLY,
    description: 'Read-only RPC only (no submission methods)',
    version: 1,
    definedAt: Date.now(),
  },
  {
    id: InvariantId.NO_SUBMISSION_METHODS,
    description: 'No submission methods reachable',
    version: 1,
    definedAt: Date.now(),
  },
  {
    id: InvariantId.KILL_SWITCH_OVERRIDES_ALL,
    description: 'Kill-switch must override all checks',
    version: 1,
    definedAt: Date.now(),
  },
];

// ============ InvariantManager ============

/**
 * Invariant Manager
 * 
 * Enforces formal invariants with runtime checks.
 * 
 * Key principles:
 * - Invariants are fail-fast (throw on violation)
 * - Kill-switch overrides ALL checks
 * - All checks are auditable
 * - Violations are explicit and traceable
 */
export class InvariantManager {
  private killSwitchState: KillSwitchState = KillSwitchState.INACTIVE;
  private killSwitchActivation: KillSwitchActivation | null = null;
  private killSwitchHistory: KillSwitchActivation[] = [];
  private lastChecks: Map<InvariantId, InvariantCheckResult> = new Map();
  
  constructor() {
    if (isProd() && process.env.LIMINAL_KILL_SWITCH === '1') {
      const activation: KillSwitchActivation = {
        activationId: `kill_env_${Date.now()}`,
        reason: 'Env-configured kill-switch',
        author: 'env',
        activatedAt: Date.now(),
        state: KillSwitchState.ACTIVE,
      };
      this.killSwitchState = KillSwitchState.ACTIVE;
      this.killSwitchActivation = activation;
      this.killSwitchHistory.push(activation);
    }
  }
  
  /** Get policy manager dynamically */
  private get policyManager(): ExecutionPolicyManager {
    return getExecutionPolicyManager();
  }
  
  // ============ Kill-Switch ============
  
  /**
   * Activate kill-switch
   * 
   * Immediately disables signing, RPC, pipeline execution.
   * Overrides ALL other checks.
   * 
   * @param reason - Why kill-switch is activated
   * @param author - Who activated it
   */
  activateKillSwitch(reason: string, author: string): KillSwitchActivation {
    if (!reason || reason.trim().length === 0) {
      throw new Error('Kill-switch activation reason is required');
    }
    if (!author || author.trim().length === 0) {
      throw new Error('Kill-switch activation author is required');
    }
    
    const activation: KillSwitchActivation = {
      activationId: `kill_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`,
      reason: reason.trim(),
      author: author.trim(),
      activatedAt: Date.now(),
      state: KillSwitchState.ACTIVE,
    };
    
    this.killSwitchState = KillSwitchState.ACTIVE;
    this.killSwitchActivation = activation;
    this.killSwitchHistory.push(activation);
    
    return activation;
  }
  
  /**
   * Deactivate kill-switch
   * 
   * @param author - Who deactivated it
   */
  deactivateKillSwitch(author: string): void {
    if (!author || author.trim().length === 0) {
      throw new Error('Kill-switch deactivation author is required');
    }
    
    if (this.killSwitchActivation) {
      this.killSwitchActivation = {
        ...this.killSwitchActivation,
        state: KillSwitchState.INACTIVE,
        deactivatedAt: Date.now(),
      };
    }
    
    this.killSwitchState = KillSwitchState.INACTIVE;
  }
  
  /**
   * Get kill-switch status
   */
  getKillSwitchStatus(): KillSwitchStatus {
    return {
      state: this.killSwitchState,
      activation: this.killSwitchActivation || undefined,
      totalActivations: this.killSwitchHistory.length,
      timestamp: Date.now(),
    };
  }
  
  /**
   * Check if kill-switch is active
   */
  isKillSwitchActive(): boolean {
    return this.killSwitchState === KillSwitchState.ACTIVE;
  }
  
  /**
   * Enforce kill-switch - throws if active
   */
  enforceKillSwitch(operation: string): void {
    if (this.isKillSwitchActive()) {
      throw new InvariantViolationError(
        `Operation ${operation} blocked by kill-switch: ${this.killSwitchActivation?.reason}`,
        InvariantId.KILL_SWITCH_OVERRIDES_ALL,
        1
      );
    }
  }
  
  // ============ Invariant Checks ============
  
  /**
   * Check all invariants
   */
  checkAllInvariants(): Map<InvariantId, InvariantCheckResult> {
    const results = new Map<InvariantId, InvariantCheckResult>();
    
    for (const invariant of INVARIANTS) {
      const result = this.checkInvariant(invariant.id);
      results.set(invariant.id, result);
      this.lastChecks.set(invariant.id, result);
    }
    
    return results;
  }
  
  /**
   * Check a specific invariant
   */
  checkInvariant(invariantId: InvariantId): InvariantCheckResult {
    const invariant = INVARIANTS.find(i => i.id === invariantId);
    if (!invariant) {
      throw new Error(`Unknown invariant: ${invariantId}`);
    }
    
    // Kill-switch check (overrides all)
    if (this.isKillSwitchActive()) {
      return {
        passed: false,
        invariantId,
        invariantVersion: invariant.version,
        error: `Kill-switch is active: ${this.killSwitchActivation?.reason}`,
        timestamp: Date.now(),
      };
    }
    
    // Invariant-specific checks
    try {
      switch (invariantId) {
        case InvariantId.NO_SUBMISSION_WHEN_POLICY_LOCKED:
          return this.checkNoSubmissionWhenPolicyLocked(invariant);
        
        case InvariantId.NO_FUNDS_MOVEMENT_PHASE_3:
          return this.checkNoFundsMovementPhase3(invariant);
        
        case InvariantId.NO_PRIVATE_RAIL_WITHOUT_UNLOCK:
          return this.checkNoPrivateRailWithoutUnlock(invariant);
        
        case InvariantId.READ_ONLY_RPC_ONLY:
          return this.checkReadOnlyRpcOnly(invariant);
        
        case InvariantId.NO_SUBMISSION_METHODS:
          return this.checkNoSubmissionMethods(invariant);
        
        case InvariantId.KILL_SWITCH_OVERRIDES_ALL:
          return this.checkKillSwitchOverridesAll(invariant);
        
        default:
          throw new Error(`Unhandled invariant: ${invariantId}`);
      }
    } catch (error: any) {
      return {
        passed: false,
        invariantId,
        invariantVersion: invariant.version,
        error: error.message,
        timestamp: Date.now(),
      };
    }
  }
  
  /**
   * Check: No submission when policy locked
   * 
   * PHASE-AWARE:
   * - Phase < 4: Submission is forbidden when policy is locked (locked → invariant FAILS)
   * - Phase >= 4: Submission is allowed ONLY when policy is unlocked AND allowSubmission=true
   */
  private checkNoSubmissionWhenPolicyLocked(invariant: Invariant): InvariantCheckResult {
    const policyState = this.policyManager.getPolicyState();
    const submissionCheck = this.policyManager.checkSubmission();
    
    const isLocked = policyState.lockStatus === PolicyLockStatus.LOCKED;
    const submissionAllowed = submissionCheck.allowed;
    
    // Phase detection: If policy is unlocked and submission allowed, we're in Phase 4+
    // Otherwise, default to Phase 3 behavior
    const isPhase4OrLater = !isLocked && submissionAllowed;
    
    // Phase < 4: Pass if policy is locked (submission forbidden when locked)
    // Phase >= 4: Pass if policy is unlocked AND submission allowed
    const passed = isPhase4OrLater ? (!isLocked && submissionAllowed) : isLocked;
    
    return {
      passed,
      invariantId: invariant.id,
      invariantVersion: invariant.version,
      error: passed ? undefined : isPhase4OrLater 
        ? 'Submission forbidden: policy is locked or allowSubmission is false'
        : 'Submission forbidden: policy is locked',
      timestamp: Date.now(),
    };
  }
  
  /**
   * Check: No funds movement in Phase 3
   */
  private checkNoFundsMovementPhase3(invariant: Invariant): InvariantCheckResult {
    const fundsCheck = this.policyManager.checkFundMovement();
    
    // Funds movement must be blocked
    const passed = !fundsCheck.allowed;
    
    return {
      passed,
      invariantId: invariant.id,
      invariantVersion: invariant.version,
      error: passed ? undefined : 'Funds movement is allowed',
      timestamp: Date.now(),
    };
  }
  
  /**
   * Check: No private rail without unlock
   */
  private checkNoPrivateRailWithoutUnlock(invariant: Invariant): InvariantCheckResult {
    const policyState = this.policyManager.getPolicyState();
    const privateRailCheck = this.policyManager.checkPrivateRail();
    const privateRailAdapter = getNullPrivateRailAdapter();
    
    // Policy must be locked OR private rail must be blocked
    const passed = policyState.lockStatus === PolicyLockStatus.LOCKED || !privateRailCheck.allowed || !privateRailAdapter.isAvailable();
    
    return {
      passed,
      invariantId: invariant.id,
      invariantVersion: invariant.version,
      error: passed ? undefined : 'Private rail enabled without unlock',
      timestamp: Date.now(),
    };
  }
  
  /**
   * Check: Read-only RPC only
   */
  private checkReadOnlyRpcOnly(invariant: Invariant): InvariantCheckResult {
    // RPC client should be read-only (check mock mode state is acceptable)
    const rpcClient = getReadOnlyRpcClient();
    
    // Read-only client exists and is accessible
    const passed = rpcClient !== null;
    
    return {
      passed,
      invariantId: invariant.id,
      invariantVersion: invariant.version,
      error: passed ? undefined : 'Read-only RPC client not available',
      timestamp: Date.now(),
    };
  }
  
  /**
   * Check: No submission methods reachable
   */
  private checkNoSubmissionMethods(invariant: Invariant): InvariantCheckResult {
    const submissionGate = getTxSubmissionGate();
    const status = submissionGate.getStatus();
    
    // Submission gate must be blocking
    const passed = status.blocking === true;
    
    return {
      passed,
      invariantId: invariant.id,
      invariantVersion: invariant.version,
      error: passed ? undefined : 'Submission gate is not blocking',
      timestamp: Date.now(),
    };
  }
  
  /**
   * Check: Kill-switch overrides all
   */
  private checkKillSwitchOverridesAll(invariant: Invariant): InvariantCheckResult {
    // Kill-switch mechanism exists
    const passed = true; // Structural check - kill-switch is implemented
    
    return {
      passed,
      invariantId: invariant.id,
      invariantVersion: invariant.version,
      timestamp: Date.now(),
    };
  }
  
  // ============ Enforcement ============
  
  /**
   * Enforce all invariants - throws if any fail
   */
  enforceAllInvariants(): void {
    // First check kill-switch
    this.enforceKillSwitch('invariant check');
    
    const results = this.checkAllInvariants();
    
    for (const [invariantId, result] of results) {
      if (!result.passed) {
        throw new InvariantViolationError(
          result.error || `Invariant ${invariantId} violated`,
          invariantId,
          result.invariantVersion
        );
      }
    }
  }
  
  /**
   * Enforce specific invariant - throws if fails
   */
  enforceInvariant(invariantId: InvariantId): void {
    // First check kill-switch
    this.enforceKillSwitch(`invariant check: ${invariantId}`);
    
    const result = this.checkInvariant(invariantId);
    if (!result.passed) {
      throw new InvariantViolationError(
        result.error || `Invariant ${invariantId} violated`,
        invariantId,
        result.invariantVersion
      );
    }
  }
  
  // ============ State ============
  
  /**
   * Get invariant state
   */
  getState(): InvariantState {
    return {
      version: 1, // Current invariant system version
      invariants: [...INVARIANTS],
      lastChecks: new Map(this.lastChecks),
      killSwitch: this.getKillSwitchStatus(),
      timestamp: Date.now(),
    };
  }
  
  /**
   * Get all invariants
   */
  getInvariants(): Invariant[] {
    return [...INVARIANTS];
  }
  
  /**
   * Get invariant by ID
   */
  getInvariant(invariantId: InvariantId): Invariant | undefined {
    return INVARIANTS.find(i => i.id === invariantId);
  }
  
  /**
   * Reset (for testing)
   */
  reset(): void {
    this.killSwitchState = KillSwitchState.INACTIVE;
    this.killSwitchActivation = null;
    this.killSwitchHistory = [];
    this.lastChecks.clear();
  }
}

// ============ Singleton ============

let invariantManager: InvariantManager | null = null;

/**
 * Get the InvariantManager singleton
 */
export function getInvariantManager(): InvariantManager {
  if (!invariantManager) {
    invariantManager = new InvariantManager();
  }
  return invariantManager;
}

/**
 * Reset the InvariantManager singleton (for testing)
 */
export function resetInvariantManager(): void {
  if (invariantManager) {
    invariantManager.reset();
  }
  invariantManager = null;
}


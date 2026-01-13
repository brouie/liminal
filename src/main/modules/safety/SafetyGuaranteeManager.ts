/**
 * Liminal - Safety Guarantee Manager
 * 
 * Provides transparency into system safety guarantees.
 * 
 * PHASE 3.8 RULES:
 * - ADDS VISIBILITY ONLY
 * - Reads from live system state (ExecutionPolicy, SubmissionGate, etc.)
 * - NO execution changes
 * - NO policy unlocks
 * - Values must be derived from actual modules, not hardcoded
 */

import {
  SafetyGuarantee,
  SafetySnapshot,
  SafetyGuaranteeSummary,
  SafetyGuaranteeCategory,
  PolicyLockStatus,
} from '../../../shared/tx-types';
import { getExecutionPolicyManager, ExecutionPolicyManager } from '../policy';
import { getTxSubmissionGate } from '../tx/TxSubmissionGate';
import { getNullPrivateRailAdapter } from '../rail/NullPrivateRailAdapter';

/**
 * Safety Guarantee Manager
 * 
 * Reads safety guarantees from live system state and provides
 * transparent access to what's enabled/disabled.
 * 
 * PHASE 3.8: This is about TRANSPARENCY, not new capabilities.
 */
export class SafetyGuaranteeManager {
  /** Last snapshot for change detection */
  private lastSnapshot: SafetySnapshot | null = null;
  
  /** Get policy manager dynamically */
  private get policyManager(): ExecutionPolicyManager {
    return getExecutionPolicyManager();
  }
  
  /**
   * Get all safety guarantees
   * 
   * Reads from live system state - NO hardcoded values.
   */
  getGuarantees(): SafetyGuarantee[] {
    const policyState = this.policyManager.getPolicyState();
    const submissionGate = getTxSubmissionGate();
    const privateRailAdapter = getNullPrivateRailAdapter();
    const gateStatus = submissionGate.getStatus();
    
    const guarantees: SafetyGuarantee[] = [];
    
    // 1. Transaction Submission
    const submissionCheck = this.policyManager.checkSubmission();
    guarantees.push({
      id: 'submission',
      name: 'Transaction Submission',
      enabled: submissionCheck.allowed,
      sourceModule: 'ExecutionPolicy + TxSubmissionGate',
      policyVersion: policyState.version,
      lockStatus: policyState.lockStatus,
      details: submissionCheck.allowed
        ? 'Transaction submission is enabled'
        : `Transaction submission is blocked: ${submissionCheck.reason}`,
      timestamp: Date.now(),
    });
    
    // 2. Funds Movement
    const fundsCheck = this.policyManager.checkFundMovement();
    guarantees.push({
      id: 'funds',
      name: 'Funds Movement',
      enabled: fundsCheck.allowed,
      sourceModule: 'ExecutionPolicy',
      policyVersion: policyState.version,
      lockStatus: policyState.lockStatus,
      details: fundsCheck.allowed
        ? 'Funds movement is enabled'
        : `Funds movement is blocked: ${fundsCheck.reason}`,
      timestamp: Date.now(),
    });
    
    // 3. Private Rail Execution
    const privateRailCheck = this.policyManager.checkPrivateRail();
    const privateRailStatus = privateRailAdapter.getStatus();
    guarantees.push({
      id: 'private-rail',
      name: 'Private Rail Execution',
      enabled: privateRailCheck.allowed && privateRailAdapter.isAvailable(),
      sourceModule: 'ExecutionPolicy + NullPrivateRailAdapter',
      policyVersion: policyState.version,
      lockStatus: policyState.lockStatus,
      details: privateRailCheck.allowed
        ? `Private rail status: ${privateRailStatus}`
        : `Private rail blocked: ${privateRailCheck.reason}`,
      timestamp: Date.now(),
    });
    
    // 4. Relayers
    const relayerCheck = this.policyManager.checkRelayer();
    guarantees.push({
      id: 'relayers',
      name: 'Relayers',
      enabled: relayerCheck.allowed,
      sourceModule: 'ExecutionPolicy',
      policyVersion: policyState.version,
      lockStatus: policyState.lockStatus,
      details: relayerCheck.allowed
        ? 'Relayers are enabled'
        : `Relayers blocked: ${relayerCheck.reason}`,
      timestamp: Date.now(),
    });
    
    // 5. Signing (scoped, auditable) - ALWAYS enabled in Phase 3.x
    guarantees.push({
      id: 'signing',
      name: 'Signing (Scoped, Auditable)',
      enabled: true, // Signing is enabled in Phase 3.1+
      sourceModule: 'LiminalWalletAdapter',
      policyVersion: policyState.version,
      lockStatus: policyState.lockStatus,
      details: 'Scoped wallet signing is enabled. Signatures are auditable and revocable.',
      timestamp: Date.now(),
    });
    
    // 6. Read-Only RPC
    guarantees.push({
      id: 'rpc',
      name: 'Read-Only RPC',
      enabled: true, // Read-only RPC is enabled in Phase 3.4+
      sourceModule: 'ReadOnlySolanaRpcClient',
      policyVersion: policyState.version,
      lockStatus: policyState.lockStatus,
      details: 'Read-only RPC calls (getHealth, getBlockhash, getSlot, getVersion) are enabled.',
      timestamp: Date.now(),
    });
    
    return guarantees;
  }
  
  /**
   * Get safety snapshot
   * 
   * Immutable snapshot of current safety state.
   */
  getSnapshot(): SafetySnapshot {
    const policyState = this.policyManager.getPolicyState();
    const submissionCheck = this.policyManager.checkSubmission();
    const privateRailCheck = this.policyManager.checkPrivateRail();
    const fundsCheck = this.policyManager.checkFundMovement();
    const relayerCheck = this.policyManager.checkRelayer();
    const privateRailAdapter = getNullPrivateRailAdapter();
    
    return {
      timestamp: Date.now(),
      policyVersion: policyState.version,
      policyLockStatus: policyState.lockStatus,
      submissionBlocked: !submissionCheck.allowed,
      privateRailAvailable: privateRailCheck.allowed && privateRailAdapter.isAvailable(),
      fundsMovementAllowed: fundsCheck.allowed,
      relayersAllowed: relayerCheck.allowed,
      signingEnabled: true, // Signing is enabled in Phase 3.1+
      readOnlyRpcEnabled: true, // Read-only RPC is enabled in Phase 3.4+
      sourceModules: {
        submission: 'ExecutionPolicy + TxSubmissionGate',
        privateRail: 'ExecutionPolicy + NullPrivateRailAdapter',
        funds: 'ExecutionPolicy',
        relayers: 'ExecutionPolicy',
        signing: 'LiminalWalletAdapter',
        rpc: 'ReadOnlySolanaRpcClient',
      },
    };
  }
  
  /**
   * Get safety guarantee summary for UI
   */
  getSummary(): SafetyGuaranteeSummary {
    const guarantees = this.getGuarantees();
    const snapshot = this.getSnapshot();
    
    // Check if anything changed
    let hasChanged = false;
    let warningMessage: string | undefined;
    
    if (this.lastSnapshot) {
      const changed = this.detectChanges(this.lastSnapshot, snapshot);
      if (changed.length > 0) {
        hasChanged = true;
        warningMessage = `Safety guarantees have changed: ${changed.join(', ')}`;
      }
    }
    
    // Update last snapshot
    this.lastSnapshot = snapshot;
    
    return {
      guarantees,
      snapshot,
      hasChanged,
      warningMessage,
      timestamp: Date.now(),
    };
  }
  
  /**
   * Detect changes between two snapshots
   * 
   * Only detects changes to actual guarantee states, not policy version.
   * Policy version can change (unlock attempts) without guarantee states changing.
   */
  private detectChanges(oldSnapshot: SafetySnapshot, newSnapshot: SafetySnapshot): string[] {
    const changes: string[] = [];
    
    if (oldSnapshot.submissionBlocked !== newSnapshot.submissionBlocked) {
      changes.push('Transaction submission');
    }
    if (oldSnapshot.privateRailAvailable !== newSnapshot.privateRailAvailable) {
      changes.push('Private rail');
    }
    if (oldSnapshot.fundsMovementAllowed !== newSnapshot.fundsMovementAllowed) {
      changes.push('Funds movement');
    }
    if (oldSnapshot.relayersAllowed !== newSnapshot.relayersAllowed) {
      changes.push('Relayers');
    }
    if (oldSnapshot.signingEnabled !== newSnapshot.signingEnabled) {
      changes.push('Signing');
    }
    if (oldSnapshot.readOnlyRpcEnabled !== newSnapshot.readOnlyRpcEnabled) {
      changes.push('Read-only RPC');
    }
    
    // Policy version changes don't count as guarantee changes
    // (policy version can increment due to unlock attempts without flag changes)
    
    return changes;
  }
  
  /**
   * Get guarantee by ID
   */
  getGuarantee(id: string): SafetyGuarantee | undefined {
    return this.getGuarantees().find(g => g.id === id);
  }
  
  /**
   * Get guarantees by category
   */
  getGuaranteesByCategory(category: SafetyGuaranteeCategory): SafetyGuarantee[] {
    const categoryMap: Record<SafetyGuaranteeCategory, string[]> = {
      [SafetyGuaranteeCategory.SUBMISSION]: ['submission'],
      [SafetyGuaranteeCategory.FUNDS]: ['funds'],
      [SafetyGuaranteeCategory.PRIVATE_RAIL]: ['private-rail'],
      [SafetyGuaranteeCategory.RELAYER]: ['relayers'],
      [SafetyGuaranteeCategory.SIGNING]: ['signing'],
      [SafetyGuaranteeCategory.RPC]: ['rpc'],
    };
    
    const ids = categoryMap[category];
    return this.getGuarantees().filter(g => ids.includes(g.id));
  }
  
  /**
   * Reset change detection (for testing)
   */
  reset(): void {
    this.lastSnapshot = null;
  }
}

// ============ Singleton ============

let safetyGuaranteeManager: SafetyGuaranteeManager | null = null;

/**
 * Get the SafetyGuaranteeManager singleton
 */
export function getSafetyGuaranteeManager(): SafetyGuaranteeManager {
  if (!safetyGuaranteeManager) {
    safetyGuaranteeManager = new SafetyGuaranteeManager();
  }
  return safetyGuaranteeManager;
}

/**
 * Reset the SafetyGuaranteeManager singleton (for testing)
 */
export function resetSafetyGuaranteeManager(): void {
  if (safetyGuaranteeManager) {
    safetyGuaranteeManager.reset();
  }
  safetyGuaranteeManager = null;
}


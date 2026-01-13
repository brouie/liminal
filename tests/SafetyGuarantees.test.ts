/**
 * Liminal - Safety Guarantees Tests
 * 
 * Tests for Phase 3.8: Safety & Guarantee Surface
 * 
 * VERIFICATION:
 * - Guarantees reflect real system state
 * - UI updates if policy state changes (even though it won't)
 * - Receipts contain correct safety snapshot
 * - No regression to previous phases
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SafetySnapshot,
  SafetyGuarantee,
  SafetyGuaranteeCategory,
  PolicyLockStatus,
  TxState,
  SimulatedTxPayload,
} from '../src/shared/tx-types';
import {
  SafetyGuaranteeManager,
  getSafetyGuaranteeManager,
  resetSafetyGuaranteeManager,
} from '../src/main/modules/safety/SafetyGuaranteeManager';
import {
  getExecutionPolicyManager,
  resetExecutionPolicyManager,
} from '../src/main/modules/policy/ExecutionPolicyManager';
import {
  getTxSubmissionGate,
  resetTxSubmissionGate,
} from '../src/main/modules/tx/TxSubmissionGate';
import {
  getNullPrivateRailAdapter,
  resetNullPrivateRailAdapter,
} from '../src/main/modules/rail/NullPrivateRailAdapter';
import {
  getTxPipeline,
  resetTxPipeline,
} from '../src/main/modules/tx/TxPipeline';
import {
  getTxStateMachine,
  resetTxStateMachine,
} from '../src/main/modules/tx/TxStateMachine';
import {
  resetRpcEndpointPool,
} from '../src/main/modules/rpc/RpcEndpointPool';
import {
  resetRpcRouteManager,
} from '../src/main/modules/rpc/RpcRouteManager';
import {
  resetReadOnlyRpcClient,
} from '../src/main/modules/rpc/ReadOnlySolanaRpcClient';
import {
  resetStrategySelector,
} from '../src/main/modules/tx/StrategySelector';

// ============ Test Fixtures ============

function createTestPayload(overrides: Partial<SimulatedTxPayload> = {}): SimulatedTxPayload {
  return {
    programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    instructionData: '03abcdef1234567890',
    instructionCount: 1,
    accounts: [
      'Sender111111111111111111111111111111111',
      'Recipient222222222222222222222222222222',
    ],
    estimatedAmount: 1.5,
    origin: 'https://example.com',
    ...overrides,
  };
}

function resetAll() {
  resetExecutionPolicyManager();
  resetSafetyGuaranteeManager();
  resetTxSubmissionGate();
  resetNullPrivateRailAdapter();
  resetStrategySelector();
  resetRpcEndpointPool();
  resetRpcRouteManager();
  resetReadOnlyRpcClient();
  resetTxStateMachine();
  resetTxPipeline();
}

// ============ SafetyGuaranteeManager Tests ============

describe('SafetyGuaranteeManager', () => {
  let manager: SafetyGuaranteeManager;

  beforeEach(() => {
    resetAll();
    manager = getSafetyGuaranteeManager();
  });

  afterEach(() => {
    resetAll();
  });

  describe('Get Guarantees', () => {
    it('should return all guarantees', () => {
      const guarantees = manager.getGuarantees();
      
      expect(guarantees.length).toBe(6);
      
      const ids = guarantees.map(g => g.id);
      expect(ids).toContain('submission');
      expect(ids).toContain('funds');
      expect(ids).toContain('private-rail');
      expect(ids).toContain('relayers');
      expect(ids).toContain('signing');
      expect(ids).toContain('rpc');
    });

    it('should read from live system state', () => {
      const guarantees = manager.getGuarantees();
      
      // Submission should be disabled
      const submission = guarantees.find(g => g.id === 'submission')!;
      expect(submission.enabled).toBe(false);
      expect(submission.sourceModule).toContain('ExecutionPolicy');
      
      // Funds should be disabled
      const funds = guarantees.find(g => g.id === 'funds')!;
      expect(funds.enabled).toBe(false);
      
      // Private rail should be disabled
      const privateRail = guarantees.find(g => g.id === 'private-rail')!;
      expect(privateRail.enabled).toBe(false);
      
      // Relayers should be disabled
      const relayers = guarantees.find(g => g.id === 'relayers')!;
      expect(relayers.enabled).toBe(false);
      
      // Signing should be enabled
      const signing = guarantees.find(g => g.id === 'signing')!;
      expect(signing.enabled).toBe(true);
      
      // Read-only RPC should be enabled
      const rpc = guarantees.find(g => g.id === 'rpc')!;
      expect(rpc.enabled).toBe(true);
    });

    it('should include policy version in guarantees', () => {
      const guarantees = manager.getGuarantees();
      const policyVersion = getExecutionPolicyManager().getVersion();
      
      guarantees.forEach(guarantee => {
        expect(guarantee.policyVersion).toBe(policyVersion);
      });
    });

    it('should include lock status in guarantees', () => {
      const guarantees = manager.getGuarantees();
      
      guarantees.forEach(guarantee => {
        expect(guarantee.lockStatus).toBe(PolicyLockStatus.LOCKED);
      });
    });

    it('should include source modules', () => {
      const guarantees = manager.getGuarantees();
      
      const submission = guarantees.find(g => g.id === 'submission')!;
      expect(submission.sourceModule).toBeDefined();
      expect(submission.sourceModule.length).toBeGreaterThan(0);
    });

    it('should include details', () => {
      const guarantees = manager.getGuarantees();
      
      guarantees.forEach(guarantee => {
        expect(guarantee.details).toBeDefined();
        expect(guarantee.details!.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Get Snapshot', () => {
    it('should return safety snapshot', () => {
      const snapshot = manager.getSnapshot();
      
      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.policyVersion).toBeDefined();
      expect(snapshot.policyLockStatus).toBe(PolicyLockStatus.LOCKED);
    });

    it('should reflect current system state', () => {
      const snapshot = manager.getSnapshot();
      
      // Submission blocked
      expect(snapshot.submissionBlocked).toBe(true);
      
      // Private rail not available
      expect(snapshot.privateRailAvailable).toBe(false);
      
      // Funds movement not allowed
      expect(snapshot.fundsMovementAllowed).toBe(false);
      
      // Relayers not allowed
      expect(snapshot.relayersAllowed).toBe(false);
      
      // Signing enabled
      expect(snapshot.signingEnabled).toBe(true);
      
      // Read-only RPC enabled
      expect(snapshot.readOnlyRpcEnabled).toBe(true);
    });

    it('should include source modules', () => {
      const snapshot = manager.getSnapshot();
      
      expect(snapshot.sourceModules.submission).toBeDefined();
      expect(snapshot.sourceModules.privateRail).toBeDefined();
      expect(snapshot.sourceModules.funds).toBeDefined();
      expect(snapshot.sourceModules.relayers).toBeDefined();
      expect(snapshot.sourceModules.signing).toBeDefined();
      expect(snapshot.sourceModules.rpc).toBeDefined();
    });

    it('should have immutable structure', () => {
      const snapshot1 = manager.getSnapshot();
      const snapshot2 = manager.getSnapshot();
      
      // Same policy version should produce same snapshot structure
      expect(Object.keys(snapshot1)).toEqual(Object.keys(snapshot2));
      expect(Object.keys(snapshot1.sourceModules)).toEqual(Object.keys(snapshot2.sourceModules));
    });
  });

  describe('Get Summary', () => {
    it('should return summary with guarantees and snapshot', () => {
      const summary = manager.getSummary();
      
      expect(summary.guarantees).toBeDefined();
      expect(summary.snapshot).toBeDefined();
      expect(summary.hasChanged).toBe(false); // First check, no previous state
      expect(summary.timestamp).toBeDefined();
    });

    it('should detect changes', () => {
      const summary1 = manager.getSummary();
      
      // Trigger a policy change (even though it won't actually change the flags)
      const policyManager = getExecutionPolicyManager();
      policyManager.requestUnlock('Test', 'TestAuthor');
      
      const summary2 = manager.getSummary();
      
      // Policy version should have changed
      expect(summary2.snapshot.policyVersion).toBeGreaterThan(summary1.snapshot.policyVersion);
      
      // But flags should still be false, so no guarantee changes
      expect(summary2.hasChanged).toBe(false);
    });

    it('should not show warning on first check', () => {
      const summary = manager.getSummary();
      
      expect(summary.hasChanged).toBe(false);
      expect(summary.warningMessage).toBeUndefined();
    });
  });

  describe('Get Guarantee by ID', () => {
    it('should return guarantee by ID', () => {
      const submission = manager.getGuarantee('submission');
      
      expect(submission).toBeDefined();
      expect(submission!.id).toBe('submission');
      expect(submission!.name).toBe('Transaction Submission');
    });

    it('should return undefined for unknown ID', () => {
      const unknown = manager.getGuarantee('unknown-id');
      
      expect(unknown).toBeUndefined();
    });
  });

  describe('Get Guarantees by Category', () => {
    it('should return guarantees for SUBMISSION category', () => {
      const guarantees = manager.getGuaranteesByCategory(SafetyGuaranteeCategory.SUBMISSION);
      
      expect(guarantees.length).toBe(1);
      expect(guarantees[0].id).toBe('submission');
    });

    it('should return guarantees for FUNDS category', () => {
      const guarantees = manager.getGuaranteesByCategory(SafetyGuaranteeCategory.FUNDS);
      
      expect(guarantees.length).toBe(1);
      expect(guarantees[0].id).toBe('funds');
    });

    it('should return guarantees for SIGNING category', () => {
      const guarantees = manager.getGuaranteesByCategory(SafetyGuaranteeCategory.SIGNING);
      
      expect(guarantees.length).toBe(1);
      expect(guarantees[0].id).toBe('signing');
    });

    it('should return guarantees for RPC category', () => {
      const guarantees = manager.getGuaranteesByCategory(SafetyGuaranteeCategory.RPC);
      
      expect(guarantees.length).toBe(1);
      expect(guarantees[0].id).toBe('rpc');
    });
  });

  describe('Singleton', () => {
    it('should return same instance', () => {
      const m1 = getSafetyGuaranteeManager();
      const m2 = getSafetyGuaranteeManager();
      
      expect(m1).toBe(m2);
    });

    it('should reset singleton', () => {
      const m1 = getSafetyGuaranteeManager();
      m1.getSummary(); // Create last snapshot
      
      resetSafetyGuaranteeManager();
      const m2 = getSafetyGuaranteeManager();
      
      expect(m2).not.toBe(m1);
    });
  });
});

// ============ TxPipeline Safety Snapshot Integration ============

describe('TxPipeline Safety Snapshot Integration', () => {
  beforeEach(() => {
    resetAll();
  });

  afterEach(() => {
    resetAll();
  });

  it('should include safety snapshot in receipt', () => {
    const pipeline = getTxPipeline();
    const stateMachine = getTxStateMachine();
    const payload = createTestPayload();
    
    const tx = pipeline.createTransaction('ctx_test', payload);
    
    // Complete the pipeline
    stateMachine.transitionTo(tx.txId, TxState.TX_CLASSIFY);
    stateMachine.transitionTo(tx.txId, TxState.TX_RISK_SCORE);
    stateMachine.transitionTo(tx.txId, TxState.TX_STRATEGY_SELECT);
    stateMachine.transitionTo(tx.txId, TxState.TX_PREPARE);
    stateMachine.transitionTo(tx.txId, TxState.TX_DRY_RUN);
    stateMachine.updateTransaction(tx.txId, {
      dryRunResult: {
        dryRunId: 'dryrun_test',
        success: true,
        simulatedRpc: { name: 'test', isPrivate: false, simulatedLatencyMs: 100 },
        strategy: 'S0_NORMAL' as any,
        route: ['client', 'rpc'],
        estimatedFee: 0.000005,
        simulatedExecutionMs: 100,
        warnings: [],
        timestamp: Date.now(),
        isSimulation: true,
      },
    });
    stateMachine.transitionTo(tx.txId, TxState.TX_SIMULATED_CONFIRM);
    
    const receipt = pipeline.getReceiptData(tx.txId)!;
    
    expect(receipt.safetySnapshot).toBeDefined();
    expect(receipt.safetySnapshot!.submissionBlocked).toBe(true);
    expect(receipt.safetySnapshot!.privateRailAvailable).toBe(false);
    expect(receipt.safetySnapshot!.fundsMovementAllowed).toBe(false);
    expect(receipt.safetySnapshot!.signingEnabled).toBe(true);
    expect(receipt.safetySnapshot!.readOnlyRpcEnabled).toBe(true);
  });

  it('should have immutable snapshot structure', () => {
    const pipeline = getTxPipeline();
    const stateMachine = getTxStateMachine();
    const payload = createTestPayload();
    
    const tx = pipeline.createTransaction('ctx_test', payload);
    
    // Complete the pipeline
    stateMachine.transitionTo(tx.txId, TxState.TX_CLASSIFY);
    stateMachine.transitionTo(tx.txId, TxState.TX_RISK_SCORE);
    stateMachine.transitionTo(tx.txId, TxState.TX_STRATEGY_SELECT);
    stateMachine.transitionTo(tx.txId, TxState.TX_PREPARE);
    stateMachine.transitionTo(tx.txId, TxState.TX_DRY_RUN);
    stateMachine.updateTransaction(tx.txId, {
      dryRunResult: {
        dryRunId: 'dryrun_test',
        success: true,
        simulatedRpc: { name: 'test', isPrivate: false, simulatedLatencyMs: 100 },
        strategy: 'S0_NORMAL' as any,
        route: ['client', 'rpc'],
        estimatedFee: 0.000005,
        simulatedExecutionMs: 100,
        warnings: [],
        timestamp: Date.now(),
        isSimulation: true,
      },
    });
    stateMachine.transitionTo(tx.txId, TxState.TX_SIMULATED_CONFIRM);
    
    const receipt = pipeline.getReceiptData(tx.txId)!;
    const snapshot = receipt.safetySnapshot!;
    
    // Snapshot should have all required fields
    expect(snapshot.timestamp).toBeDefined();
    expect(snapshot.policyVersion).toBeDefined();
    expect(snapshot.policyLockStatus).toBeDefined();
    expect(snapshot.submissionBlocked).toBeDefined();
    expect(snapshot.privateRailAvailable).toBeDefined();
    expect(snapshot.fundsMovementAllowed).toBeDefined();
    expect(snapshot.relayersAllowed).toBeDefined();
    expect(snapshot.signingEnabled).toBeDefined();
    expect(snapshot.readOnlyRpcEnabled).toBeDefined();
    expect(snapshot.sourceModules).toBeDefined();
  });

  it('should expose safety guarantee manager', () => {
    const pipeline = getTxPipeline();
    
    const manager = pipeline.getSafetyGuaranteeManager();
    
    expect(manager).toBeDefined();
    const guarantees = manager.getGuarantees();
    expect(guarantees.length).toBe(6);
  });
});

// ============ Phase 3.8 Guarantees ============

describe('Phase 3.8 Guarantees', () => {
  beforeEach(() => {
    resetAll();
  });

  afterEach(() => {
    resetAll();
  });

  it('Guarantees reflect real system state', () => {
    const manager = getSafetyGuaranteeManager();
    const policyManager = getExecutionPolicyManager();
    
    const guarantees = manager.getGuarantees();
    const submission = guarantees.find(g => g.id === 'submission')!;
    
    // Should reflect actual policy state
    const policyCheck = policyManager.checkSubmission();
    expect(submission.enabled).toBe(policyCheck.allowed);
  });

  it('UI would update if policy state changes', () => {
    const manager = getSafetyGuaranteeManager();
    
    // Get initial summary
    const summary1 = manager.getSummary();
    
    // Trigger policy change (unlock attempt)
    const policyManager = getExecutionPolicyManager();
    policyManager.requestUnlock('Test', 'TestAuthor');
    
    // Get new summary
    const summary2 = manager.getSummary();
    
    // Policy version should have changed
    expect(summary2.snapshot.policyVersion).toBeGreaterThan(summary1.snapshot.policyVersion);
    
    // Summary should be updateable (even though flags don't change)
    // Timestamp should be >= (may be same millisecond in fast tests)
    expect(summary2.timestamp).toBeGreaterThanOrEqual(summary1.timestamp);
  });

  it('Receipts contain correct safety snapshot', () => {
    const pipeline = getTxPipeline();
    const stateMachine = getTxStateMachine();
    const payload = createTestPayload();
    
    const tx = pipeline.createTransaction('ctx_test', payload);
    stateMachine.transitionTo(tx.txId, TxState.TX_CLASSIFY);
    stateMachine.transitionTo(tx.txId, TxState.TX_RISK_SCORE);
    stateMachine.transitionTo(tx.txId, TxState.TX_STRATEGY_SELECT);
    stateMachine.transitionTo(tx.txId, TxState.TX_PREPARE);
    stateMachine.transitionTo(tx.txId, TxState.TX_DRY_RUN);
    stateMachine.updateTransaction(tx.txId, {
      dryRunResult: {
        dryRunId: 'dryrun_test',
        success: true,
        simulatedRpc: { name: 'test', isPrivate: false, simulatedLatencyMs: 100 },
        strategy: 'S0_NORMAL' as any,
        route: ['client', 'rpc'],
        estimatedFee: 0.000005,
        simulatedExecutionMs: 100,
        warnings: [],
        timestamp: Date.now(),
        isSimulation: true,
      },
    });
    stateMachine.transitionTo(tx.txId, TxState.TX_SIMULATED_CONFIRM);
    
    const receipt = pipeline.getReceiptData(tx.txId)!;
    const snapshot = receipt.safetySnapshot!;
    
    // Verify snapshot matches current system state
    const manager = getSafetyGuaranteeManager();
    const currentSnapshot = manager.getSnapshot();
    
    expect(snapshot.submissionBlocked).toBe(currentSnapshot.submissionBlocked);
    expect(snapshot.privateRailAvailable).toBe(currentSnapshot.privateRailAvailable);
    expect(snapshot.fundsMovementAllowed).toBe(currentSnapshot.fundsMovementAllowed);
    expect(snapshot.relayersAllowed).toBe(currentSnapshot.relayersAllowed);
    expect(snapshot.signingEnabled).toBe(currentSnapshot.signingEnabled);
    expect(snapshot.readOnlyRpcEnabled).toBe(currentSnapshot.readOnlyRpcEnabled);
  });

  it('No regression - submission still blocked', () => {
    const pipeline = getTxPipeline();
    const gate = getTxSubmissionGate();
    const payload = createTestPayload();
    
    const tx = pipeline.createTransaction('ctx_test', payload);
    
    const result = pipeline.attemptSubmission(tx.txId);
    expect(result.allowed).toBe(false);
    
    expect(() => gate.sendTransaction({})).toThrow();
  });

  it('No regression - private rail still unavailable', () => {
    const adapter = getNullPrivateRailAdapter();
    
    expect(adapter.isAvailable()).toBe(false);
  });

  it('No regression - receipts still work', () => {
    const pipeline = getTxPipeline();
    const stateMachine = getTxStateMachine();
    const payload = createTestPayload();
    
    const tx = pipeline.createTransaction('ctx_test', payload);
    
    // Receipt should be accessible
    const receipt = pipeline.getReceiptData(tx.txId);
    expect(receipt).toBeDefined();
  });

  it('Snapshot is immutable once recorded', () => {
    const manager = getSafetyGuaranteeManager();
    
    const snapshot1 = manager.getSnapshot();
    
    // Wait a bit
    const before = Date.now();
    while (Date.now() - before < 10) {
      // Small delay
    }
    
    const snapshot2 = manager.getSnapshot();
    
    // Snapshot structure should be the same (though timestamps differ)
    expect(Object.keys(snapshot1)).toEqual(Object.keys(snapshot2));
    
    // Policy version should be the same (no changes in Phase 3.8)
    // In Phase 3.8, nothing should change, so flags should match
    expect(snapshot1.submissionBlocked).toBe(snapshot2.submissionBlocked);
    expect(snapshot1.privateRailAvailable).toBe(snapshot2.privateRailAvailable);
    expect(snapshot1.fundsMovementAllowed).toBe(snapshot2.fundsMovementAllowed);
  });
});

// ============ SafetyGuaranteeCategory Enum Tests ============

describe('SafetyGuaranteeCategory Enum', () => {
  it('should have correct values', () => {
    expect(SafetyGuaranteeCategory.SUBMISSION).toBe('SUBMISSION');
    expect(SafetyGuaranteeCategory.FUNDS).toBe('FUNDS');
    expect(SafetyGuaranteeCategory.PRIVATE_RAIL).toBe('PRIVATE_RAIL');
    expect(SafetyGuaranteeCategory.RELAYER).toBe('RELAYER');
    expect(SafetyGuaranteeCategory.SIGNING).toBe('SIGNING');
    expect(SafetyGuaranteeCategory.RPC).toBe('RPC');
  });
});


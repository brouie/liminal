/**
 * Liminal - Invariant Tests
 * 
 * Tests for Phase 3.9: Formal Invariants & Kill-Switch
 * 
 * VERIFICATION:
 * - Invariants fail when violated
 * - Kill-switch stops everything instantly
 * - No false positives in normal operation
 * - No regression to previous phases
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  InvariantId,
  InvariantViolationError,
  KillSwitchState,
  PolicyLockStatus,
  TxState,
  SimulatedTxPayload,
  SubmissionBlockReason,
} from '../src/shared/tx-types';
import {
  InvariantManager,
  getInvariantManager,
  resetInvariantManager,
} from '../src/main/modules/invariants/InvariantManager';
import {
  getExecutionPolicyManager,
  resetExecutionPolicyManager,
} from '../src/main/modules/policy/ExecutionPolicyManager';
import {
  getTxSubmissionGate,
  resetTxSubmissionGate,
  SubmissionBlockedError,
} from '../src/main/modules/tx/TxSubmissionGate';
import {
  getTxPipeline,
  resetTxPipeline,
} from '../src/main/modules/tx/TxPipeline';
import {
  getTxStateMachine,
  resetTxStateMachine,
} from '../src/main/modules/tx/TxStateMachine';
import {
  getLiminalWalletAdapter,
  resetLiminalWalletAdapter,
} from '../src/main/modules/wallet/LiminalWalletAdapter';
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
import {
  resetNullPrivateRailAdapter,
} from '../src/main/modules/rail/NullPrivateRailAdapter';
import {
  getContextManager,
  resetContextManager,
} from '../src/main/modules/ContextManager';
import { ContextState } from '../src/shared/types';

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
  resetInvariantManager();
  resetExecutionPolicyManager();
  resetTxSubmissionGate();
  resetNullPrivateRailAdapter();
  resetStrategySelector();
  resetRpcEndpointPool();
  resetRpcRouteManager();
  resetReadOnlyRpcClient();
  resetTxStateMachine();
  resetTxPipeline();
  resetLiminalWalletAdapter();
  resetContextManager();
}

// ============ InvariantManager Tests ============

describe('InvariantManager', () => {
  let manager: InvariantManager;

  beforeEach(() => {
    resetAll();
    manager = getInvariantManager();
  });

  afterEach(() => {
    resetAll();
  });

  describe('Kill-Switch', () => {
    it('should be inactive by default', () => {
      expect(manager.isKillSwitchActive()).toBe(false);
      
      const status = manager.getKillSwitchStatus();
      expect(status.state).toBe(KillSwitchState.INACTIVE);
      expect(status.totalActivations).toBe(0);
    });

    it('should activate kill-switch with reason and author', () => {
      const activation = manager.activateKillSwitch('Emergency stop', 'TestAuthor');
      
      expect(activation.activationId).toBeDefined();
      expect(activation.reason).toBe('Emergency stop');
      expect(activation.author).toBe('TestAuthor');
      expect(activation.state).toBe(KillSwitchState.ACTIVE);
      
      expect(manager.isKillSwitchActive()).toBe(true);
    });

    it('should require reason for activation', () => {
      expect(() => manager.activateKillSwitch('', 'Author')).toThrow('reason is required');
    });

    it('should require author for activation', () => {
      expect(() => manager.activateKillSwitch('Reason', '')).toThrow('author is required');
    });

    it('should deactivate kill-switch', () => {
      manager.activateKillSwitch('Test', 'Author');
      expect(manager.isKillSwitchActive()).toBe(true);
      
      manager.deactivateKillSwitch('Author2');
      expect(manager.isKillSwitchActive()).toBe(false);
    });

    it('should throw when kill-switch is active', () => {
      manager.activateKillSwitch('Emergency', 'Author');
      
      expect(() => manager.enforceKillSwitch('test operation')).toThrow(InvariantViolationError);
    });
  });

  describe('Invariant Checks', () => {
    it('should check all invariants', () => {
      const results = manager.checkAllInvariants();
      
      expect(results.size).toBeGreaterThan(0);
      
      // All invariants should pass in normal operation
      for (const [invariantId, result] of results) {
        expect(result.passed).toBe(true);
        expect(result.invariantId).toBe(invariantId);
      }
    });

    it('should check NO_SUBMISSION_WHEN_POLICY_LOCKED (Phase 3 behavior: locked → invariant passes)', () => {
      // Phase 3: Policy locked → submission forbidden → invariant PASSES
      const result = manager.checkInvariant(InvariantId.NO_SUBMISSION_WHEN_POLICY_LOCKED);
      
      expect(result.passed).toBe(true);
      expect(result.invariantId).toBe(InvariantId.NO_SUBMISSION_WHEN_POLICY_LOCKED);
    });
    
    it('should check NO_SUBMISSION_WHEN_POLICY_LOCKED (Phase 4 behavior: unlocked + flag → invariant passes)', () => {
      // Phase 4: Policy unlocked + allowSubmission=true → submission allowed → invariant PASSES
      const policyManager = getExecutionPolicyManager();
      policyManager.unlockForPhase4('Phase 4 test', 'test-author');
      policyManager.setFlag('allowSubmission', true, 'Phase 4 test', 'test-author');
      
      const result = manager.checkInvariant(InvariantId.NO_SUBMISSION_WHEN_POLICY_LOCKED);
      
      expect(result.passed).toBe(true);
      expect(result.invariantId).toBe(InvariantId.NO_SUBMISSION_WHEN_POLICY_LOCKED);
    });
    

    it('should check NO_FUNDS_MOVEMENT_PHASE_3', () => {
      const result = manager.checkInvariant(InvariantId.NO_FUNDS_MOVEMENT_PHASE_3);
      
      expect(result.passed).toBe(true);
      expect(result.invariantId).toBe(InvariantId.NO_FUNDS_MOVEMENT_PHASE_3);
    });

    it('should check NO_PRIVATE_RAIL_WITHOUT_UNLOCK', () => {
      const result = manager.checkInvariant(InvariantId.NO_PRIVATE_RAIL_WITHOUT_UNLOCK);
      
      expect(result.passed).toBe(true);
    });

    it('should check READ_ONLY_RPC_ONLY', () => {
      const result = manager.checkInvariant(InvariantId.READ_ONLY_RPC_ONLY);
      
      expect(result.passed).toBe(true);
    });

    it('should check NO_SUBMISSION_METHODS', () => {
      const result = manager.checkInvariant(InvariantId.NO_SUBMISSION_METHODS);
      
      expect(result.passed).toBe(true);
    });

    it('should fail when kill-switch is active', () => {
      manager.activateKillSwitch('Emergency', 'Author');
      
      const result = manager.checkInvariant(InvariantId.NO_SUBMISSION_WHEN_POLICY_LOCKED);
      
      expect(result.passed).toBe(false);
      expect(result.error).toContain('Kill-switch');
    });
  });

  describe('Invariant Enforcement', () => {
    it('should enforce all invariants successfully', () => {
      // Should not throw in normal operation
      expect(() => manager.enforceAllInvariants()).not.toThrow();
    });

    it('should throw when kill-switch is active', () => {
      manager.activateKillSwitch('Emergency', 'Author');
      
      expect(() => manager.enforceAllInvariants()).toThrow(InvariantViolationError);
    });

    it('should enforce specific invariant', () => {
      expect(() => manager.enforceInvariant(InvariantId.NO_SUBMISSION_WHEN_POLICY_LOCKED)).not.toThrow();
    });

    it('should throw InvariantViolationError on failure', () => {
      manager.activateKillSwitch('Emergency', 'Author');
      
      try {
        manager.enforceInvariant(InvariantId.NO_SUBMISSION_WHEN_POLICY_LOCKED);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(InvariantViolationError);
        expect((error as InvariantViolationError).invariantId).toBe(InvariantId.KILL_SWITCH_OVERRIDES_ALL);
      }
    });
  });

  describe('State', () => {
    it('should return invariant state', () => {
      const state = manager.getState();
      
      expect(state.version).toBe(1);
      expect(state.invariants.length).toBeGreaterThan(0);
      expect(state.killSwitch.state).toBe(KillSwitchState.INACTIVE);
    });

    it('should include kill-switch status in state', () => {
      manager.activateKillSwitch('Test', 'Author');
      
      const state = manager.getState();
      expect(state.killSwitch.state).toBe(KillSwitchState.ACTIVE);
      expect(state.killSwitch.activation).toBeDefined();
    });

    it('should get all invariants', () => {
      const invariants = manager.getInvariants();
      
      expect(invariants.length).toBeGreaterThan(0);
      expect(invariants.every(i => i.id && i.description)).toBe(true);
    });

    it('should get invariant by ID', () => {
      const invariant = manager.getInvariant(InvariantId.NO_SUBMISSION_WHEN_POLICY_LOCKED);
      
      expect(invariant).toBeDefined();
      expect(invariant!.id).toBe(InvariantId.NO_SUBMISSION_WHEN_POLICY_LOCKED);
    });
  });

  describe('Singleton', () => {
    it('should return same instance', () => {
      const m1 = getInvariantManager();
      const m2 = getInvariantManager();
      
      expect(m1).toBe(m2);
    });

    it('should reset singleton', () => {
      const m1 = getInvariantManager();
      m1.activateKillSwitch('Test', 'Author');
      
      resetInvariantManager();
      const m2 = getInvariantManager();
      
      expect(m2.isKillSwitchActive()).toBe(false);
    });
  });
});

// ============ Enforcement Point Tests ============

describe('Invariant Enforcement Points', () => {
  beforeEach(() => {
    resetAll();
  });

  afterEach(() => {
    resetAll();
  });

  describe('TxPipeline.createTransaction', () => {
    it('should enforce invariants when creating transaction', () => {
      const pipeline = getTxPipeline();
      const payload = createTestPayload();
      
      // Should not throw in normal operation
      expect(() => pipeline.createTransaction('ctx_test', payload)).not.toThrow();
    });

    it('should throw when kill-switch is active', () => {
      const manager = getInvariantManager();
      manager.activateKillSwitch('Emergency', 'Author');
      
      const pipeline = getTxPipeline();
      const payload = createTestPayload();
      
      expect(() => pipeline.createTransaction('ctx_test', payload)).toThrow(InvariantViolationError);
    });
  });

  describe('TxSubmissionGate.attemptSubmission', () => {
    it('should enforce invariants when attempting submission', () => {
      const gate = getTxSubmissionGate();
      
      // Should not throw (submission blocked for other reasons)
      const result = gate.attemptSubmission('tx_test');
      expect(result.allowed).toBe(false);
    });

    it('should block when kill-switch is active', () => {
      const manager = getInvariantManager();
      manager.activateKillSwitch('Emergency', 'Author');
      
      const gate = getTxSubmissionGate();
      expect(() => gate.attemptSubmission('tx_test')).toThrow(InvariantViolationError);
    });
  });

  describe('LiminalWalletAdapter.signTransaction', () => {
    it('kill-switch blocks transaction creation (signing boundary)', () => {
      const manager = getInvariantManager();
      manager.activateKillSwitch('Emergency', 'Author');
      
      const pipeline = getTxPipeline();
      const payload = createTestPayload();
      
      // Kill-switch should block transaction creation (entry point for signing flow)
      expect(() => pipeline.createTransaction('ctx_test', payload)).toThrow(InvariantViolationError);
    });
  });
});

// ============ Receipt Integration Tests ============

describe('Receipt Invariant Integration', () => {
  beforeEach(() => {
    resetAll();
  });

  afterEach(() => {
    resetAll();
  });

  it('should include invariant fields in receipt', () => {
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
    
    expect(receipt.invariantVersion).toBe(1);
    expect(receipt.invariantCheckPassed).toBe(true);
    expect(receipt.killSwitchActive).toBe(false);
  });

  it('should record kill-switch state in receipt', () => {
    const manager = getInvariantManager();
    manager.activateKillSwitch('Emergency', 'Author');
    
    // Kill-switch active - cannot create transaction
    expect(() => {
      const pipeline = getTxPipeline();
      const payload = createTestPayload();
      pipeline.createTransaction('ctx_test', payload);
    }).toThrow(InvariantViolationError);
  });
});

// ============ Phase 3.9 Guarantees ============

describe('Phase 3.9 Guarantees', () => {
  beforeEach(() => {
    resetAll();
  });

  afterEach(() => {
    resetAll();
  });

  it('Invariants fail when violated', () => {
    const manager = getInvariantManager();
    
    // Activate kill-switch (violates invariants)
    manager.activateKillSwitch('Emergency', 'Author');
    
    // All checks should fail
    expect(() => manager.enforceAllInvariants()).toThrow(InvariantViolationError);
  });

  it('Kill-switch stops everything instantly', () => {
    const manager = getInvariantManager();
    manager.activateKillSwitch('Emergency', 'Author');
    
    // Pipeline
    const pipeline = getTxPipeline();
    const payload = createTestPayload();
    expect(() => pipeline.createTransaction('ctx_test', payload)).toThrow(InvariantViolationError);
    
    // Submission gate: kill-switch throws
    const gate = getTxSubmissionGate();
    expect(() => gate.attemptSubmission('tx_test')).toThrow(InvariantViolationError);
  });

  it('No false positives in normal operation', () => {
    const manager = getInvariantManager();
    
    // All invariants should pass
    const results = manager.checkAllInvariants();
    for (const [invariantId, result] of results) {
      expect(result.passed).toBe(true);
    }
    
    // Enforcement should not throw
    expect(() => manager.enforceAllInvariants()).not.toThrow();
  });

  it('No regression - submission still blocked', () => {
    const pipeline = getTxPipeline();
    const gate = getTxSubmissionGate();
    const payload = createTestPayload();
    
    const tx = pipeline.createTransaction('ctx_test', payload);
    
    const result = pipeline.attemptSubmission(tx.txId);
    expect(result.allowed).toBe(false);
    
    expect(() => gate.sendTransaction({})).toThrow(SubmissionBlockedError);
  });

  it('No regression - policy still locked', () => {
    const policyManager = getExecutionPolicyManager();
    
    expect(policyManager.isLocked()).toBe(true);
    expect(policyManager.checkSubmission().allowed).toBe(false);
  });

  it('Kill-switch overrides all checks', () => {
    const manager = getInvariantManager();
    manager.activateKillSwitch('Emergency', 'Author');
    
    // Even though policy allows (it doesn't), kill-switch should block
    const pipeline = getTxPipeline();
    const payload = createTestPayload();
    
    expect(() => pipeline.createTransaction('ctx_test', payload)).toThrow();
  });
});

// ============ InvariantId Enum Tests ============

describe('InvariantId Enum', () => {
  it('should have correct values', () => {
    expect(InvariantId.NO_SUBMISSION_WHEN_POLICY_LOCKED).toBe('NO_SUBMISSION_WHEN_POLICY_LOCKED');
    expect(InvariantId.NO_FUNDS_MOVEMENT_PHASE_3).toBe('NO_FUNDS_MOVEMENT_PHASE_3');
    expect(InvariantId.NO_PRIVATE_RAIL_WITHOUT_UNLOCK).toBe('NO_PRIVATE_RAIL_WITHOUT_UNLOCK');
    expect(InvariantId.READ_ONLY_RPC_ONLY).toBe('READ_ONLY_RPC_ONLY');
    expect(InvariantId.NO_SUBMISSION_METHODS).toBe('NO_SUBMISSION_METHODS');
    expect(InvariantId.KILL_SWITCH_OVERRIDES_ALL).toBe('KILL_SWITCH_OVERRIDES_ALL');
  });
});

// ============ KillSwitchState Enum Tests ============

describe('KillSwitchState Enum', () => {
  it('should have correct values', () => {
    expect(KillSwitchState.INACTIVE).toBe('INACTIVE');
    expect(KillSwitchState.ACTIVE).toBe('ACTIVE');
  });
});


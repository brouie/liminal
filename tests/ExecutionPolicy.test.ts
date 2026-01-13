/**
 * Liminal - Execution Policy Tests
 * 
 * Tests for Phase 3.7: Policy Lock & Enablement Firewall
 * 
 * VERIFICATION:
 * - Submission remains blocked when policy locked
 * - Private rail remains unavailable when policy locked
 * - Unlock required before any flag change
 * - Deterministic behavior
 * - No regression to previous phases
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  PolicyLockStatus,
  PrivateRailStatus,
  TxState,
  SimulatedTxPayload,
  SubmissionBlockReason,
  PolicyViolationError,
} from '../src/shared/tx-types';
import {
  ExecutionPolicyManager,
  getExecutionPolicyManager,
  resetExecutionPolicyManager,
} from '../src/main/modules/policy/ExecutionPolicyManager';
import {
  getTxSubmissionGate,
  resetTxSubmissionGate,
  SubmissionBlockedError,
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
  resetTxSubmissionGate();
  resetNullPrivateRailAdapter();
  resetStrategySelector();
  resetRpcEndpointPool();
  resetRpcRouteManager();
  resetReadOnlyRpcClient();
  resetTxStateMachine();
  resetTxPipeline();
}

// ============ ExecutionPolicyManager Tests ============

describe('ExecutionPolicyManager', () => {
  let policyManager: ExecutionPolicyManager;

  beforeEach(() => {
    resetAll();
    policyManager = getExecutionPolicyManager();
  });

  afterEach(() => {
    resetAll();
  });

  describe('Default State', () => {
    it('should be locked by default', () => {
      expect(policyManager.isLocked()).toBe(true);
      expect(policyManager.getLockStatus()).toBe(PolicyLockStatus.LOCKED);
    });

    it('should have all flags set to false by default', () => {
      const flags = policyManager.getFlags();
      
      expect(flags.allowSubmission).toBe(false);
      expect(flags.allowPrivateRail).toBe(false);
      expect(flags.allowRelayer).toBe(false);
      expect(flags.allowZkProofs).toBe(false);
      expect(flags.allowFundMovement).toBe(false);
    });

    it('should have version 1 initially', () => {
      expect(policyManager.getVersion()).toBe(1);
    });

    it('should have empty unlock history initially', () => {
      expect(policyManager.getUnlockHistory()).toEqual([]);
    });
  });

  describe('Policy Checks', () => {
    it('should block submission by default', () => {
      const result = policyManager.checkSubmission();
      
      expect(result.allowed).toBe(false);
      expect(result.blockedByFlag).toBe('allowSubmission');
      expect(result.reason).toContain('blocked by policy');
    });

    it('should block private rail by default', () => {
      const result = policyManager.checkPrivateRail();
      
      expect(result.allowed).toBe(false);
      expect(result.blockedByFlag).toBe('allowPrivateRail');
    });

    it('should block relayer by default', () => {
      const result = policyManager.checkRelayer();
      
      expect(result.allowed).toBe(false);
      expect(result.blockedByFlag).toBe('allowRelayer');
    });

    it('should block ZK proofs by default', () => {
      const result = policyManager.checkZkProofs();
      
      expect(result.allowed).toBe(false);
      expect(result.blockedByFlag).toBe('allowZkProofs');
    });

    it('should block fund movement by default', () => {
      const result = policyManager.checkFundMovement();
      
      expect(result.allowed).toBe(false);
      expect(result.blockedByFlag).toBe('allowFundMovement');
    });
  });

  describe('Policy Enforcement', () => {
    it('should throw PolicyViolationError for submission', () => {
      expect(() => policyManager.enforceSubmission()).toThrow(PolicyViolationError);
    });

    it('should throw PolicyViolationError for private rail', () => {
      expect(() => policyManager.enforcePrivateRail()).toThrow(PolicyViolationError);
    });

    it('should throw PolicyViolationError for relayer', () => {
      expect(() => policyManager.enforceRelayer()).toThrow(PolicyViolationError);
    });

    it('should throw PolicyViolationError for fund movement', () => {
      expect(() => policyManager.enforceFundMovement()).toThrow(PolicyViolationError);
    });

    it('should include policy version in error', () => {
      try {
        policyManager.enforceSubmission();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(PolicyViolationError);
        expect((error as PolicyViolationError).policyVersion).toBe(1);
      }
    });
  });

  describe('Unlock Requests', () => {
    it('should require reason for unlock', () => {
      expect(() => policyManager.requestUnlock('', 'author')).toThrow('reason is required');
    });

    it('should require author for unlock', () => {
      expect(() => policyManager.requestUnlock('reason', '')).toThrow('author is required');
    });

    it('should record unlock attempt', () => {
      const record = policyManager.requestUnlock('Test reason', 'Test author');
      
      expect(record.unlockId).toBeDefined();
      expect(record.reason).toBe('Test reason');
      expect(record.author).toBe('Test author');
      expect(record.approved).toBe(false); // Never approved in Phase 3.7
    });

    it('should increment version on unlock attempt', () => {
      const versionBefore = policyManager.getVersion();
      policyManager.requestUnlock('Test reason', 'Test author');
      const versionAfter = policyManager.getVersion();
      
      expect(versionAfter).toBe(versionBefore + 1);
    });

    it('should remain locked after unlock request', () => {
      policyManager.requestUnlock('Test reason', 'Test author');
      
      expect(policyManager.isLocked()).toBe(true);
    });

    it('should add unlock to history', () => {
      policyManager.requestUnlock('Test reason', 'Test author');
      
      const history = policyManager.getUnlockHistory();
      expect(history.length).toBe(1);
      expect(history[0].reason).toBe('Test reason');
    });
  });

  describe('Flag Change Requests', () => {
    it('should require reason for flag change', () => {
      expect(() => policyManager.requestFlagChange('allowSubmission', true, '', 'author'))
        .toThrow('reason is required');
    });

    it('should require author for flag change', () => {
      expect(() => policyManager.requestFlagChange('allowSubmission', true, 'reason', ''))
        .toThrow('author is required');
    });

    it('should record flag change attempt', () => {
      const record = policyManager.requestFlagChange(
        'allowSubmission',
        true,
        'Test reason',
        'Test author'
      );
      
      expect(record.flag).toBe('allowSubmission');
      expect(record.newValue).toBe(true);
      expect(record.previousValue).toBe(false);
      expect(record.approved).toBe(false); // Never approved in Phase 3.7
    });

    it('should NOT change flag value in Phase 3.7', () => {
      policyManager.requestFlagChange('allowSubmission', true, 'Test reason', 'Test author');
      
      const flags = policyManager.getFlags();
      expect(flags.allowSubmission).toBe(false); // Still false
    });

    it('should add flag change to audit log', () => {
      policyManager.requestFlagChange('allowSubmission', true, 'Test reason', 'Test author');
      
      const log = policyManager.getAuditLog();
      expect(log.length).toBe(1);
      expect(log[0].flag).toBe('allowSubmission');
    });
  });

  describe('Audit Trail', () => {
    it('should track all unlock attempts', () => {
      policyManager.requestUnlock('Reason 1', 'Author 1');
      policyManager.requestFlagChange('allowSubmission', true, 'Reason 2', 'Author 2');
      policyManager.requestFlagChange('allowPrivateRail', true, 'Reason 3', 'Author 3');
      
      const log = policyManager.getAuditLog();
      expect(log.length).toBe(3);
    });

    it('should include timestamps', () => {
      const before = Date.now();
      policyManager.requestUnlock('Test', 'Author');
      const after = Date.now();
      
      const log = policyManager.getAuditLog();
      expect(log[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(log[0].timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('Singleton', () => {
    it('should return same instance', () => {
      const pm1 = getExecutionPolicyManager();
      const pm2 = getExecutionPolicyManager();
      
      expect(pm1).toBe(pm2);
    });

    it('should reset singleton', () => {
      const pm1 = getExecutionPolicyManager();
      pm1.requestUnlock('Test', 'Author');
      
      resetExecutionPolicyManager();
      const pm2 = getExecutionPolicyManager();
      
      expect(pm2.getAuditLog()).toEqual([]);
    });
  });
});

// ============ TxSubmissionGate Policy Integration ============

describe('TxSubmissionGate Policy Integration', () => {
  beforeEach(() => {
    resetAll();
  });

  afterEach(() => {
    resetAll();
  });

  it('should block submission due to policy', () => {
    const gate = getTxSubmissionGate();
    const result = gate.attemptSubmission('tx_test');
    
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe(SubmissionBlockReason.POLICY_BLOCKED);
    expect(result.policyVersion).toBeDefined();
  });

  it('should include policy version in result', () => {
    const gate = getTxSubmissionGate();
    const policyManager = getExecutionPolicyManager();
    
    const result = gate.attemptSubmission('tx_test');
    
    expect(result.policyVersion).toBe(policyManager.getVersion());
  });

  it('should block all submission methods', () => {
    const gate = getTxSubmissionGate();
    
    expect(() => gate.sendTransaction({})).toThrow(SubmissionBlockedError);
    expect(() => gate.sendRawTransaction({})).toThrow(SubmissionBlockedError);
    expect(() => gate.submitTransaction({})).toThrow(SubmissionBlockedError);
  });
});

// ============ PrivateRailAdapter Policy Integration ============

describe('PrivateRailAdapter Policy Integration', () => {
  beforeEach(() => {
    resetAll();
  });

  afterEach(() => {
    resetAll();
  });

  it('should return DISABLED_BY_POLICY status', () => {
    const adapter = getNullPrivateRailAdapter();
    
    // Policy blocks private rail, so status should reflect that
    expect(adapter.getStatus()).toBe(PrivateRailStatus.DISABLED_BY_POLICY);
  });

  it('should not be available due to policy', () => {
    const adapter = getNullPrivateRailAdapter();
    
    expect(adapter.isAvailable()).toBe(false);
  });

  it('should include policy reason in prepare result', async () => {
    const adapter = getNullPrivateRailAdapter();
    const payload = createTestPayload();
    
    const result = await adapter.prepare(payload, {
      txId: 'tx_test',
      contextId: 'ctx_test',
      origin: 'https://example.com',
      txType: 'TRANSFER' as any,
      riskLevel: 'LOW',
    });
    
    expect(result.success).toBe(false);
    expect(result.available).toBe(false);
    expect(result.reason).toContain('policy');
  });
});

// ============ TxPipeline Policy Integration ============

describe('TxPipeline Policy Integration', () => {
  beforeEach(() => {
    resetAll();
  });

  afterEach(() => {
    resetAll();
  });

  it('should expose policy state', () => {
    const pipeline = getTxPipeline();
    
    const state = pipeline.getPolicyState();
    
    expect(state.version).toBe(1);
    expect(state.lockStatus).toBe(PolicyLockStatus.LOCKED);
    expect(state.flags.allowSubmission).toBe(false);
    expect(state.flags.allowPrivateRail).toBe(false);
  });

  it('should expose policy manager', () => {
    const pipeline = getTxPipeline();
    
    const manager = pipeline.getPolicyManager();
    
    expect(manager).toBeDefined();
    expect(manager.isLocked()).toBe(true);
  });

  it('should include policy in receipt', () => {
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
    
    expect(receipt.policyVersion).toBe(1);
    expect(receipt.policyLockStatus).toBe(PolicyLockStatus.LOCKED);
    expect(receipt.policyAllowsSubmission).toBe(false);
    expect(receipt.policyAllowsPrivateRail).toBe(false);
  });
});

// ============ Phase 3.7 Guarantees ============

describe('Phase 3.7 Guarantees', () => {
  beforeEach(() => {
    resetAll();
  });

  afterEach(() => {
    resetAll();
  });

  it('Submission remains blocked when policy locked', () => {
    const gate = getTxSubmissionGate();
    const policyManager = getExecutionPolicyManager();
    
    expect(policyManager.isLocked()).toBe(true);
    
    const result = gate.attemptSubmission('tx_test');
    expect(result.allowed).toBe(false);
  });

  it('Private rail remains unavailable when policy locked', () => {
    const adapter = getNullPrivateRailAdapter();
    const policyManager = getExecutionPolicyManager();
    
    expect(policyManager.isLocked()).toBe(true);
    expect(adapter.isAvailable()).toBe(false);
  });

  it('Unlock required before any flag change', () => {
    const policyManager = getExecutionPolicyManager();
    
    // Attempt to change flag
    policyManager.requestFlagChange('allowSubmission', true, 'Test', 'Author');
    
    // Flag should NOT be changed
    expect(policyManager.getFlags().allowSubmission).toBe(false);
  });

  it('Deterministic policy behavior', () => {
    const pm1 = getExecutionPolicyManager();
    const check1 = pm1.checkSubmission();
    
    resetExecutionPolicyManager();
    
    const pm2 = getExecutionPolicyManager();
    const check2 = pm2.checkSubmission();
    
    expect(check1.allowed).toBe(check2.allowed);
    expect(check1.blockedByFlag).toBe(check2.blockedByFlag);
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

  it('No regression - private rail still unavailable', async () => {
    const adapter = getNullPrivateRailAdapter();
    const payload = createTestPayload();
    
    const result = await adapter.estimate(payload);
    expect(result.success).toBe(false);
    expect(result.available).toBe(false);
  });

  it('Policy provides defense in depth', () => {
    const gate = getTxSubmissionGate();
    const policyManager = getExecutionPolicyManager();
    
    // Gate blocks
    const gateResult = gate.attemptSubmission('tx_test');
    expect(gateResult.allowed).toBe(false);
    
    // Policy also blocks
    const policyResult = policyManager.checkSubmission();
    expect(policyResult.allowed).toBe(false);
    
    // Both layers protect
    expect(gateResult.reasonCode).toBe(SubmissionBlockReason.POLICY_BLOCKED);
  });
});

// ============ PolicyLockStatus Enum Tests ============

describe('PolicyLockStatus Enum', () => {
  it('should have correct values', () => {
    expect(PolicyLockStatus.LOCKED).toBe('LOCKED');
    expect(PolicyLockStatus.UNLOCKED).toBe('UNLOCKED');
    expect(PolicyLockStatus.PENDING_UNLOCK).toBe('PENDING_UNLOCK');
  });
});

// ============ SubmissionBlockReason POLICY_BLOCKED ============

describe('SubmissionBlockReason.POLICY_BLOCKED', () => {
  it('should exist', () => {
    expect(SubmissionBlockReason.POLICY_BLOCKED).toBe('POLICY_BLOCKED');
  });

  it('should be used when policy blocks', () => {
    resetAll();
    const gate = getTxSubmissionGate();
    
    const result = gate.attemptSubmission('tx_test');
    
    expect(result.reasonCode).toBe(SubmissionBlockReason.POLICY_BLOCKED);
  });
});


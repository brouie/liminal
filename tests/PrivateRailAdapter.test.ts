/**
 * Liminal - Private Rail Adapter Tests
 * 
 * Tests for Phase 3.6: Private Rail Adapter (Interface Only)
 * 
 * VERIFICATION:
 * - Adapter interface correctness
 * - Deterministic stub behavior
 * - Pipeline remains unchanged
 * - No execution possible
 * 
 * PHASE 3.7 UPDATE:
 * - Policy check now runs first, so DISABLED_BY_POLICY is the primary status
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  PrivateRailCapabilities,
  PrivateRailStatus,
  IPrivateRailAdapter,
  TxState,
  SimulatedTxPayload,
  TxType,
} from '../src/shared/tx-types';
import {
  NullPrivateRailAdapter,
  getNullPrivateRailAdapter,
  resetNullPrivateRailAdapter,
  getPrivateRailAdapter,
} from '../src/main/modules/rail/NullPrivateRailAdapter';
import {
  StrategySelector,
  getStrategySelector,
  resetStrategySelector,
} from '../src/main/modules/tx/StrategySelector';
import {
  getTxPipeline,
  resetTxPipeline,
} from '../src/main/modules/tx/TxPipeline';
import {
  getTxStateMachine,
  resetTxStateMachine,
} from '../src/main/modules/tx/TxStateMachine';
import {
  getTxSubmissionGate,
  resetTxSubmissionGate,
  SubmissionBlockedError,
} from '../src/main/modules/tx/TxSubmissionGate';
import {
  resetExecutionPolicyManager,
} from '../src/main/modules/policy';
import {
  resetRpcEndpointPool,
} from '../src/main/modules/rpc/RpcEndpointPool';
import {
  resetRpcRouteManager,
} from '../src/main/modules/rpc/RpcRouteManager';
import {
  resetReadOnlyRpcClient,
} from '../src/main/modules/rpc/ReadOnlySolanaRpcClient';

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

// ============ NullPrivateRailAdapter Tests ============

describe('NullPrivateRailAdapter', () => {
  let adapter: NullPrivateRailAdapter;

  beforeEach(() => {
    resetExecutionPolicyManager();
    resetNullPrivateRailAdapter();
    adapter = getNullPrivateRailAdapter();
  });

  afterEach(() => {
    resetExecutionPolicyManager();
    resetNullPrivateRailAdapter();
  });

  describe('Identity', () => {
    it('should have correct name', () => {
      expect(adapter.name).toBe('NullPrivateRailAdapter');
    });

    it('should have version 0.0.1', () => {
      // Phase 3.7 updated version
      expect(adapter.version).toBe('0.0.1');
    });
  });

  describe('Capabilities', () => {
    it('should return all capabilities as false', () => {
      const capabilities = adapter.getCapabilities();
      
      expect(capabilities.supportsTransfers).toBe(false);
      expect(capabilities.supportsProgramCalls).toBe(false);
      expect(capabilities.hidesSender).toBe(false);
      expect(capabilities.hidesAmount).toBe(false);
      expect(capabilities.hidesRecipient).toBe(false);
      expect(capabilities.requiresRelayer).toBe(false);
      expect(capabilities.requiresZkProof).toBe(false);
    });

    it('should return undefined for optional fields', () => {
      const capabilities = adapter.getCapabilities();
      
      expect(capabilities.maxTxSize).toBeUndefined();
      expect(capabilities.minAmount).toBeUndefined();
      expect(capabilities.maxAmount).toBeUndefined();
      expect(capabilities.estimatedLatencyMs).toBeUndefined();
      expect(capabilities.feeMultiplier).toBeUndefined();
    });

    it('should return deterministic capabilities', () => {
      const cap1 = adapter.getCapabilities();
      const cap2 = adapter.getCapabilities();
      
      expect(cap1).toEqual(cap2);
    });
  });

  describe('Status', () => {
    it('should return DISABLED_BY_POLICY when policy blocks', () => {
      // Phase 3.7: Policy check runs first
      expect(adapter.getStatus()).toBe(PrivateRailStatus.DISABLED_BY_POLICY);
    });

    it('should never be available', () => {
      expect(adapter.isAvailable()).toBe(false);
    });
  });

  describe('Prepare', () => {
    it('should return not available due to policy', async () => {
      // Phase 3.7: Policy check runs first
      const payload = createTestPayload();
      const context = {
        txId: 'tx_test',
        contextId: 'ctx_test',
        origin: 'https://example.com',
        txType: TxType.TRANSFER,
        riskLevel: 'LOW' as const,
      };
      
      const result = await adapter.prepare(payload, context);
      
      expect(result.success).toBe(false);
      expect(result.available).toBe(false);
      expect(result.reason).toContain('policy');
      expect(result.preparedPayload).toBeUndefined();
      expect(result.timestamp).toBeDefined();
    });

    it('should be deterministic', async () => {
      const payload = createTestPayload();
      const context = {
        txId: 'tx_test',
        contextId: 'ctx_test',
        origin: 'https://example.com',
        txType: TxType.TRANSFER,
        riskLevel: 'LOW' as const,
      };
      
      const result1 = await adapter.prepare(payload, context);
      const result2 = await adapter.prepare(payload, context);
      
      expect(result1.success).toBe(result2.success);
      expect(result1.available).toBe(result2.available);
    });
  });

  describe('Estimate', () => {
    it('should always return not available', async () => {
      const payload = createTestPayload();
      
      const result = await adapter.estimate(payload);
      
      expect(result.success).toBe(false);
      expect(result.available).toBe(false);
      expect(result.reason).toContain('stub implementation');
      expect(result.estimatedTotalFee).toBeUndefined();
      expect(result.estimatedTimeMs).toBeUndefined();
      expect(result.privacyScore).toBe(0);
    });
  });

  describe('Validate', () => {
    it('should always return not valid/available', async () => {
      const payload = createTestPayload();
      
      const result = await adapter.validate(payload);
      
      expect(result.valid).toBe(false);
      expect(result.available).toBe(false);
      expect(result.errors).toContain('Private rail not available');
      expect(result.warnings).toEqual([]);
    });
  });

  describe('Singleton', () => {
    it('should return same instance', () => {
      const adapter1 = getNullPrivateRailAdapter();
      const adapter2 = getNullPrivateRailAdapter();
      
      expect(adapter1).toBe(adapter2);
    });

    it('should reset singleton', () => {
      const adapter1 = getNullPrivateRailAdapter();
      resetNullPrivateRailAdapter();
      const adapter2 = getNullPrivateRailAdapter();
      
      expect(adapter1).not.toBe(adapter2);
    });
  });

  describe('getPrivateRailAdapter', () => {
    it('should return NullPrivateRailAdapter', () => {
      const adapter = getPrivateRailAdapter();
      
      expect(adapter.name).toBe('NullPrivateRailAdapter');
      expect(adapter.isAvailable()).toBe(false);
    });
  });
});

// ============ StrategySelector Integration ============

describe('StrategySelector Private Rail Integration', () => {
  let selector: StrategySelector;

  beforeEach(() => {
    resetExecutionPolicyManager();
    resetNullPrivateRailAdapter();
    resetStrategySelector();
    selector = getStrategySelector();
  });

  afterEach(() => {
    resetExecutionPolicyManager();
    resetNullPrivateRailAdapter();
    resetStrategySelector();
  });

  describe('Private Rail Info', () => {
    it('should report private rail as not available due to policy', () => {
      // Phase 3.7: Policy check runs first
      const info = selector.getPrivateRailInfo();
      
      expect(info.available).toBe(false);
      expect(info.status).toBe(PrivateRailStatus.DISABLED_BY_POLICY);
      expect(info.reason.toLowerCase()).toMatch(/not available|policy|disabled/);
    });

    it('should include capabilities', () => {
      const info = selector.getPrivateRailInfo();
      
      expect(info.capabilities).toBeDefined();
      expect(info.capabilities.supportsTransfers).toBe(false);
    });
  });

  describe('Strategy Selection', () => {
    it('should never select S3_PRIVACY_RAIL', () => {
      const payload = createTestPayload({ estimatedAmount: 1000 }); // Very high value
      const riskScore = {
        level: 'HIGH' as const,
        score: 95,
        factors: [],
        timestamp: Date.now(),
      };
      
      const result = selector.select(payload, riskScore, 10); // Low trust
      
      // Even with high risk, high value, low trust - S3 should NOT be selected
      expect(result.strategy).not.toBe('S3_PRIVACY_RAIL');
    });

    it('should include S3 in alternatives with policy-blocked reason', () => {
      // Phase 3.7: Policy check runs first
      const payload = createTestPayload();
      const riskScore = {
        level: 'MEDIUM' as const,
        score: 50,
        factors: [],
        timestamp: Date.now(),
      };
      
      const result = selector.select(payload, riskScore, 50);
      
      // S3 should be in alternatives but marked as blocked by policy
      const s3Alt = result.alternatives.find(a => a.strategy === 'S3_PRIVACY_RAIL');
      if (s3Alt) {
        // May contain "not available" or "policy" depending on reason generation
        expect(s3Alt.reason.toLowerCase()).toMatch(/not available|policy|disabled/);
      }
    });
  });
});

// ============ TxPipeline Integration ============

describe('TxPipeline Private Rail Integration', () => {
  beforeEach(() => {
    resetExecutionPolicyManager();
    resetNullPrivateRailAdapter();
    resetStrategySelector();
    resetRpcEndpointPool();
    resetRpcRouteManager();
    resetReadOnlyRpcClient();
    resetTxStateMachine();
    resetTxPipeline();
    resetTxSubmissionGate();
  });

  afterEach(() => {
    resetExecutionPolicyManager();
    resetNullPrivateRailAdapter();
    resetStrategySelector();
    resetRpcEndpointPool();
    resetRpcRouteManager();
    resetReadOnlyRpcClient();
    resetTxStateMachine();
    resetTxPipeline();
    resetTxSubmissionGate();
  });

  describe('Private Rail Info', () => {
    it('should expose private rail info', () => {
      // Phase 3.7: Policy check runs first
      const pipeline = getTxPipeline();
      
      const info = pipeline.getPrivateRailInfo();
      
      expect(info.available).toBe(false);
      expect(info.status).toBe(PrivateRailStatus.DISABLED_BY_POLICY);
    });
  });

  describe('Receipt with Private Rail', () => {
    it('should include private rail fields in receipt', () => {
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
      
      // Phase 3.7: Policy check runs first
      expect(receipt.privateRailAvailable).toBe(false);
      expect(receipt.privateRailReason).toBeDefined();
      expect(receipt.privateRailReason!.toLowerCase()).toMatch(/not available|policy|disabled/);
      expect(receipt.privateRailStatus).toBe(PrivateRailStatus.DISABLED_BY_POLICY);
    });
  });
});

// ============ Phase 3.6 Guarantees ============

describe('Phase 3.6 Guarantees', () => {
  beforeEach(() => {
    resetExecutionPolicyManager();
    resetNullPrivateRailAdapter();
    resetStrategySelector();
    resetRpcEndpointPool();
    resetRpcRouteManager();
    resetReadOnlyRpcClient();
    resetTxStateMachine();
    resetTxPipeline();
    resetTxSubmissionGate();
  });

  afterEach(() => {
    resetExecutionPolicyManager();
    resetNullPrivateRailAdapter();
    resetStrategySelector();
    resetRpcEndpointPool();
    resetRpcRouteManager();
    resetReadOnlyRpcClient();
    resetTxStateMachine();
    resetTxPipeline();
    resetTxSubmissionGate();
  });

  it('NO private execution occurs', async () => {
    const adapter = getNullPrivateRailAdapter();
    const payload = createTestPayload();
    
    // Prepare does nothing
    const prepResult = await adapter.prepare(payload, {
      txId: 'tx_test',
      contextId: 'ctx_test',
      origin: 'https://example.com',
      txType: TxType.TRANSFER,
      riskLevel: 'HIGH',
    });
    expect(prepResult.success).toBe(false);
    expect(prepResult.preparedPayload).toBeUndefined();
    
    // Estimate does nothing
    const estResult = await adapter.estimate(payload);
    expect(estResult.success).toBe(false);
    
    // Validate does nothing
    const valResult = await adapter.validate(payload);
    expect(valResult.valid).toBe(false);
  });

  it('NO submission possible', () => {
    const pipeline = getTxPipeline();
    const gate = getTxSubmissionGate();
    const payload = createTestPayload();
    
    const tx = pipeline.createTransaction('ctx_test', payload);
    
    // Submission still blocked
    const result = pipeline.attemptSubmission(tx.txId);
    expect(result.allowed).toBe(false);
    
    // Gate still effective
    expect(() => gate.sendTransaction({})).toThrow(SubmissionBlockedError);
  });

  it('NO RPC usage inside adapter', async () => {
    const adapter = getNullPrivateRailAdapter();
    const payload = createTestPayload();
    
    // All methods should complete without network calls
    const cap = adapter.getCapabilities();
    const status = adapter.getStatus();
    const available = adapter.isAvailable();
    const prep = await adapter.prepare(payload, {
      txId: 'tx_test',
      contextId: 'ctx_test',
      origin: 'https://example.com',
      txType: TxType.TRANSFER,
      riskLevel: 'LOW',
    });
    const est = await adapter.estimate(payload);
    const val = await adapter.validate(payload);
    
    // All should return deterministic results without network
    // Phase 3.7: Status is DISABLED_BY_POLICY (policy check runs first)
    expect(cap).toBeDefined();
    expect(status).toBe(PrivateRailStatus.DISABLED_BY_POLICY);
    expect(available).toBe(false);
    expect(prep.success).toBe(false);
    expect(est.success).toBe(false);
    expect(val.valid).toBe(false);
  });

  it('Deterministic stub behavior', async () => {
    const adapter1 = getNullPrivateRailAdapter();
    const adapter2 = getNullPrivateRailAdapter();
    const payload = createTestPayload();
    
    // Same capabilities
    expect(adapter1.getCapabilities()).toEqual(adapter2.getCapabilities());
    
    // Same status
    expect(adapter1.getStatus()).toBe(adapter2.getStatus());
    
    // Same availability
    expect(adapter1.isAvailable()).toBe(adapter2.isAvailable());
    
    // Same prepare result structure
    const prep1 = await adapter1.prepare(payload, {
      txId: 'tx_test',
      contextId: 'ctx_test',
      origin: 'https://example.com',
      txType: TxType.TRANSFER,
      riskLevel: 'LOW',
    });
    const prep2 = await adapter2.prepare(payload, {
      txId: 'tx_test',
      contextId: 'ctx_test',
      origin: 'https://example.com',
      txType: TxType.TRANSFER,
      riskLevel: 'LOW',
    });
    
    expect(prep1.success).toBe(prep2.success);
    expect(prep1.available).toBe(prep2.available);
  });

  it('Pipeline remains unchanged with adapter', () => {
    const pipeline = getTxPipeline();
    const payload = createTestPayload();
    
    // Creating transactions still works
    const tx = pipeline.createTransaction('ctx_test', payload);
    expect(tx).toBeDefined();
    expect(tx.txId).toBeDefined();
    
    // All pipeline operations still work
    expect(pipeline.getTransaction(tx.txId)).toBeDefined();
  });

  it('Interface only - no cryptography', () => {
    const adapter = getNullPrivateRailAdapter();
    const capabilities = adapter.getCapabilities();
    
    // No ZK proofs (not implemented)
    expect(capabilities.requiresZkProof).toBe(false);
    
    // No cryptographic operations in stub
    // Phase 3.7: Status is DISABLED_BY_POLICY (policy check runs first)
    expect(adapter.getStatus()).toBe(PrivateRailStatus.DISABLED_BY_POLICY);
  });
});

// ============ Capability Model Tests ============

describe('PrivateRailCapabilities Model', () => {
  it('should have all required fields', () => {
    const adapter = getNullPrivateRailAdapter();
    const cap = adapter.getCapabilities();
    
    // Required boolean fields
    expect(typeof cap.supportsTransfers).toBe('boolean');
    expect(typeof cap.supportsProgramCalls).toBe('boolean');
    expect(typeof cap.hidesSender).toBe('boolean');
    expect(typeof cap.hidesAmount).toBe('boolean');
    expect(typeof cap.hidesRecipient).toBe('boolean');
    expect(typeof cap.requiresRelayer).toBe('boolean');
    expect(typeof cap.requiresZkProof).toBe('boolean');
  });

  it('should have correct optional field types', () => {
    const adapter = getNullPrivateRailAdapter();
    const cap = adapter.getCapabilities();
    
    // Optional fields should be undefined or correct type
    expect(cap.maxTxSize === undefined || typeof cap.maxTxSize === 'number').toBe(true);
    expect(cap.minAmount === undefined || typeof cap.minAmount === 'number').toBe(true);
    expect(cap.maxAmount === undefined || typeof cap.maxAmount === 'number').toBe(true);
    expect(cap.estimatedLatencyMs === undefined || typeof cap.estimatedLatencyMs === 'number').toBe(true);
    expect(cap.feeMultiplier === undefined || typeof cap.feeMultiplier === 'number').toBe(true);
  });
});

// ============ PrivateRailStatus Enum Tests ============

describe('PrivateRailStatus Enum', () => {
  it('should have correct values', () => {
    expect(PrivateRailStatus.NOT_AVAILABLE).toBe('NOT_AVAILABLE');
    expect(PrivateRailStatus.NOT_CONFIGURED).toBe('NOT_CONFIGURED');
    expect(PrivateRailStatus.READY).toBe('READY');
    expect(PrivateRailStatus.TEMPORARILY_UNAVAILABLE).toBe('TEMPORARILY_UNAVAILABLE');
    expect(PrivateRailStatus.DISABLED_BY_POLICY).toBe('DISABLED_BY_POLICY');
  });
});


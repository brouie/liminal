/**
 * Liminal - Transaction Pipeline Tests
 * 
 * Tests for Phase 3.0: Transaction Execution Skeleton (Dry-Run)
 * 
 * VERIFICATION:
 * - State machine correctness
 * - Deterministic strategy selection
 * - NO real RPC calls
 * - NO signing
 * - NO Solana network usage
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TxState,
  TxType,
  TxStrategy,
  SimulatedTxPayload,
  TX_VALID_TRANSITIONS,
} from '../src/shared/tx-types';
import type { RiskLevel } from '../src/shared/ai-types';
import {
  TxStateMachine,
  getTxStateMachine,
  resetTxStateMachine,
  InvalidTxStateTransitionError,
  TxNotFoundError,
} from '../src/main/modules/tx/TxStateMachine';
import { TxClassifier, getTxClassifier } from '../src/main/modules/tx/TxClassifier';
import { TxRiskScorer, getTxRiskScorer } from '../src/main/modules/tx/TxRiskScorer';
import { StrategySelector, getStrategySelector } from '../src/main/modules/tx/StrategySelector';
import { DryRunExecutor, getDryRunExecutor } from '../src/main/modules/tx/DryRunExecutor';
import { TxPipeline, getTxPipeline, resetTxPipeline } from '../src/main/modules/tx/TxPipeline';

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

// ============ TxStateMachine Tests ============

describe('TxStateMachine', () => {
  let stateMachine: TxStateMachine;

  beforeEach(() => {
    resetTxStateMachine();
    stateMachine = getTxStateMachine();
  });

  afterEach(() => {
    resetTxStateMachine();
  });

  describe('Transaction Creation', () => {
    it('should create a transaction in TX_NEW state', () => {
      const payload = createTestPayload();
      const tx = stateMachine.createTransaction('ctx_test', payload);

      expect(tx.txId).toMatch(/^tx_/);
      expect(tx.contextId).toBe('ctx_test');
      expect(tx.state).toBe(TxState.TX_NEW);
      expect(tx.payload).toEqual(payload);
      expect(tx.stateHistory).toHaveLength(1);
      expect(tx.stateHistory[0].state).toBe(TxState.TX_NEW);
    });

    it('should generate unique transaction IDs', () => {
      const payload = createTestPayload();
      const tx1 = stateMachine.createTransaction('ctx_1', payload);
      const tx2 = stateMachine.createTransaction('ctx_1', payload);

      expect(tx1.txId).not.toBe(tx2.txId);
    });

    it('should track transactions by context', () => {
      const payload = createTestPayload();
      stateMachine.createTransaction('ctx_1', payload);
      stateMachine.createTransaction('ctx_1', payload);
      stateMachine.createTransaction('ctx_2', payload);

      const ctx1Txs = stateMachine.getContextTransactions('ctx_1');
      const ctx2Txs = stateMachine.getContextTransactions('ctx_2');

      expect(ctx1Txs).toHaveLength(2);
      expect(ctx2Txs).toHaveLength(1);
    });
  });

  describe('State Transitions', () => {
    it('should allow valid transitions', () => {
      const payload = createTestPayload();
      const tx = stateMachine.createTransaction('ctx_test', payload);

      // NEW -> CLASSIFY
      let updated = stateMachine.transitionTo(tx.txId, TxState.TX_CLASSIFY);
      expect(updated.state).toBe(TxState.TX_CLASSIFY);

      // CLASSIFY -> RISK_SCORE
      updated = stateMachine.transitionTo(tx.txId, TxState.TX_RISK_SCORE);
      expect(updated.state).toBe(TxState.TX_RISK_SCORE);

      // RISK_SCORE -> STRATEGY_SELECT
      updated = stateMachine.transitionTo(tx.txId, TxState.TX_STRATEGY_SELECT);
      expect(updated.state).toBe(TxState.TX_STRATEGY_SELECT);

      // STRATEGY_SELECT -> PREPARE
      updated = stateMachine.transitionTo(tx.txId, TxState.TX_PREPARE);
      expect(updated.state).toBe(TxState.TX_PREPARE);

      // PREPARE -> DRY_RUN
      updated = stateMachine.transitionTo(tx.txId, TxState.TX_DRY_RUN);
      expect(updated.state).toBe(TxState.TX_DRY_RUN);

      // DRY_RUN -> SIMULATED_CONFIRM
      updated = stateMachine.transitionTo(tx.txId, TxState.TX_SIMULATED_CONFIRM);
      expect(updated.state).toBe(TxState.TX_SIMULATED_CONFIRM);
    });

    it('should reject invalid transitions', () => {
      const payload = createTestPayload();
      const tx = stateMachine.createTransaction('ctx_test', payload);

      // NEW -> ACTIVE (invalid - must go through CLASSIFY first)
      expect(() => {
        stateMachine.transitionTo(tx.txId, TxState.TX_DRY_RUN);
      }).toThrow(InvalidTxStateTransitionError);
    });

    it('should allow abort from any non-terminal state', () => {
      const payload = createTestPayload();
      
      // Test abort from NEW
      let tx = stateMachine.createTransaction('ctx_1', payload);
      let aborted = stateMachine.abort(tx.txId, 'User cancelled');
      expect(aborted.state).toBe(TxState.TX_ABORTED);
      expect(aborted.abortReason).toBe('User cancelled');

      // Test abort from CLASSIFY
      tx = stateMachine.createTransaction('ctx_2', payload);
      stateMachine.transitionTo(tx.txId, TxState.TX_CLASSIFY);
      aborted = stateMachine.abort(tx.txId, 'Validation failed');
      expect(aborted.state).toBe(TxState.TX_ABORTED);
    });

    it('should not allow abort from terminal states', () => {
      const payload = createTestPayload();
      const tx = stateMachine.createTransaction('ctx_test', payload);
      stateMachine.abort(tx.txId, 'Initial abort');

      expect(() => {
        stateMachine.abort(tx.txId, 'Second abort');
      }).toThrow(InvalidTxStateTransitionError);
    });

    it('should record state history', () => {
      const payload = createTestPayload();
      const tx = stateMachine.createTransaction('ctx_test', payload);

      stateMachine.transitionTo(tx.txId, TxState.TX_CLASSIFY, 'Starting classification');
      stateMachine.transitionTo(tx.txId, TxState.TX_RISK_SCORE, 'Scoring risk');

      const updated = stateMachine.getTransaction(tx.txId)!;
      expect(updated.stateHistory).toHaveLength(3);
      expect(updated.stateHistory[1].reason).toBe('Starting classification');
      expect(updated.stateHistory[2].reason).toBe('Scoring risk');
    });
  });

  describe('State Validation', () => {
    it('should validate all defined transitions', () => {
      // Verify TX_VALID_TRANSITIONS is complete
      const allStates = Object.values(TxState);
      for (const state of allStates) {
        expect(TX_VALID_TRANSITIONS[state]).toBeDefined();
      }
    });

    it('should correctly identify terminal states', () => {
      const payload = createTestPayload();
      
      // SIMULATED_CONFIRM is terminal
      const tx1 = stateMachine.createTransaction('ctx_1', payload);
      stateMachine.transitionTo(tx1.txId, TxState.TX_CLASSIFY);
      stateMachine.transitionTo(tx1.txId, TxState.TX_RISK_SCORE);
      stateMachine.transitionTo(tx1.txId, TxState.TX_STRATEGY_SELECT);
      stateMachine.transitionTo(tx1.txId, TxState.TX_PREPARE);
      stateMachine.transitionTo(tx1.txId, TxState.TX_DRY_RUN);
      stateMachine.transitionTo(tx1.txId, TxState.TX_SIMULATED_CONFIRM);
      expect(stateMachine.isTerminal(tx1.txId)).toBe(true);

      // ABORTED is terminal
      const tx2 = stateMachine.createTransaction('ctx_2', payload);
      stateMachine.abort(tx2.txId, 'Aborted');
      expect(stateMachine.isTerminal(tx2.txId)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should throw TxNotFoundError for unknown transaction', () => {
      expect(() => {
        stateMachine.getState('nonexistent_tx');
      }).toThrow(TxNotFoundError);
    });

    it('should throw InvalidTxStateTransitionError with details', () => {
      const payload = createTestPayload();
      const tx = stateMachine.createTransaction('ctx_test', payload);

      try {
        stateMachine.transitionTo(tx.txId, TxState.TX_SIMULATED_CONFIRM);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidTxStateTransitionError);
        const tsError = error as InvalidTxStateTransitionError;
        expect(tsError.txId).toBe(tx.txId);
        expect(tsError.from).toBe(TxState.TX_NEW);
        expect(tsError.to).toBe(TxState.TX_SIMULATED_CONFIRM);
      }
    });
  });
});

// ============ TxClassifier Tests ============

describe('TxClassifier', () => {
  let classifier: TxClassifier;

  beforeEach(() => {
    classifier = getTxClassifier();
  });

  describe('Transaction Type Classification', () => {
    it('should classify token transfers', () => {
      const payload = createTestPayload({
        programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        instructionData: '03transfer',
      });

      const classification = classifier.classify(payload);
      expect(classification.type).toBe(TxType.TRANSFER);
      expect(classification.confidence).toBeGreaterThan(0);
    });

    it('should classify swaps', () => {
      const payload = createTestPayload({
        programId: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium
        instructionData: 'swap123',
      });

      const classification = classifier.classify(payload);
      expect(classification.type).toBe(TxType.SWAP);
    });

    it('should classify approvals', () => {
      const payload = createTestPayload({
        instructionData: 'approve_delegate',
      });

      const classification = classifier.classify(payload);
      expect(classification.type).toBe(TxType.APPROVAL);
    });

    it('should classify program interactions', () => {
      const payload = createTestPayload({
        programId: 'CustomProgram111111111111111111111111111111',
        instructionData: 'custom_instruction',
        instructionCount: 3,
      });

      const classification = classifier.classify(payload);
      expect(classification.type).toBe(TxType.PROGRAM_INTERACTION);
    });

    it('should handle unknown transactions', () => {
      const payload = createTestPayload({
        programId: 'Unknown11111111111111111111111111111111111',
        instructionData: '',
        instructionCount: 0,
        accounts: [],
        estimatedAmount: 0,
      });

      const classification = classifier.classify(payload);
      expect(classification.type).toBe(TxType.UNKNOWN);
      expect(classification.confidence).toBeLessThan(0.5);
    });
  });

  describe('Determinism', () => {
    it('should produce deterministic classifications', () => {
      const payload = createTestPayload();

      const result1 = classifier.classify(payload);
      const result2 = classifier.classify(payload);

      expect(result1.type).toBe(result2.type);
      expect(result1.confidence).toBe(result2.confidence);
      expect(result1.description).toBe(result2.description);
    });
  });

  describe('Metadata Extraction', () => {
    it('should extract metadata from payload', () => {
      const payload = createTestPayload({
        estimatedAmount: 5.5,
        instructionCount: 2,
      });

      const classification = classifier.classify(payload);
      expect(classification.metadata.estimatedAmount).toBe(5.5);
      expect(classification.metadata.instructionCount).toBe(2);
      expect(classification.metadata.programId).toBe(payload.programId);
    });
  });
});

// ============ TxRiskScorer Tests ============

describe('TxRiskScorer', () => {
  let riskScorer: TxRiskScorer;

  beforeEach(() => {
    riskScorer = getTxRiskScorer();
  });

  describe('Risk Scoring', () => {
    it('should score low-risk transactions correctly', () => {
      const result = riskScorer.score({
        originTrust: 90,
        contextRisk: 'LOW' as RiskLevel,
        txType: TxType.TRANSFER,
        estimatedAmount: 0.05,
        knownDestination: true,
        instructionCount: 1,
      });

      expect(result.level).toBe('LOW' as RiskLevel);
      expect(result.score).toBeLessThan(30);
    });

    it('should score high-risk transactions correctly', () => {
      const result = riskScorer.score({
        originTrust: 10,
        contextRisk: 'HIGH' as RiskLevel,
        txType: TxType.UNKNOWN,
        estimatedAmount: 100,
        knownDestination: false,
        instructionCount: 10,
      });

      expect(result.level).toBe('HIGH' as RiskLevel);
      expect(result.score).toBeGreaterThan(60);
    });

    it('should include risk factors', () => {
      const result = riskScorer.score({
        originTrust: 50,
        contextRisk: 'MEDIUM' as RiskLevel,
        txType: TxType.SWAP,
        estimatedAmount: 2,
        knownDestination: false,
        instructionCount: 3,
      });

      expect(result.factors.length).toBeGreaterThan(0);
      expect(result.factors.every(f => f.name && f.description)).toBe(true);
    });
  });

  describe('Determinism', () => {
    it('should produce deterministic risk scores', () => {
      const inputs = {
        originTrust: 50,
        contextRisk: 'MEDIUM' as RiskLevel,
        txType: TxType.TRANSFER,
        estimatedAmount: 1.5,
        knownDestination: false,
        instructionCount: 2,
      };

      const result1 = riskScorer.score(inputs);
      const result2 = riskScorer.score(inputs);

      expect(result1.level).toBe(result2.level);
      expect(result1.score).toBe(result2.score);
      expect(result1.factors).toEqual(result2.factors);
    });
  });

  describe('Factor Weights', () => {
    it('should weight amount appropriately', () => {
      const baseInputs = {
        originTrust: 50,
        contextRisk: 'MEDIUM' as RiskLevel,
        txType: TxType.TRANSFER,
        knownDestination: true,
        instructionCount: 1,
      };

      const lowAmount = riskScorer.score({ ...baseInputs, estimatedAmount: 0.01 });
      const highAmount = riskScorer.score({ ...baseInputs, estimatedAmount: 50 });

      expect(highAmount.score).toBeGreaterThan(lowAmount.score);
    });
  });
});

// ============ StrategySelector Tests ============

describe('StrategySelector', () => {
  let strategySelector: StrategySelector;
  let riskScorer: TxRiskScorer;

  beforeEach(() => {
    strategySelector = getStrategySelector();
    riskScorer = getTxRiskScorer();
  });

  describe('Strategy Selection', () => {
    it('should select S0_NORMAL for low-risk, trusted transactions', () => {
      const payload = createTestPayload({ estimatedAmount: 0.05 });
      const riskScore = riskScorer.score({
        originTrust: 90,
        contextRisk: 'LOW' as RiskLevel,
        txType: TxType.TRANSFER,
        estimatedAmount: 0.05,
        knownDestination: true,
        instructionCount: 1,
      });

      const selection = strategySelector.select(payload, riskScore, 90);
      expect(selection.strategy).toBe(TxStrategy.S0_NORMAL);
    });

    it('should select higher privacy for risky transactions', () => {
      const payload = createTestPayload({ estimatedAmount: 20 });
      const riskScore = riskScorer.score({
        originTrust: 20,
        contextRisk: 'HIGH' as RiskLevel,
        txType: TxType.APPROVAL,
        estimatedAmount: 20,
        knownDestination: false,
        instructionCount: 5,
      });

      const selection = strategySelector.select(payload, riskScore, 20);
      expect([TxStrategy.S1_RPC_PRIVACY, TxStrategy.S2_EPHEMERAL_SENDER]).toContain(
        selection.strategy
      );
    });

    it('should never select S3_PRIVACY_RAIL (not implemented)', () => {
      const payload = createTestPayload({ estimatedAmount: 1000 });
      const riskScore = riskScorer.score({
        originTrust: 0,
        contextRisk: 'HIGH' as RiskLevel,
        txType: TxType.UNKNOWN,
        estimatedAmount: 1000,
        knownDestination: false,
        instructionCount: 10,
      });

      const selection = strategySelector.select(payload, riskScore, 0);
      expect(selection.strategy).not.toBe(TxStrategy.S3_PRIVACY_RAIL);
    });
  });

  describe('Selection Output', () => {
    it('should include rationale', () => {
      const payload = createTestPayload();
      const riskScore = riskScorer.score({
        originTrust: 50,
        contextRisk: 'MEDIUM' as RiskLevel,
        txType: TxType.TRANSFER,
        estimatedAmount: 1.5,
        knownDestination: true,
        instructionCount: 1,
      });

      const selection = strategySelector.select(payload, riskScore, 50);
      expect(selection.rationale).toBeTruthy();
      expect(selection.rationale.length).toBeGreaterThan(20);
    });

    it('should include alternatives', () => {
      const payload = createTestPayload();
      const riskScore = riskScorer.score({
        originTrust: 50,
        contextRisk: 'MEDIUM' as RiskLevel,
        txType: TxType.TRANSFER,
        estimatedAmount: 1.5,
        knownDestination: true,
        instructionCount: 1,
      });

      const selection = strategySelector.select(payload, riskScore, 50);
      expect(selection.alternatives.length).toBeGreaterThan(0);
      expect(selection.alternatives.every(a => a.reason)).toBe(true);
    });

    it('should include privacy level and cost impact', () => {
      const payload = createTestPayload();
      const riskScore = riskScorer.score({
        originTrust: 50,
        contextRisk: 'MEDIUM' as RiskLevel,
        txType: TxType.TRANSFER,
        estimatedAmount: 1.5,
        knownDestination: true,
        instructionCount: 1,
      });

      const selection = strategySelector.select(payload, riskScore, 50);
      expect(selection.privacyLevel).toBeGreaterThanOrEqual(0);
      expect(selection.privacyLevel).toBeLessThanOrEqual(100);
      expect(['NONE', 'LOW', 'MEDIUM', 'HIGH']).toContain(selection.costImpact);
    });
  });

  describe('Determinism', () => {
    it('should produce deterministic selections', () => {
      const payload = createTestPayload();
      const riskScore = riskScorer.score({
        originTrust: 50,
        contextRisk: 'MEDIUM' as RiskLevel,
        txType: TxType.TRANSFER,
        estimatedAmount: 1.5,
        knownDestination: true,
        instructionCount: 1,
      });

      const selection1 = strategySelector.select(payload, riskScore, 50);
      const selection2 = strategySelector.select(payload, riskScore, 50);

      expect(selection1.strategy).toBe(selection2.strategy);
      expect(selection1.confidence).toBe(selection2.confidence);
      expect(selection1.privacyLevel).toBe(selection2.privacyLevel);
    });
  });
});

// ============ DryRunExecutor Tests ============

describe('DryRunExecutor', () => {
  let executor: DryRunExecutor;
  let strategySelector: StrategySelector;
  let riskScorer: TxRiskScorer;

  beforeEach(() => {
    executor = getDryRunExecutor();
    strategySelector = getStrategySelector();
    riskScorer = getTxRiskScorer();
  });

  describe('Dry-Run Execution (SIMULATION ONLY)', () => {
    it('should return simulation result with isSimulation=true', () => {
      const payload = createTestPayload();
      const riskScore = riskScorer.score({
        originTrust: 50,
        contextRisk: 'MEDIUM' as RiskLevel,
        txType: TxType.TRANSFER,
        estimatedAmount: 1.5,
        knownDestination: true,
        instructionCount: 1,
      });
      const selection = strategySelector.select(payload, riskScore, 50);

      const result = executor.execute(payload, selection);

      expect(result.isSimulation).toBe(true);
      expect(result.dryRunId).toMatch(/^dryrun_/);
    });

    it('should include simulated RPC info', () => {
      const payload = createTestPayload();
      const riskScore = riskScorer.score({
        originTrust: 50,
        contextRisk: 'MEDIUM' as RiskLevel,
        txType: TxType.TRANSFER,
        estimatedAmount: 1.5,
        knownDestination: true,
        instructionCount: 1,
      });
      const selection = strategySelector.select(payload, riskScore, 50);

      const result = executor.execute(payload, selection);

      expect(result.simulatedRpc).toBeDefined();
      expect(result.simulatedRpc.name).toBeTruthy();
      expect(typeof result.simulatedRpc.isPrivate).toBe('boolean');
    });

    it('should include simulated route', () => {
      const payload = createTestPayload();
      const riskScore = riskScorer.score({
        originTrust: 50,
        contextRisk: 'MEDIUM' as RiskLevel,
        txType: TxType.TRANSFER,
        estimatedAmount: 1.5,
        knownDestination: true,
        instructionCount: 1,
      });
      const selection = strategySelector.select(payload, riskScore, 50);

      const result = executor.execute(payload, selection);

      expect(result.route).toBeInstanceOf(Array);
      expect(result.route.length).toBeGreaterThan(0);
    });

    it('should include fee estimate and execution time', () => {
      const payload = createTestPayload();
      const riskScore = riskScorer.score({
        originTrust: 50,
        contextRisk: 'MEDIUM' as RiskLevel,
        txType: TxType.TRANSFER,
        estimatedAmount: 1.5,
        knownDestination: true,
        instructionCount: 1,
      });
      const selection = strategySelector.select(payload, riskScore, 50);

      const result = executor.execute(payload, selection);

      expect(result.estimatedFee).toBeGreaterThan(0);
      expect(result.simulatedExecutionMs).toBeGreaterThan(0);
    });
  });

  describe('Simulated Failures', () => {
    it('should fail for empty instruction data', () => {
      const payload = createTestPayload({ instructionData: '' });
      const riskScore = riskScorer.score({
        originTrust: 50,
        contextRisk: 'MEDIUM' as RiskLevel,
        txType: TxType.TRANSFER,
        estimatedAmount: 1.5,
        knownDestination: true,
        instructionCount: 1,
      });
      const selection = strategySelector.select(payload, riskScore, 50);

      const result = executor.execute(payload, selection);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Empty instruction data');
    });

    it('should fail for no accounts', () => {
      const payload = createTestPayload({ accounts: [] });
      const riskScore = riskScorer.score({
        originTrust: 50,
        contextRisk: 'MEDIUM' as RiskLevel,
        txType: TxType.TRANSFER,
        estimatedAmount: 1.5,
        knownDestination: true,
        instructionCount: 1,
      });
      const selection = strategySelector.select(payload, riskScore, 50);

      const result = executor.execute(payload, selection);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No accounts');
    });

    it('should fail for S3_PRIVACY_RAIL (not implemented)', () => {
      const payload = createTestPayload();
      const selection = {
        strategy: TxStrategy.S3_PRIVACY_RAIL,
        confidence: 0.9,
        rationale: 'Test',
        alternatives: [],
        privacyLevel: 95,
        costImpact: 'HIGH' as const,
      };

      const result = executor.execute(payload, selection);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not yet implemented');
    });
  });

  describe('Validation', () => {
    it('should validate payload correctly', () => {
      const validPayload = createTestPayload();
      const validation = executor.validatePayload(validPayload);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect invalid payload', () => {
      const invalidPayload = createTestPayload({
        programId: '',
        origin: '',
        estimatedAmount: -1,
      });
      const validation = executor.validatePayload(invalidPayload);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Determinism', () => {
    it('should produce deterministic results for same input', () => {
      const payload = createTestPayload();
      const riskScore = riskScorer.score({
        originTrust: 50,
        contextRisk: 'MEDIUM' as RiskLevel,
        txType: TxType.TRANSFER,
        estimatedAmount: 1.5,
        knownDestination: true,
        instructionCount: 1,
      });
      const selection = strategySelector.select(payload, riskScore, 50);

      const result1 = executor.execute(payload, selection);
      const result2 = executor.execute(payload, selection);

      expect(result1.success).toBe(result2.success);
      expect(result1.simulatedRpc.name).toBe(result2.simulatedRpc.name);
      expect(result1.estimatedFee).toBe(result2.estimatedFee);
      expect(result1.route).toEqual(result2.route);
    });
  });

  describe('NO Real Execution', () => {
    it('should never make real RPC calls', () => {
      // This is a structural test - verify no network modules are imported
      const payload = createTestPayload();
      const riskScore = riskScorer.score({
        originTrust: 50,
        contextRisk: 'MEDIUM' as RiskLevel,
        txType: TxType.TRANSFER,
        estimatedAmount: 1.5,
        knownDestination: true,
        instructionCount: 1,
      });
      const selection = strategySelector.select(payload, riskScore, 50);

      // This should complete synchronously without any network delay
      const start = Date.now();
      const result = executor.execute(payload, selection);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100); // Should be instant, no network
      expect(result.isSimulation).toBe(true);
    });

    it('should never sign transactions', () => {
      // Verify no signature-related fields in output
      const payload = createTestPayload();
      const riskScore = riskScorer.score({
        originTrust: 50,
        contextRisk: 'MEDIUM' as RiskLevel,
        txType: TxType.TRANSFER,
        estimatedAmount: 1.5,
        knownDestination: true,
        instructionCount: 1,
      });
      const selection = strategySelector.select(payload, riskScore, 50);

      const result = executor.execute(payload, selection);

      // Result should not have signature-related fields
      expect((result as any).signature).toBeUndefined();
      expect((result as any).signedTx).toBeUndefined();
      expect((result as any).txHash).toBeUndefined();
    });
  });
});

// ============ TxPipeline Integration Tests ============

describe('TxPipeline Integration', () => {
  beforeEach(() => {
    resetTxStateMachine();
    resetTxPipeline();
    // Mock AI Privacy Agent
    vi.mock('../src/main/modules/ai', () => ({
      getAIPrivacyAgent: () => ({
        classify: vi.fn().mockResolvedValue({ riskLevel: 'MEDIUM' as RiskLevel }),
      }),
    }));
  });

  afterEach(() => {
    resetTxStateMachine();
    resetTxPipeline();
    vi.restoreAllMocks();
  });

  describe('Full Pipeline Execution', () => {
    it('should run complete dry-run pipeline', async () => {
      const pipeline = getTxPipeline();
      const payload = createTestPayload();

      const tx = pipeline.createTransaction('ctx_test', payload);
      const result = await pipeline.runDryRunPipeline(tx.txId, 50);

      expect(result.classification).toBeDefined();
      expect(result.riskScore).toBeDefined();
      expect(result.strategySelection).toBeDefined();
      expect(result.dryRunResult).toBeDefined();
      expect(result.dryRunResult?.isSimulation).toBe(true);
    });

    it('should end in SIMULATED_CONFIRM on success', async () => {
      const pipeline = getTxPipeline();
      const payload = createTestPayload();

      const tx = pipeline.createTransaction('ctx_test', payload);
      const result = await pipeline.runDryRunPipeline(tx.txId, 50);

      if (result.dryRunResult?.success) {
        expect(result.state).toBe(TxState.TX_SIMULATED_CONFIRM);
      } else {
        expect(result.state).toBe(TxState.TX_ABORTED);
      }
    });

    it('should abort on validation failure', async () => {
      const pipeline = getTxPipeline();
      const invalidPayload = createTestPayload({
        instructionData: '',
        accounts: [],
      });

      const tx = pipeline.createTransaction('ctx_test', invalidPayload);
      const result = await pipeline.runDryRunPipeline(tx.txId, 50);

      expect(result.state).toBe(TxState.TX_ABORTED);
    });
  });

  describe('Receipt Data', () => {
    it('should generate receipt data for completed transactions', async () => {
      const pipeline = getTxPipeline();
      const payload = createTestPayload();

      const tx = pipeline.createTransaction('ctx_test', payload);
      await pipeline.runDryRunPipeline(tx.txId, 50);

      const receipt = pipeline.getReceiptData(tx.txId);
      expect(receipt).toBeDefined();
      expect(receipt?.txId).toBe(tx.txId);
      expect(receipt?.isSimulation).toBe(true);
    });

    it('should not generate receipt for incomplete transactions', () => {
      const pipeline = getTxPipeline();
      const payload = createTestPayload();

      const tx = pipeline.createTransaction('ctx_test', payload);
      // Don't run pipeline

      const receipt = pipeline.getReceiptData(tx.txId);
      expect(receipt).toBeNull();
    });
  });

  describe('Context Isolation', () => {
    it('should isolate transactions by context', async () => {
      const pipeline = getTxPipeline();
      const payload = createTestPayload();

      pipeline.createTransaction('ctx_1', payload);
      pipeline.createTransaction('ctx_1', payload);
      pipeline.createTransaction('ctx_2', payload);

      const ctx1Txs = pipeline.getContextTransactions('ctx_1');
      const ctx2Txs = pipeline.getContextTransactions('ctx_2');

      expect(ctx1Txs).toHaveLength(2);
      expect(ctx2Txs).toHaveLength(1);
    });

    it('should clear context transactions', () => {
      const pipeline = getTxPipeline();
      const payload = createTestPayload();

      pipeline.createTransaction('ctx_1', payload);
      pipeline.createTransaction('ctx_1', payload);

      const cleared = pipeline.clearContext('ctx_1');
      expect(cleared).toBe(2);
      expect(pipeline.getContextTransactions('ctx_1')).toHaveLength(0);
    });
  });

  describe('NO Real Execution Verification', () => {
    it('should complete instantly (no network delay)', async () => {
      const pipeline = getTxPipeline();
      const payload = createTestPayload();

      const tx = pipeline.createTransaction('ctx_test', payload);
      
      const start = Date.now();
      await pipeline.runDryRunPipeline(tx.txId, 50);
      const duration = Date.now() - start;

      // Should complete in under 100ms - no real network calls
      expect(duration).toBeLessThan(100);
    });

    it('should never have wallet-related output', async () => {
      const pipeline = getTxPipeline();
      const payload = createTestPayload();

      const tx = pipeline.createTransaction('ctx_test', payload);
      const result = await pipeline.runDryRunPipeline(tx.txId, 50);

      // Verify no wallet-related fields
      expect((result as any).wallet).toBeUndefined();
      expect((result as any).privateKey).toBeUndefined();
      expect((result as any).publicKey).toBeUndefined();
      expect((result as any).signedTransaction).toBeUndefined();
    });

    it('should never have Solana network output', async () => {
      const pipeline = getTxPipeline();
      const payload = createTestPayload();

      const tx = pipeline.createTransaction('ctx_test', payload);
      const result = await pipeline.runDryRunPipeline(tx.txId, 50);

      // Verify no Solana-specific network fields
      expect((result as any).slot).toBeUndefined();
      expect((result as any).blockhash).toBeUndefined();
      expect((result as any).confirmationStatus).toBeUndefined();
    });
  });
});


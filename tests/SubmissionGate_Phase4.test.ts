/**
 * Liminal - Submission Gate Phase 4.0 Tests
 * 
 * Tests for Phase 4.0: Conditional Submission Gate
 * 
 * VERIFICATION:
 * - Submission allowed ONLY when ALL conditions pass
 * - Submission blocked when EACH condition fails (one test per condition)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TxState,
  SimulatedTxPayload,
  SubmissionBlockReason,
  IntentType,
  PolicyLockStatus,
  InvariantViolationError,
} from '../src/shared/tx-types';
import {
  getTxSubmissionGate,
  resetTxSubmissionGate,
} from '../src/main/modules/tx/TxSubmissionGate';
import {
  getExecutionPolicyManager,
  resetExecutionPolicyManager,
} from '../src/main/modules/policy';
import {
  getTxStateMachine,
  resetTxStateMachine,
} from '../src/main/modules/tx/TxStateMachine';
import {
  getIntentManager,
  resetIntentManager,
} from '../src/main/modules/tx/IntentManager';
import {
  getInvariantManager,
  resetInvariantManager,
} from '../src/main/modules/invariants';

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

/**
 * Helper to create a transaction ready for submission (all conditions met)
 */
function createReadyForSubmissionTx(contextId: string) {
  const stateMachine = getTxStateMachine();
  const payload = createTestPayload();
  const tx = stateMachine.createTransaction(contextId, payload);
  
  // Create and confirm SIGN_AND_SUBMIT intent
  const intentManager = getIntentManager();
  const intent = intentManager.createIntent({
    txId: tx.txId,
    origin: payload.origin,
    contextId,
    intentType: IntentType.SIGN_AND_SUBMIT,
  });
  intentManager.confirmIntent(intent.intentId);
  
  // Advance to SIMULATED_CONFIRM with signing
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
    signingResult: {
      success: true,
      signedPayload: 'test',
      signature: 'sig',
      signerScope: { origin: payload.origin, contextId, grantedAt: Date.now(), active: true },
      payloadHash: 'hash',
      dryRunHash: 'hash',
      payloadConsistent: true,
      timestamp: Date.now(),
      submitted: false,
    },
  });
  stateMachine.transitionTo(tx.txId, TxState.TX_SIGN);
  stateMachine.transitionTo(tx.txId, TxState.TX_SIMULATED_CONFIRM);
  
  return stateMachine.getTransaction(tx.txId)!;
}

// ============ Phase 4.0 Conditional Submission Tests ============

describe('Phase 4.0: Conditional Submission', () => {
  beforeEach(() => {
    resetExecutionPolicyManager();
    resetInvariantManager();
    resetIntentManager();
    resetTxSubmissionGate();
    resetTxStateMachine();
  });

  afterEach(() => {
    resetExecutionPolicyManager();
    resetInvariantManager();
    resetIntentManager();
    resetTxSubmissionGate();
    resetTxStateMachine();
  });

  describe('Submission Allowed When All Conditions Pass', () => {
    it('should allow submission when ALL conditions are met', () => {
      // Unlock policy and enable submission
      const policyManager = getExecutionPolicyManager();
      policyManager.unlockForPhase4('Phase 4.0 test', 'test-author');
      policyManager.setFlag('allowSubmission', true, 'Phase 4.0 test', 'test-author');
      
      // Create transaction ready for submission
      const tx = createReadyForSubmissionTx('ctx_test');
      
      // Attempt submission
      const submissionGate = getTxSubmissionGate();
      const result = submissionGate.attemptSubmission(tx.txId, tx);
      
      // Should be allowed
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('All submission conditions satisfied');
      expect(result.reasonCode).toBeUndefined();
    });
  });

  describe('Submission Blocked When Conditions Fail', () => {
    it('should block when policy is locked', () => {
      // Policy defaults to locked (not unlocked)
      
      // Create transaction ready for submission
      const tx = createReadyForSubmissionTx('ctx_test');
      
      // Attempt submission
      const submissionGate = getTxSubmissionGate();
      const result = submissionGate.attemptSubmission(tx.txId, tx);
      
      // Should be blocked
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe(SubmissionBlockReason.POLICY_BLOCKED);
      expect(result.reason).toContain('policy');
    });

    it('should block when allowSubmission is false', () => {
      // Unlock policy but keep allowSubmission=false
      const policyManager = getExecutionPolicyManager();
      policyManager.unlockForPhase4('Phase 4.0 test', 'test-author');
      // allowSubmission defaults to false
      
      // Create transaction ready for submission
      const tx = createReadyForSubmissionTx('ctx_test');
      
      // Attempt submission
      const submissionGate = getTxSubmissionGate();
      expect(() => submissionGate.attemptSubmission(tx.txId, tx)).toThrow(InvariantViolationError);
    });

    it('should block when kill-switch is active', () => {
      // Unlock policy and enable submission
      const policyManager = getExecutionPolicyManager();
      policyManager.unlockForPhase4('Phase 4.0 test', 'test-author');
      policyManager.setFlag('allowSubmission', true, 'Phase 4.0 test', 'test-author');
      
      // Activate kill-switch
      const invariantManager = getInvariantManager();
      invariantManager.activateKillSwitch('Test kill-switch', 'test-author');
      
      // Create transaction ready for submission
      const tx = createReadyForSubmissionTx('ctx_test');
      
      // Attempt submission
      const submissionGate = getTxSubmissionGate();
      expect(() => submissionGate.attemptSubmission(tx.txId, tx)).toThrow(InvariantViolationError);
    });

    it('should block when transaction object is missing', () => {
      // Unlock policy and enable submission
      const policyManager = getExecutionPolicyManager();
      policyManager.unlockForPhase4('Phase 4.0 test', 'test-author');
      policyManager.setFlag('allowSubmission', true, 'Phase 4.0 test', 'test-author');
      
      // Attempt submission without transaction object
      const submissionGate = getTxSubmissionGate();
      const result = submissionGate.attemptSubmission('tx_no_object');
      
      // Should be blocked
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe(SubmissionBlockReason.INVALID_STATE);
      expect(result.reason).toContain('Transaction object is required');
    });

    it('should block when transaction state is not TX_SIMULATED_CONFIRM', () => {
      // Unlock policy and enable submission
      const policyManager = getExecutionPolicyManager();
      policyManager.unlockForPhase4('Phase 4.0 test', 'test-author');
      policyManager.setFlag('allowSubmission', true, 'Phase 4.0 test', 'test-author');
      
      // Create transaction in wrong state
      const stateMachine = getTxStateMachine();
      const payload = createTestPayload();
      const tx = stateMachine.createTransaction('ctx_test', payload);
      // Leave in TX_NEW state
      
      // Attempt submission
      const submissionGate = getTxSubmissionGate();
      const result = submissionGate.attemptSubmission(tx.txId, tx);
      
      // Should be blocked
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe(SubmissionBlockReason.INVALID_STATE);
      expect(result.reason).toContain('must be TX_SIMULATED_CONFIRM');
    });

    it('should block when transaction is not signed', () => {
      // Unlock policy and enable submission
      const policyManager = getExecutionPolicyManager();
      policyManager.unlockForPhase4('Phase 4.0 test', 'test-author');
      policyManager.setFlag('allowSubmission', true, 'Phase 4.0 test', 'test-author');
      
      // Create transaction without signing
      const stateMachine = getTxStateMachine();
      const payload = createTestPayload();
      const tx = stateMachine.createTransaction('ctx_test', payload);
      
      // Create and confirm intent
      const intentManager = getIntentManager();
      const intent = intentManager.createIntent({
        txId: tx.txId,
        origin: payload.origin,
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_AND_SUBMIT,
      });
      intentManager.confirmIntent(intent.intentId);
      
      // Advance to SIMULATED_CONFIRM without signing
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
      
      const unsignedTx = stateMachine.getTransaction(tx.txId)!;
      
      // Attempt submission
      const submissionGate = getTxSubmissionGate();
      const result = submissionGate.attemptSubmission(tx.txId, unsignedTx);
      
      // Should be blocked
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe(SubmissionBlockReason.NOT_SIGNED);
      expect(result.reason).toContain('not been signed');
    });

    it('should block when intent is missing', () => {
      // Unlock policy and enable submission
      const policyManager = getExecutionPolicyManager();
      policyManager.unlockForPhase4('Phase 4.0 test', 'test-author');
      policyManager.setFlag('allowSubmission', true, 'Phase 4.0 test', 'test-author');
      
      // Create transaction without intent
      const stateMachine = getTxStateMachine();
      const payload = createTestPayload();
      const tx = stateMachine.createTransaction('ctx_test', payload);
      
      // Advance to SIMULATED_CONFIRM with signing but no intent
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
        signingResult: {
          success: true,
          signedPayload: 'test',
          signature: 'sig',
          signerScope: { origin: payload.origin, contextId: 'ctx_test', grantedAt: Date.now(), active: true },
          payloadHash: 'hash',
          dryRunHash: 'hash',
          payloadConsistent: true,
          timestamp: Date.now(),
          submitted: false,
        },
      });
      stateMachine.transitionTo(tx.txId, TxState.TX_SIGN);
      stateMachine.transitionTo(tx.txId, TxState.TX_SIMULATED_CONFIRM);
      
      const txWithoutIntent = stateMachine.getTransaction(tx.txId)!;
      
      // Attempt submission
      const submissionGate = getTxSubmissionGate();
      const result = submissionGate.attemptSubmission(tx.txId, txWithoutIntent);
      
      // Should be blocked
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe(SubmissionBlockReason.INVALID_STATE);
      expect(result.reason).toContain('Intent validation failed');
    });

    it('should block when intent is not SIGN_AND_SUBMIT', () => {
      // Unlock policy and enable submission
      const policyManager = getExecutionPolicyManager();
      policyManager.unlockForPhase4('Phase 4.0 test', 'test-author');
      policyManager.setFlag('allowSubmission', true, 'Phase 4.0 test', 'test-author');
      
      // Create transaction with SIGN_ONLY intent
      const stateMachine = getTxStateMachine();
      const payload = createTestPayload();
      const tx = stateMachine.createTransaction('ctx_test', payload);
      
      // Create and confirm SIGN_ONLY intent (not SIGN_AND_SUBMIT)
      const intentManager = getIntentManager();
      const intent = intentManager.createIntent({
        txId: tx.txId,
        origin: payload.origin,
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_ONLY,
      });
      intentManager.confirmIntent(intent.intentId);
      
      // Advance to SIMULATED_CONFIRM with signing
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
        signingResult: {
          success: true,
          signedPayload: 'test',
          signature: 'sig',
          signerScope: { origin: payload.origin, contextId: 'ctx_test', grantedAt: Date.now(), active: true },
          payloadHash: 'hash',
          dryRunHash: 'hash',
          payloadConsistent: true,
          timestamp: Date.now(),
          submitted: false,
        },
      });
      stateMachine.transitionTo(tx.txId, TxState.TX_SIGN);
      stateMachine.transitionTo(tx.txId, TxState.TX_SIMULATED_CONFIRM);
      
      const txWithSignOnlyIntent = stateMachine.getTransaction(tx.txId)!;
      
      // Attempt submission
      const submissionGate = getTxSubmissionGate();
      const result = submissionGate.attemptSubmission(tx.txId, txWithSignOnlyIntent);
      
      // Should be blocked
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe(SubmissionBlockReason.INVALID_STATE);
      expect(result.reason).toContain('Intent validation failed');
      expect(result.reason).toContain('SIGN_ONLY');
    });

    it('should block when intent is not confirmed', () => {
      // Unlock policy and enable submission
      const policyManager = getExecutionPolicyManager();
      policyManager.unlockForPhase4('Phase 4.0 test', 'test-author');
      policyManager.setFlag('allowSubmission', true, 'Phase 4.0 test', 'test-author');
      
      // Create transaction with unconfirmed intent
      const stateMachine = getTxStateMachine();
      const payload = createTestPayload();
      const tx = stateMachine.createTransaction('ctx_test', payload);
      
      // Create SIGN_AND_SUBMIT intent but do NOT confirm
      const intentManager = getIntentManager();
      const intent = intentManager.createIntent({
        txId: tx.txId,
        origin: payload.origin,
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_AND_SUBMIT,
      });
      // Intent not confirmed
      
      // Advance to SIMULATED_CONFIRM with signing
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
        signingResult: {
          success: true,
          signedPayload: 'test',
          signature: 'sig',
          signerScope: { origin: payload.origin, contextId: 'ctx_test', grantedAt: Date.now(), active: true },
          payloadHash: 'hash',
          dryRunHash: 'hash',
          payloadConsistent: true,
          timestamp: Date.now(),
          submitted: false,
        },
      });
      stateMachine.transitionTo(tx.txId, TxState.TX_SIGN);
      stateMachine.transitionTo(tx.txId, TxState.TX_SIMULATED_CONFIRM);
      
      const txWithUnconfirmedIntent = stateMachine.getTransaction(tx.txId)!;
      
      // Attempt submission
      const submissionGate = getTxSubmissionGate();
      const result = submissionGate.attemptSubmission(tx.txId, txWithUnconfirmedIntent);
      
      // Should be blocked
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe(SubmissionBlockReason.INVALID_STATE);
      expect(result.reason).toContain('Intent validation failed');
    });

    it('should block when private rail strategy is used', () => {
      // Unlock policy and enable submission
      const policyManager = getExecutionPolicyManager();
      policyManager.unlockForPhase4('Phase 4.0 test', 'test-author');
      policyManager.setFlag('allowSubmission', true, 'Phase 4.0 test', 'test-author');
      
      // Create transaction with private rail strategy
      const stateMachine = getTxStateMachine();
      const payload = createTestPayload();
      const tx = stateMachine.createTransaction('ctx_test', payload);
      
      // Create and confirm SIGN_AND_SUBMIT intent
      const intentManager = getIntentManager();
      const intent = intentManager.createIntent({
        txId: tx.txId,
        origin: payload.origin,
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_AND_SUBMIT,
      });
      intentManager.confirmIntent(intent.intentId);
      
      // Advance to SIMULATED_CONFIRM with signing and private rail strategy
      stateMachine.transitionTo(tx.txId, TxState.TX_CLASSIFY);
      stateMachine.transitionTo(tx.txId, TxState.TX_RISK_SCORE);
      stateMachine.transitionTo(tx.txId, TxState.TX_STRATEGY_SELECT);
      stateMachine.transitionTo(tx.txId, TxState.TX_PREPARE);
      stateMachine.transitionTo(tx.txId, TxState.TX_DRY_RUN);
      stateMachine.updateTransaction(tx.txId, {
        strategySelection: {
          strategy: 'S3_PRIVACY_RAIL' as any,
          rationale: 'Test',
          timestamp: Date.now(),
        },
        dryRunResult: {
          dryRunId: 'dryrun_test',
          success: true,
          simulatedRpc: { name: 'test', isPrivate: false, simulatedLatencyMs: 100 },
          strategy: 'S3_PRIVACY_RAIL' as any,
          route: ['client', 'rpc'],
          estimatedFee: 0.000005,
          simulatedExecutionMs: 100,
          warnings: [],
          timestamp: Date.now(),
          isSimulation: true,
        },
        signingResult: {
          success: true,
          signedPayload: 'test',
          signature: 'sig',
          signerScope: { origin: payload.origin, contextId: 'ctx_test', grantedAt: Date.now(), active: true },
          payloadHash: 'hash',
          dryRunHash: 'hash',
          payloadConsistent: true,
          timestamp: Date.now(),
          submitted: false,
        },
      });
      stateMachine.transitionTo(tx.txId, TxState.TX_SIGN);
      stateMachine.transitionTo(tx.txId, TxState.TX_SIMULATED_CONFIRM);
      
      const txWithPrivateRail = stateMachine.getTransaction(tx.txId)!;
      
      // Attempt submission
      const submissionGate = getTxSubmissionGate();
      const result = submissionGate.attemptSubmission(tx.txId, txWithPrivateRail);
      
      // Should be blocked
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe(SubmissionBlockReason.PRIVATE_RAIL_NOT_ENABLED);
      expect(result.reason).toContain('Privacy rail is not enabled');
    });
  });
});


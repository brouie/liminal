/**
 * Liminal - Intent Manager Tests
 * 
 * Tests for Phase 3.3: User Intent & Consent Layer
 * 
 * VERIFICATION:
 * - Signing fails without intent when enforcement enabled
 * - Intent expiry works
 * - Intent is immutable
 * - Submission still blocked even with confirmed intent
 * - Phase 3.2 gate remains effective
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  IntentType,
  IntentStatus,
  TxState,
  SimulatedTxPayload,
  SubmissionBlockReason,
} from '../src/shared/tx-types';
import {
  IntentManager,
  getIntentManager,
  resetIntentManager,
  IntentNotFoundError,
  IntentExpiredError,
} from '../src/main/modules/tx/IntentManager';
import {
  getTxStateMachine,
  resetTxStateMachine,
} from '../src/main/modules/tx/TxStateMachine';
import {
  getTxPipeline,
  resetTxPipeline,
} from '../src/main/modules/tx/TxPipeline';
import {
  getTxSubmissionGate,
  resetTxSubmissionGate,
} from '../src/main/modules/tx/TxSubmissionGate';

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

// ============ IntentManager Unit Tests ============

describe('IntentManager', () => {
  let intentManager: IntentManager;

  beforeEach(() => {
    resetIntentManager();
    intentManager = getIntentManager();
  });

  afterEach(() => {
    resetIntentManager();
  });

  describe('Intent Creation', () => {
    it('should create intent with all required fields', () => {
      const intent = intentManager.createIntent({
        txId: 'tx_test',
        origin: 'https://example.com',
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_ONLY,
      });
      
      expect(intent.intentId).toBeDefined();
      expect(intent.intentId).toMatch(/^intent_/);
      expect(intent.txId).toBe('tx_test');
      expect(intent.origin).toBe('https://example.com');
      expect(intent.contextId).toBe('ctx_test');
      expect(intent.intentType).toBe(IntentType.SIGN_ONLY);
      expect(intent.status).toBe(IntentStatus.PENDING);
      expect(intent.createdAt).toBeLessThanOrEqual(Date.now());
      expect(intent.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should create SIGN_AND_SUBMIT intent', () => {
      const intent = intentManager.createIntent({
        txId: 'tx_test',
        origin: 'https://example.com',
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_AND_SUBMIT,
      });
      
      expect(intent.intentType).toBe(IntentType.SIGN_AND_SUBMIT);
    });

    it('should respect custom TTL', () => {
      const customTtl = 1000; // 1 second
      const before = Date.now();
      
      const intent = intentManager.createIntent({
        txId: 'tx_test',
        origin: 'https://example.com',
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_ONLY,
        ttlMs: customTtl,
      });
      
      const after = Date.now();
      
      expect(intent.expiresAt).toBeGreaterThanOrEqual(before + customTtl);
      expect(intent.expiresAt).toBeLessThanOrEqual(after + customTtl);
    });

    it('should generate unique intent IDs', () => {
      const intent1 = intentManager.createIntent({
        txId: 'tx_1',
        origin: 'https://example.com',
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_ONLY,
      });
      
      const intent2 = intentManager.createIntent({
        txId: 'tx_2',
        origin: 'https://example.com',
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_ONLY,
      });
      
      expect(intent1.intentId).not.toBe(intent2.intentId);
    });
  });

  describe('Intent Immutability', () => {
    it('should return frozen intent objects', () => {
      const intent = intentManager.createIntent({
        txId: 'tx_test',
        origin: 'https://example.com',
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_ONLY,
      });
      
      expect(Object.isFrozen(intent)).toBe(true);
    });

    it('should not allow modifying immutable fields', () => {
      const intent = intentManager.createIntent({
        txId: 'tx_test',
        origin: 'https://example.com',
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_ONLY,
      });
      
      // Attempting to modify should throw in strict mode or silently fail
      expect(() => {
        (intent as any).txId = 'modified';
      }).toThrow();
    });

    it('should preserve original values after get', () => {
      const originalTxId = 'tx_test';
      const created = intentManager.createIntent({
        txId: originalTxId,
        origin: 'https://example.com',
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_ONLY,
      });
      
      const retrieved = intentManager.getIntent(created.intentId);
      
      expect(retrieved?.txId).toBe(originalTxId);
    });
  });

  describe('Intent Confirmation', () => {
    it('should confirm pending intent', () => {
      const intent = intentManager.createIntent({
        txId: 'tx_test',
        origin: 'https://example.com',
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_ONLY,
      });
      
      const result = intentManager.confirmIntent(intent.intentId);
      
      expect(result.success).toBe(true);
      expect(result.intentId).toBe(intent.intentId);
      
      const confirmed = intentManager.getIntent(intent.intentId);
      expect(confirmed?.status).toBe(IntentStatus.CONFIRMED);
      expect(confirmed?.confirmedAt).toBeDefined();
    });

    it('should fail for non-existent intent', () => {
      const result = intentManager.confirmIntent('intent_nonexistent');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should succeed for already confirmed intent', () => {
      const intent = intentManager.createIntent({
        txId: 'tx_test',
        origin: 'https://example.com',
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_ONLY,
      });
      
      intentManager.confirmIntent(intent.intentId);
      const result = intentManager.confirmIntent(intent.intentId);
      
      expect(result.success).toBe(true);
    });

    it('should fail for revoked intent', () => {
      const intent = intentManager.createIntent({
        txId: 'tx_test',
        origin: 'https://example.com',
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_ONLY,
      });
      
      intentManager.revokeIntent(intent.intentId);
      const result = intentManager.confirmIntent(intent.intentId);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('revoked');
    });
  });

  describe('Intent Expiration', () => {
    it('should detect expired intent', async () => {
      // Create intent with very short TTL
      const intent = intentManager.createIntent({
        txId: 'tx_test',
        origin: 'https://example.com',
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_ONLY,
        ttlMs: 1, // 1ms TTL
      });
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const result = intentManager.confirmIntent(intent.intentId);
      
      expect(result.success).toBe(false);
      expect(result.expired).toBe(true);
      
      const expired = intentManager.getIntent(intent.intentId);
      expect(expired?.status).toBe(IntentStatus.EXPIRED);
    });

    it('should fail validation for expired intent', async () => {
      const intent = intentManager.createIntent({
        txId: 'tx_test',
        origin: 'https://example.com',
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_ONLY,
        ttlMs: 1,
      });
      
      intentManager.confirmIntent(intent.intentId);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const validation = intentManager.validateIntent(intent.intentId);
      
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('expired');
    });
  });

  describe('Intent Consumption', () => {
    it('should consume confirmed intent', () => {
      const intent = intentManager.createIntent({
        txId: 'tx_test',
        origin: 'https://example.com',
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_ONLY,
      });
      
      intentManager.confirmIntent(intent.intentId);
      const consumed = intentManager.consumeIntent(intent.intentId);
      
      expect(consumed).toBe(true);
      
      const final = intentManager.getIntent(intent.intentId);
      expect(final?.status).toBe(IntentStatus.CONSUMED);
      expect(final?.consumedAt).toBeDefined();
    });

    it('should fail to consume unconfirmed intent', () => {
      const intent = intentManager.createIntent({
        txId: 'tx_test',
        origin: 'https://example.com',
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_ONLY,
      });
      
      const consumed = intentManager.consumeIntent(intent.intentId);
      
      expect(consumed).toBe(false);
    });

    it('should fail to confirm consumed intent', () => {
      const intent = intentManager.createIntent({
        txId: 'tx_test',
        origin: 'https://example.com',
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_ONLY,
      });
      
      intentManager.confirmIntent(intent.intentId);
      intentManager.consumeIntent(intent.intentId);
      
      const result = intentManager.confirmIntent(intent.intentId);
      
      expect(result.success).toBe(false);
      expect(result.alreadyConsumed).toBe(true);
    });
  });

  describe('Intent Revocation', () => {
    it('should revoke pending intent', () => {
      const intent = intentManager.createIntent({
        txId: 'tx_test',
        origin: 'https://example.com',
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_ONLY,
      });
      
      const revoked = intentManager.revokeIntent(intent.intentId);
      
      expect(revoked).toBe(true);
      
      const final = intentManager.getIntent(intent.intentId);
      expect(final?.status).toBe(IntentStatus.REVOKED);
    });

    it('should revoke confirmed intent', () => {
      const intent = intentManager.createIntent({
        txId: 'tx_test',
        origin: 'https://example.com',
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_ONLY,
      });
      
      intentManager.confirmIntent(intent.intentId);
      const revoked = intentManager.revokeIntent(intent.intentId);
      
      expect(revoked).toBe(true);
    });

    it('should not revoke consumed intent', () => {
      const intent = intentManager.createIntent({
        txId: 'tx_test',
        origin: 'https://example.com',
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_ONLY,
      });
      
      intentManager.confirmIntent(intent.intentId);
      intentManager.consumeIntent(intent.intentId);
      
      const revoked = intentManager.revokeIntent(intent.intentId);
      
      expect(revoked).toBe(false);
    });
  });

  describe('Intent Validation', () => {
    it('should validate confirmed intent', () => {
      const intent = intentManager.createIntent({
        txId: 'tx_test',
        origin: 'https://example.com',
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_ONLY,
      });
      
      intentManager.confirmIntent(intent.intentId);
      
      const validation = intentManager.validateIntent(intent.intentId);
      
      expect(validation.valid).toBe(true);
      expect(validation.intent).toBeDefined();
    });

    it('should reject unconfirmed intent', () => {
      const intent = intentManager.createIntent({
        txId: 'tx_test',
        origin: 'https://example.com',
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_ONLY,
      });
      
      const validation = intentManager.validateIntent(intent.intentId);
      
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('PENDING');
    });

    it('should validate intent type', () => {
      const intent = intentManager.createIntent({
        txId: 'tx_test',
        origin: 'https://example.com',
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_ONLY,
      });
      
      intentManager.confirmIntent(intent.intentId);
      
      const validForSign = intentManager.validateIntent(intent.intentId, IntentType.SIGN_ONLY);
      const validForSubmit = intentManager.validateIntent(intent.intentId, IntentType.SIGN_AND_SUBMIT);
      
      expect(validForSign.valid).toBe(true);
      expect(validForSubmit.valid).toBe(false);
      expect(validForSubmit.reason).toContain('SIGN_ONLY');
    });
  });

  describe('Signing Validation', () => {
    it('should allow signing without intent when enforcement disabled', () => {
      intentManager.setEnforceIntentForSigning(false);
      
      const validation = intentManager.validateForSigning('tx_test');
      
      expect(validation.valid).toBe(true);
    });

    it('should require intent when enforcement enabled', () => {
      intentManager.setEnforceIntentForSigning(true);
      
      const validation = intentManager.validateForSigning('tx_test');
      
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('No intent found');
    });

    it('should require confirmed intent when enforcement enabled', () => {
      intentManager.setEnforceIntentForSigning(true);
      
      const intent = intentManager.createIntent({
        txId: 'tx_test',
        origin: 'https://example.com',
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_ONLY,
      });
      
      // Not confirmed
      const validation = intentManager.validateForSigning('tx_test');
      
      expect(validation.valid).toBe(false);
    });

    it('should pass when intent is confirmed and enforcement enabled', () => {
      intentManager.setEnforceIntentForSigning(true);
      
      const intent = intentManager.createIntent({
        txId: 'tx_test',
        origin: 'https://example.com',
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_ONLY,
      });
      
      intentManager.confirmIntent(intent.intentId);
      
      const validation = intentManager.validateForSigning('tx_test');
      
      expect(validation.valid).toBe(true);
    });
  });

  describe('Submission Validation', () => {
    it('should require SIGN_AND_SUBMIT for submission', () => {
      const signOnlyIntent = intentManager.createIntent({
        txId: 'tx_sign_only',
        origin: 'https://example.com',
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_ONLY,
      });
      
      const submitIntent = intentManager.createIntent({
        txId: 'tx_submit',
        origin: 'https://example.com',
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_AND_SUBMIT,
      });
      
      intentManager.confirmIntent(signOnlyIntent.intentId);
      intentManager.confirmIntent(submitIntent.intentId);
      
      const signOnlyValidation = intentManager.validateForSubmission('tx_sign_only');
      const submitValidation = intentManager.validateForSubmission('tx_submit');
      
      expect(signOnlyValidation.valid).toBe(false);
      expect(submitValidation.valid).toBe(true);
    });
  });
});

// ============ TxPipeline Integration Tests ============

describe('TxPipeline Intent Integration', () => {
  beforeEach(() => {
    resetIntentManager();
    resetTxStateMachine();
    resetTxPipeline();
    resetTxSubmissionGate();
  });

  afterEach(() => {
    resetIntentManager();
    resetTxStateMachine();
    resetTxPipeline();
    resetTxSubmissionGate();
  });

  describe('Intent Creation via Pipeline', () => {
    it('should create intent and link to transaction', () => {
      const pipeline = getTxPipeline();
      const payload = createTestPayload();
      
      const tx = pipeline.createTransaction('ctx_test', payload);
      const intent = pipeline.createIntent({
        txId: tx.txId,
        origin: payload.origin,
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_ONLY,
      });
      
      expect(intent).toBeDefined();
      
      const linkedTx = pipeline.getTransaction(tx.txId);
      expect(linkedTx?.intentId).toBe(intent.intentId);
      
      const foundIntent = pipeline.getIntentForTx(tx.txId);
      expect(foundIntent?.intentId).toBe(intent.intentId);
    });
  });

  describe('Receipt with Intent', () => {
    it('should include intent in receipt', () => {
      const pipeline = getTxPipeline();
      const stateMachine = getTxStateMachine();
      const payload = createTestPayload();
      
      const tx = pipeline.createTransaction('ctx_test', payload);
      
      // Create and confirm intent
      const intent = pipeline.createIntent({
        txId: tx.txId,
        origin: payload.origin,
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_ONLY,
      });
      pipeline.confirmIntent(intent.intentId);
      
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
      
      expect(receipt.intentId).toBe(intent.intentId);
      expect(receipt.intentType).toBe(IntentType.SIGN_ONLY);
      expect(receipt.intentConfirmed).toBe(true);
      expect(receipt.intentExpired).toBe(false);
    });

    it('should show expired intent in receipt', async () => {
      const pipeline = getTxPipeline();
      const stateMachine = getTxStateMachine();
      const payload = createTestPayload();
      
      const tx = pipeline.createTransaction('ctx_test', payload);
      
      // Create intent with very short TTL
      const intent = pipeline.createIntent({
        txId: tx.txId,
        origin: payload.origin,
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_ONLY,
        ttlMs: 1,
      });
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));
      
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
      
      // Try to confirm (will fail due to expiry)
      pipeline.confirmIntent(intent.intentId);
      
      const receipt = pipeline.getReceiptData(tx.txId)!;
      
      expect(receipt.intentExpired).toBe(true);
      expect(receipt.intentConfirmed).toBe(false);
    });
  });

  describe('Submission Gate Still Effective', () => {
    it('should block submission even with confirmed SIGN_AND_SUBMIT intent', () => {
      const pipeline = getTxPipeline();
      const submissionGate = getTxSubmissionGate();
      const stateMachine = getTxStateMachine();
      const payload = createTestPayload();
      
      const tx = pipeline.createTransaction('ctx_test', payload);
      
      // Create and confirm SIGN_AND_SUBMIT intent
      const intent = pipeline.createIntent({
        txId: tx.txId,
        origin: payload.origin,
        contextId: 'ctx_test',
        intentType: IntentType.SIGN_AND_SUBMIT,
      });
      pipeline.confirmIntent(intent.intentId);
      
      // Complete the pipeline with signing
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
          signerScope: { origin: 'test', contextId: 'ctx_test', grantedAt: Date.now(), active: true },
          payloadHash: 'hash',
          dryRunHash: 'hash',
          payloadConsistent: true,
          timestamp: Date.now(),
          submitted: false,
        },
      });
      stateMachine.transitionTo(tx.txId, TxState.TX_SIGN);
      stateMachine.transitionTo(tx.txId, TxState.TX_SIMULATED_CONFIRM);
      
      // Intent validates for submission
      const intentValidation = pipeline.validateIntentForSubmission(tx.txId);
      expect(intentValidation.valid).toBe(true);
      
      // But submission gate STILL blocks
      const submissionResult = pipeline.attemptSubmission(tx.txId);
      expect(submissionResult.allowed).toBe(false);
      
      // Gate status still blocking
      const gateStatus = pipeline.getSubmissionGateStatus();
      expect(gateStatus.blocking).toBe(true);
    });

    it('should block all RPC methods even with intent', () => {
      const submissionGate = getTxSubmissionGate();
      
      // All blocked methods should still throw
      expect(() => submissionGate.sendTransaction({})).toThrow();
      expect(() => submissionGate.sendRawTransaction({})).toThrow();
      expect(() => submissionGate.submitTransaction({})).toThrow();
    });
  });
});

// ============ Phase 3.3 Guarantees Tests ============

describe('Phase 3.3 Guarantees', () => {
  beforeEach(() => {
    resetIntentManager();
    resetTxStateMachine();
    resetTxPipeline();
    resetTxSubmissionGate();
  });

  afterEach(() => {
    resetIntentManager();
    resetTxStateMachine();
    resetTxPipeline();
    resetTxSubmissionGate();
  });

  it('NO transaction submission regardless of intent', () => {
    const pipeline = getTxPipeline();
    const payload = createTestPayload();
    
    const tx = pipeline.createTransaction('ctx_test', payload);
    
    // Create confirmed SIGN_AND_SUBMIT intent
    const intent = pipeline.createIntent({
      txId: tx.txId,
      origin: payload.origin,
      contextId: 'ctx_test',
      intentType: IntentType.SIGN_AND_SUBMIT,
    });
    pipeline.confirmIntent(intent.intentId);
    
    // Attempt submission
    const result = pipeline.attemptSubmission(tx.txId);
    
    expect(result.allowed).toBe(false);
  });

  it('NO RPC calls possible', () => {
    const gate = getTxSubmissionGate();
    
    expect(() => gate.sendTransaction({})).toThrow();
    expect(() => gate.sendRawTransaction({})).toThrow();
    expect(() => gate.broadcastTransaction({})).toThrow();
  });

  it('NO funds movement possible', () => {
    const pipeline = getTxPipeline();
    const payload = createTestPayload({ estimatedAmount: 1000000 });
    
    const tx = pipeline.createTransaction('ctx_test', payload);
    const result = pipeline.attemptSubmission(tx.txId);
    
    expect(result.allowed).toBe(false);
    expect((result as any).txHash).toBeUndefined();
  });

  it('intent does NOT auto-confirm', () => {
    const intentManager = getIntentManager();
    
    const intent = intentManager.createIntent({
      txId: 'tx_test',
      origin: 'https://example.com',
      contextId: 'ctx_test',
      intentType: IntentType.SIGN_ONLY,
    });
    
    // Status should be PENDING, not auto-confirmed
    expect(intent.status).toBe(IntentStatus.PENDING);
  });

  it('expired intents MUST fail', async () => {
    const intentManager = getIntentManager();
    
    const intent = intentManager.createIntent({
      txId: 'tx_test',
      origin: 'https://example.com',
      contextId: 'ctx_test',
      intentType: IntentType.SIGN_ONLY,
      ttlMs: 1,
    });
    
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const confirmResult = intentManager.confirmIntent(intent.intentId);
    expect(confirmResult.success).toBe(false);
    expect(confirmResult.expired).toBe(true);
    
    const validation = intentManager.validateIntent(intent.intentId);
    expect(validation.valid).toBe(false);
  });

  it('intents are immutable', () => {
    const intentManager = getIntentManager();
    
    const intent = intentManager.createIntent({
      txId: 'tx_test',
      origin: 'https://example.com',
      contextId: 'ctx_test',
      intentType: IntentType.SIGN_ONLY,
    });
    
    // Object should be frozen
    expect(Object.isFrozen(intent)).toBe(true);
    
    // Attempting to modify should throw
    expect(() => {
      (intent as any).txId = 'modified';
    }).toThrow();
    
    expect(() => {
      (intent as any).intentType = IntentType.SIGN_AND_SUBMIT;
    }).toThrow();
  });

  it('Phase 3.2 gate remains fully effective', () => {
    const gate = getTxSubmissionGate();
    const status = gate.getStatus();
    
    expect(status.blocking).toBe(true);
    expect(status.blockedMethods.length).toBeGreaterThan(5);
    
    // All attempts blocked
    for (let i = 0; i < 10; i++) {
      const result = gate.attemptSubmission(`tx_${i}`);
      expect(result.allowed).toBe(false);
    }
  });
});

// ============ Intent Types Tests ============

describe('Intent Types', () => {
  it('should have correct IntentType values', () => {
    expect(IntentType.SIGN_ONLY).toBe('SIGN_ONLY');
    expect(IntentType.SIGN_AND_SUBMIT).toBe('SIGN_AND_SUBMIT');
  });

  it('should have correct IntentStatus values', () => {
    expect(IntentStatus.PENDING).toBe('PENDING');
    expect(IntentStatus.CONFIRMED).toBe('CONFIRMED');
    expect(IntentStatus.EXPIRED).toBe('EXPIRED');
    expect(IntentStatus.REVOKED).toBe('REVOKED');
    expect(IntentStatus.CONSUMED).toBe('CONSUMED');
  });
});


/**
 * Liminal - RPC Pool Tests
 * 
 * Tests for Phase 3.4: Read-Only RPC Pool
 * 
 * VERIFICATION:
 * - ONLY read-only RPC calls occur
 * - Submission methods THROW immediately
 * - Gate remains effective
 * - Deterministic endpoint scoring
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RpcEndpointConfig,
  TxState,
  SimulatedTxPayload,
  SubmissionBlockReason,
} from '../src/shared/tx-types';
import {
  RpcEndpointPool,
  getRpcEndpointPool,
  resetRpcEndpointPool,
} from '../src/main/modules/rpc/RpcEndpointPool';
import {
  ReadOnlySolanaRpcClient,
  getReadOnlyRpcClient,
  resetReadOnlyRpcClient,
} from '../src/main/modules/rpc/ReadOnlySolanaRpcClient';
import {
  getTxPipeline,
  resetTxPipeline,
} from '../src/main/modules/tx/TxPipeline';
import {
  getTxSubmissionGate,
  resetTxSubmissionGate,
  SubmissionBlockedError,
} from '../src/main/modules/tx/TxSubmissionGate';
import {
  getTxStateMachine,
  resetTxStateMachine,
} from '../src/main/modules/tx/TxStateMachine';

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

// ============ RpcEndpointPool Tests ============

describe('RpcEndpointPool', () => {
  let pool: RpcEndpointPool;

  beforeEach(() => {
    resetRpcEndpointPool();
    pool = getRpcEndpointPool();
  });

  afterEach(() => {
    resetRpcEndpointPool();
  });

  describe('Endpoint Management', () => {
    it('should initialize with default endpoints', () => {
      const endpoints = pool.getAllEndpoints();
      expect(endpoints.length).toBeGreaterThan(0);
      
      // Should have mainnet and devnet
      const ids = endpoints.map(e => e.id);
      expect(ids).toContain('mainnet-public-1');
      expect(ids).toContain('devnet-public-1');
    });

    it('should add custom endpoints', () => {
      const customEndpoint: RpcEndpointConfig = {
        id: 'custom-1',
        url: 'https://custom-rpc.example.com',
        name: 'Custom RPC',
        enabled: true,
      };
      
      pool.addEndpoint(customEndpoint);
      
      const endpoint = pool.getEndpoint('custom-1');
      expect(endpoint).toBeDefined();
      expect(endpoint?.url).toBe('https://custom-rpc.example.com');
    });

    it('should remove endpoints', () => {
      pool.addEndpoint({
        id: 'to-remove',
        url: 'https://remove.example.com',
        name: 'Remove Me',
        enabled: true,
      });
      
      expect(pool.getEndpoint('to-remove')).toBeDefined();
      
      const removed = pool.removeEndpoint('to-remove');
      expect(removed).toBe(true);
      expect(pool.getEndpoint('to-remove')).toBeUndefined();
    });

    it('should enable/disable endpoints', () => {
      pool.setEndpointEnabled('mainnet-public-1', false);
      
      const enabled = pool.getEnabledEndpoints();
      expect(enabled.find(e => e.id === 'mainnet-public-1')).toBeUndefined();
      
      pool.setEndpointEnabled('mainnet-public-1', true);
      const enabledAfter = pool.getEnabledEndpoints();
      expect(enabledAfter.find(e => e.id === 'mainnet-public-1')).toBeDefined();
    });
  });

  describe('Metrics Tracking', () => {
    it('should initialize metrics for endpoints', () => {
      const metrics = pool.getMetrics('mainnet-public-1');
      
      expect(metrics).toBeDefined();
      expect(metrics?.totalRequests).toBe(0);
      expect(metrics?.successfulRequests).toBe(0);
      expect(metrics?.failedRequests).toBe(0);
      expect(metrics?.score).toBe(50); // Default neutral score
    });

    it('should record successful requests', () => {
      pool.recordSuccess('mainnet-public-1', 100);
      
      const metrics = pool.getMetrics('mainnet-public-1');
      expect(metrics?.totalRequests).toBe(1);
      expect(metrics?.successfulRequests).toBe(1);
      expect(metrics?.failedRequests).toBe(0);
      expect(metrics?.lastSuccessAt).toBeDefined();
    });

    it('should record failed requests', () => {
      pool.recordFailure('mainnet-public-1');
      
      const metrics = pool.getMetrics('mainnet-public-1');
      expect(metrics?.totalRequests).toBe(1);
      expect(metrics?.successfulRequests).toBe(0);
      expect(metrics?.failedRequests).toBe(1);
      expect(metrics?.lastFailureAt).toBeDefined();
    });

    it('should update average latency', () => {
      pool.recordSuccess('mainnet-public-1', 100);
      pool.recordSuccess('mainnet-public-1', 200);
      pool.recordSuccess('mainnet-public-1', 300);
      
      const metrics = pool.getMetrics('mainnet-public-1');
      // EMA calculation
      expect(metrics?.avgLatencyMs).toBeGreaterThan(100);
      expect(metrics?.avgLatencyMs).toBeLessThan(300);
    });

    it('should track slot freshness', () => {
      pool.recordSuccess('mainnet-public-1', 100, 200000);
      
      const metrics = pool.getMetrics('mainnet-public-1');
      expect(metrics?.lastKnownSlot).toBe(200000);
    });

    it('should reset metrics', () => {
      pool.recordSuccess('mainnet-public-1', 100);
      pool.recordFailure('mainnet-public-1');
      
      pool.resetMetrics('mainnet-public-1');
      
      const metrics = pool.getMetrics('mainnet-public-1');
      expect(metrics?.totalRequests).toBe(0);
      expect(metrics?.successfulRequests).toBe(0);
      expect(metrics?.failedRequests).toBe(0);
      expect(metrics?.score).toBe(50);
    });
  });

  describe('Deterministic Scoring', () => {
    it('should calculate score based on success rate', () => {
      // 100% success rate
      for (let i = 0; i < 10; i++) {
        pool.recordSuccess('mainnet-public-1', 50);
      }
      const metrics1 = pool.getMetrics('mainnet-public-1')!;
      
      // 50% success rate (different endpoint)
      pool.addEndpoint({
        id: 'test-endpoint',
        url: 'https://test.example.com',
        name: 'Test',
        enabled: true,
      });
      for (let i = 0; i < 5; i++) {
        pool.recordSuccess('test-endpoint', 50);
        pool.recordFailure('test-endpoint');
      }
      const metrics2 = pool.getMetrics('test-endpoint')!;
      
      // Higher success rate should have higher score
      expect(metrics1.score).toBeGreaterThan(metrics2.score);
    });

    it('should factor in latency', () => {
      // Fast endpoint
      pool.addEndpoint({
        id: 'fast-endpoint',
        url: 'https://fast.example.com',
        name: 'Fast',
        enabled: true,
      });
      pool.recordSuccess('fast-endpoint', 50); // 50ms
      
      // Slow endpoint
      pool.addEndpoint({
        id: 'slow-endpoint',
        url: 'https://slow.example.com',
        name: 'Slow',
        enabled: true,
      });
      pool.recordSuccess('slow-endpoint', 2000); // 2000ms
      
      const fastMetrics = pool.getMetrics('fast-endpoint')!;
      const slowMetrics = pool.getMetrics('slow-endpoint')!;
      
      expect(fastMetrics.score).toBeGreaterThan(slowMetrics.score);
    });

    it('should be deterministic for same inputs', () => {
      pool.recordSuccess('mainnet-public-1', 100);
      pool.recordSuccess('mainnet-public-1', 100);
      pool.recordSuccess('mainnet-public-1', 100);
      
      const score1 = pool.getMetrics('mainnet-public-1')?.score;
      
      pool.resetMetrics('mainnet-public-1');
      pool.recordSuccess('mainnet-public-1', 100);
      pool.recordSuccess('mainnet-public-1', 100);
      pool.recordSuccess('mainnet-public-1', 100);
      
      const score2 = pool.getMetrics('mainnet-public-1')?.score;
      
      expect(score1).toBe(score2);
    });
  });

  describe('Endpoint Selection', () => {
    it('should select best endpoint by score', () => {
      // Give mainnet-public-1 a high score
      for (let i = 0; i < 10; i++) {
        pool.recordSuccess('mainnet-public-1', 50);
      }
      
      // Give devnet-public-1 a low score
      for (let i = 0; i < 10; i++) {
        pool.recordFailure('devnet-public-1');
      }
      
      const best = pool.selectBestEndpoint();
      expect(best?.id).toBe('mainnet-public-1');
    });

    it('should return ranked endpoints', () => {
      pool.recordSuccess('mainnet-public-1', 50);
      pool.recordSuccess('mainnet-public-1', 50);
      pool.recordFailure('devnet-public-1');
      
      const ranked = pool.getRankedEndpoints();
      
      expect(ranked.length).toBeGreaterThan(0);
      expect(ranked[0].metrics.score).toBeGreaterThanOrEqual(ranked[1]?.metrics.score || 0);
    });

    it('should return undefined if no enabled endpoints', () => {
      pool.setEndpointEnabled('mainnet-public-1', false);
      pool.setEndpointEnabled('devnet-public-1', false);
      
      const best = pool.selectBestEndpoint();
      expect(best).toBeUndefined();
    });
  });
});

// ============ ReadOnlySolanaRpcClient Tests ============

describe('ReadOnlySolanaRpcClient', () => {
  let client: ReadOnlySolanaRpcClient;

  beforeEach(() => {
    // First reset both singletons
    resetRpcEndpointPool();
    resetReadOnlyRpcClient();
    
    // Then get the client - it will create a fresh pool via its getter
    client = getReadOnlyRpcClient(true); // Mock mode
  });

  afterEach(() => {
    resetRpcEndpointPool();
    resetReadOnlyRpcClient();
  });

  describe('Read-Only Methods', () => {
    it('should get health', async () => {
      const health = await client.getHealth();
      
      expect(health).toBeDefined();
      expect(health.healthy).toBe(true);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should get latest blockhash', async () => {
      const response = await client.getLatestBlockhash();
      
      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data?.blockhash).toBeDefined();
      expect(response.data?.blockhash).toMatch(/^MockBlockhash/);
      expect(response.data?.lastValidBlockHeight).toBeGreaterThan(0);
      expect(response.endpointId).toBeDefined();
      expect(response.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should get slot', async () => {
      const response = await client.getSlot();
      
      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data?.slot).toBeGreaterThan(0);
    });

    it('should get version', async () => {
      const response = await client.getVersion();
      
      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data?.solanaCore).toBe('1.18.0');
    });

    it('should record metrics on successful calls', async () => {
      await client.getSlot();
      await client.getSlot();
      await client.getSlot();
      
      const pool = client.getPool();
      const metrics = pool.getAllMetrics();
      
      const hasRecordedMetrics = metrics.some(m => m.totalRequests > 0);
      expect(hasRecordedMetrics).toBe(true);
    });
  });

  describe('Blocked Methods (THROW)', () => {
    it('should throw on sendTransaction', () => {
      expect(() => client.sendTransaction({})).toThrow(SubmissionBlockedError);
    });

    it('should throw on sendRawTransaction', () => {
      expect(() => client.sendRawTransaction({})).toThrow(SubmissionBlockedError);
    });

    it('should throw on sendAndConfirmTransaction', () => {
      expect(() => client.sendAndConfirmTransaction({})).toThrow(SubmissionBlockedError);
    });

    it('should throw on sendAndConfirmRawTransaction', () => {
      expect(() => client.sendAndConfirmRawTransaction({})).toThrow(SubmissionBlockedError);
    });

    it('should throw on simulateTransaction', () => {
      expect(() => client.simulateTransaction({})).toThrow(SubmissionBlockedError);
    });

    it('should throw on requestAirdrop', () => {
      expect(() => client.requestAirdrop('address', 1000)).toThrow(SubmissionBlockedError);
    });

    it('should include correct reason code in error', () => {
      try {
        client.sendTransaction({});
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(SubmissionBlockedError);
        expect((e as SubmissionBlockedError).reasonCode).toBe(SubmissionBlockReason.GATE_BLOCKED);
      }
    });
  });

  describe('Mock Mode', () => {
    it('should support mock mode toggle', () => {
      expect(client.isInMockMode()).toBe(true);
      
      client.setMockMode(false);
      expect(client.isInMockMode()).toBe(false);
      
      client.setMockMode(true);
      expect(client.isInMockMode()).toBe(true);
    });

    it('should return mock data in mock mode', async () => {
      const blockhash = await client.getLatestBlockhash();
      
      expect(blockhash.success).toBe(true);
      expect(blockhash.data?.blockhash).toMatch(/^MockBlockhash/);
    });
  });

  describe('Health Check All', () => {
    it('should check all enabled endpoints', async () => {
      const results = await client.healthCheckAll();
      
      expect(results.size).toBeGreaterThan(0);
      
      for (const [id, health] of results) {
        expect(id).toBeDefined();
        expect(health.healthy).toBe(true);
      }
    });
  });

  describe('Blocked Methods List', () => {
    it('should expose list of blocked methods', () => {
      const blocked = client.getBlockedMethods();
      
      expect(blocked).toContain('sendTransaction');
      expect(blocked).toContain('sendRawTransaction');
      expect(blocked).toContain('simulateTransaction');
      expect(blocked).toContain('requestAirdrop');
    });
  });
});

// ============ TxPipeline RPC Integration Tests ============

describe('TxPipeline RPC Integration', () => {
  beforeEach(() => {
    resetRpcEndpointPool();
    resetReadOnlyRpcClient();
    resetTxStateMachine();
    resetTxPipeline();
    resetTxSubmissionGate();
  });

  afterEach(() => {
    resetRpcEndpointPool();
    resetReadOnlyRpcClient();
    resetTxStateMachine();
    resetTxPipeline();
    resetTxSubmissionGate();
  });

  describe('Blockhash and Slot Fetching', () => {
    it('should fetch blockhash for transaction', async () => {
      const pipeline = getTxPipeline();
      const payload = createTestPayload();
      
      const tx = pipeline.createTransaction('ctx_test', payload);
      const response = await pipeline.fetchBlockhash(tx.txId);
      
      expect(response.success).toBe(true);
      expect(response.data?.blockhash).toBeDefined();
    });

    it('should fetch slot for transaction', async () => {
      const pipeline = getTxPipeline();
      const payload = createTestPayload();
      
      const tx = pipeline.createTransaction('ctx_test', payload);
      const response = await pipeline.fetchSlot(tx.txId);
      
      expect(response.success).toBe(true);
      expect(response.data?.slot).toBeGreaterThan(0);
    });

    it('should include RPC data in receipt', async () => {
      const pipeline = getTxPipeline();
      const stateMachine = getTxStateMachine();
      const payload = createTestPayload();
      
      const tx = pipeline.createTransaction('ctx_test', payload);
      
      // Fetch RPC data
      await pipeline.fetchBlockhash(tx.txId);
      await pipeline.fetchSlot(tx.txId);
      
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
      
      expect(receipt.rpcEndpointId).toBeDefined();
      expect(receipt.rpcLatencyMs).toBeGreaterThanOrEqual(0);
      expect(receipt.blockhashFetched).toBeDefined();
      expect(receipt.slotFetched).toBeGreaterThan(0);
    });
  });

  describe('Submission Still Blocked', () => {
    it('should block submission even with RPC connectivity', async () => {
      const pipeline = getTxPipeline();
      const payload = createTestPayload();
      
      const tx = pipeline.createTransaction('ctx_test', payload);
      
      // Fetch RPC data (read-only)
      await pipeline.fetchBlockhash(tx.txId);
      await pipeline.fetchSlot(tx.txId);
      
      // Attempt submission - should be blocked
      const result = pipeline.attemptSubmission(tx.txId);
      expect(result.allowed).toBe(false);
    });

    it('should throw on RPC client submission methods', () => {
      const pipeline = getTxPipeline();
      const rpcClient = pipeline.getRpcClient();
      
      expect(() => rpcClient.sendTransaction({})).toThrow(SubmissionBlockedError);
      expect(() => rpcClient.sendRawTransaction({})).toThrow(SubmissionBlockedError);
    });
  });

  describe('Gate Remains Effective', () => {
    it('should maintain gate blocking after RPC operations', async () => {
      const pipeline = getTxPipeline();
      const gate = getTxSubmissionGate();
      const payload = createTestPayload();
      
      const tx = pipeline.createTransaction('ctx_test', payload);
      
      // Perform RPC operations
      await pipeline.fetchBlockhash(tx.txId);
      await pipeline.fetchSlot(tx.txId);
      
      // Gate should still be blocking
      const status = gate.getStatus();
      expect(status.blocking).toBe(true);
      
      // All submission methods should still throw
      expect(() => gate.sendTransaction({})).toThrow();
      expect(() => gate.sendRawTransaction({})).toThrow();
    });
  });

  describe('RPC Mock Mode', () => {
    it('should support setting mock mode', () => {
      const pipeline = getTxPipeline();
      
      pipeline.setRpcMockMode(false);
      expect(pipeline.getRpcClient().isInMockMode()).toBe(false);
      
      pipeline.setRpcMockMode(true);
      expect(pipeline.getRpcClient().isInMockMode()).toBe(true);
    });
  });
});

// ============ Phase 3.4 Guarantees ============

describe('Phase 3.4 Guarantees', () => {
  beforeEach(() => {
    resetRpcEndpointPool();
    resetReadOnlyRpcClient();
    resetTxStateMachine();
    resetTxPipeline();
    resetTxSubmissionGate();
  });

  afterEach(() => {
    resetRpcEndpointPool();
    resetReadOnlyRpcClient();
    resetTxStateMachine();
    resetTxPipeline();
    resetTxSubmissionGate();
  });

  it('NO transaction submission via RPC', () => {
    const client = getReadOnlyRpcClient(true);
    
    // All submission methods throw
    expect(() => client.sendTransaction({})).toThrow();
    expect(() => client.sendRawTransaction({})).toThrow();
    expect(() => client.sendAndConfirmTransaction({})).toThrow();
    expect(() => client.sendAndConfirmRawTransaction({})).toThrow();
  });

  it('NO broadcast methods available', () => {
    const client = getReadOnlyRpcClient(true);
    const blockedMethods = client.getBlockedMethods();
    
    expect(blockedMethods).toContain('sendTransaction');
    expect(blockedMethods).toContain('sendRawTransaction');
  });

  it('Gate remains effective after RPC operations', async () => {
    const pipeline = getTxPipeline();
    const gate = getTxSubmissionGate();
    const payload = createTestPayload();
    
    const tx = pipeline.createTransaction('ctx_test', payload);
    
    // Perform many RPC operations
    for (let i = 0; i < 10; i++) {
      await pipeline.fetchBlockhash(tx.txId);
      await pipeline.fetchSlot(tx.txId);
    }
    
    // Gate STILL blocks
    expect(gate.getStatus().blocking).toBe(true);
    expect(() => gate.sendTransaction({})).toThrow();
    
    // Submission STILL blocked
    const result = pipeline.attemptSubmission(tx.txId);
    expect(result.allowed).toBe(false);
  });

  it('ONLY read-only RPC calls available', () => {
    const client = getReadOnlyRpcClient(true);
    
    // These should be functions (read-only)
    expect(typeof client.getHealth).toBe('function');
    expect(typeof client.getLatestBlockhash).toBe('function');
    expect(typeof client.getSlot).toBe('function');
    expect(typeof client.getVersion).toBe('function');
    
    // These should throw (submission)
    expect(() => client.sendTransaction({})).toThrow();
    expect(() => client.sendRawTransaction({})).toThrow();
  });

  it('Deterministic endpoint scoring', () => {
    const pool = getRpcEndpointPool();
    
    // Same inputs should produce same scores
    pool.recordSuccess('mainnet-public-1', 100);
    pool.recordSuccess('mainnet-public-1', 100);
    const score1 = pool.getMetrics('mainnet-public-1')?.score;
    
    pool.resetMetrics('mainnet-public-1');
    pool.recordSuccess('mainnet-public-1', 100);
    pool.recordSuccess('mainnet-public-1', 100);
    const score2 = pool.getMetrics('mainnet-public-1')?.score;
    
    expect(score1).toBe(score2);
  });
});


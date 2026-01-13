/**
 * Liminal - RPC Routing Tests
 * 
 * Tests for Phase 3.5: RPC Privacy Routing
 * 
 * VERIFICATION:
 * - Different purposes use different endpoints when available
 * - Route rotation on identity change
 * - Deterministic routing
 * - NO submission possible
 * - Phase 3.2 gate remains effective
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  RpcPurpose,
  TxState,
  SimulatedTxPayload,
  RouteRotationReason,
} from '../src/shared/tx-types';
import {
  RpcRouteManager,
  getRpcRouteManager,
  resetRpcRouteManager,
} from '../src/main/modules/rpc/RpcRouteManager';
import {
  getRpcEndpointPool,
  resetRpcEndpointPool,
} from '../src/main/modules/rpc/RpcEndpointPool';
import {
  getReadOnlyRpcClient,
  resetReadOnlyRpcClient,
} from '../src/main/modules/rpc/ReadOnlySolanaRpcClient';
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

// ============ RpcRouteManager Tests ============

describe('RpcRouteManager', () => {
  let routeManager: RpcRouteManager;

  beforeEach(() => {
    resetRpcEndpointPool();
    resetRpcRouteManager();
    routeManager = getRpcRouteManager();
  });

  afterEach(() => {
    resetRpcEndpointPool();
    resetRpcRouteManager();
  });

  describe('Route Creation', () => {
    it('should create a new route', () => {
      const result = routeManager.getOrCreateRoute(
        'ctx_test',
        'https://example.com',
        RpcPurpose.BLOCKHASH
      );
      
      expect(result.isNew).toBe(true);
      expect(result.route.routeId).toBeDefined();
      expect(result.route.routeId).toMatch(/^route_/);
      expect(result.route.contextId).toBe('ctx_test');
      expect(result.route.origin).toBe('https://example.com');
      expect(result.route.purpose).toBe(RpcPurpose.BLOCKHASH);
      expect(result.route.active).toBe(true);
    });

    it('should reuse existing route for same context + origin + purpose', () => {
      const first = routeManager.getOrCreateRoute(
        'ctx_test',
        'https://example.com',
        RpcPurpose.BLOCKHASH
      );
      
      const second = routeManager.getOrCreateRoute(
        'ctx_test',
        'https://example.com',
        RpcPurpose.BLOCKHASH
      );
      
      expect(first.isNew).toBe(true);
      expect(second.isNew).toBe(false);
      expect(first.route.routeId).toBe(second.route.routeId);
      expect(second.route.useCount).toBe(2);
    });

    it('should create different routes for different purposes', () => {
      const blockhashRoute = routeManager.getOrCreateRoute(
        'ctx_test',
        'https://example.com',
        RpcPurpose.BLOCKHASH
      );
      
      const slotRoute = routeManager.getOrCreateRoute(
        'ctx_test',
        'https://example.com',
        RpcPurpose.SLOT
      );
      
      expect(blockhashRoute.route.routeId).not.toBe(slotRoute.route.routeId);
      expect(blockhashRoute.route.purpose).toBe(RpcPurpose.BLOCKHASH);
      expect(slotRoute.route.purpose).toBe(RpcPurpose.SLOT);
    });

    it('should create different routes for different contexts', () => {
      const route1 = routeManager.getOrCreateRoute(
        'ctx_1',
        'https://example.com',
        RpcPurpose.BLOCKHASH
      );
      
      const route2 = routeManager.getOrCreateRoute(
        'ctx_2',
        'https://example.com',
        RpcPurpose.BLOCKHASH
      );
      
      expect(route1.route.routeId).not.toBe(route2.route.routeId);
    });
  });

  describe('Purpose-Based Endpoint Selection', () => {
    it('should use different endpoints for different purposes when available', () => {
      // With 2 default endpoints, different purposes should get different endpoints
      const blockhashRoute = routeManager.getOrCreateRoute(
        'ctx_test',
        'https://example.com',
        RpcPurpose.BLOCKHASH
      );
      
      const slotRoute = routeManager.getOrCreateRoute(
        'ctx_test',
        'https://example.com',
        RpcPurpose.SLOT
      );
      
      // Should use different endpoints
      expect(blockhashRoute.route.endpointId).not.toBe(slotRoute.route.endpointId);
      expect(blockhashRoute.endpointReused).toBe(false);
      expect(slotRoute.endpointReused).toBe(false);
    });

    it('should reuse endpoint when no more available', () => {
      // With 2 endpoints and 3 purposes, one must reuse
      const blockhashRoute = routeManager.getOrCreateRoute(
        'ctx_test',
        'https://example.com',
        RpcPurpose.BLOCKHASH
      );
      
      const slotRoute = routeManager.getOrCreateRoute(
        'ctx_test',
        'https://example.com',
        RpcPurpose.SLOT
      );
      
      const versionRoute = routeManager.getOrCreateRoute(
        'ctx_test',
        'https://example.com',
        RpcPurpose.VERSION
      );
      
      // First two should be different, third should reuse one
      expect(blockhashRoute.route.endpointId).not.toBe(slotRoute.route.endpointId);
      expect(versionRoute.endpointReused).toBe(true);
    });

    it('should detect purpose separation', () => {
      // With 2 endpoints and 2 purposes, should be separated
      routeManager.getOrCreateRoute('ctx_test', 'https://example.com', RpcPurpose.BLOCKHASH);
      routeManager.getOrCreateRoute('ctx_test', 'https://example.com', RpcPurpose.SLOT);
      
      expect(routeManager.arePurposesSeparated('ctx_test')).toBe(true);
    });

    it('should detect when purposes are not separated', () => {
      // With 2 endpoints and 3 purposes, one must reuse
      routeManager.getOrCreateRoute('ctx_test', 'https://example.com', RpcPurpose.BLOCKHASH);
      routeManager.getOrCreateRoute('ctx_test', 'https://example.com', RpcPurpose.SLOT);
      routeManager.getOrCreateRoute('ctx_test', 'https://example.com', RpcPurpose.VERSION);
      
      expect(routeManager.arePurposesSeparated('ctx_test')).toBe(false);
    });
  });

  describe('Route Rotation', () => {
    it('should rotate routes on identity change', () => {
      // Create routes
      const route1 = routeManager.getOrCreateRoute(
        'ctx_test',
        'https://example.com',
        RpcPurpose.BLOCKHASH
      );
      const route2 = routeManager.getOrCreateRoute(
        'ctx_test',
        'https://example.com',
        RpcPurpose.SLOT
      );
      
      expect(route1.route.active).toBe(true);
      expect(route2.route.active).toBe(true);
      
      // Rotate routes
      const rotated = routeManager.rotateContextRoutes(
        'ctx_test',
        RouteRotationReason.IDENTITY_ROTATION
      );
      
      expect(rotated).toBe(2);
      
      // Check routes are deactivated
      const oldRoute1 = routeManager.getRoute(route1.route.routeId);
      const oldRoute2 = routeManager.getRoute(route2.route.routeId);
      
      expect(oldRoute1?.active).toBe(false);
      expect(oldRoute2?.active).toBe(false);
    });

    it('should create new routes after rotation', () => {
      // Create initial route
      const initial = routeManager.getOrCreateRoute(
        'ctx_test',
        'https://example.com',
        RpcPurpose.BLOCKHASH
      );
      const initialRouteId = initial.route.routeId;
      
      // Rotate
      routeManager.rotateContextRoutes('ctx_test', RouteRotationReason.IDENTITY_ROTATION);
      
      // Create new route - should be different
      const afterRotation = routeManager.getOrCreateRoute(
        'ctx_test',
        'https://example.com',
        RpcPurpose.BLOCKHASH
      );
      
      expect(afterRotation.isNew).toBe(true);
      expect(afterRotation.route.routeId).not.toBe(initialRouteId);
    });

    it('should clear endpoint assignments on rotation', () => {
      // Create routes using endpoints
      routeManager.getOrCreateRoute('ctx_test', 'https://example.com', RpcPurpose.BLOCKHASH);
      routeManager.getOrCreateRoute('ctx_test', 'https://example.com', RpcPurpose.SLOT);
      
      const summaryBefore = routeManager.getContextEndpointSummary('ctx_test');
      expect(summaryBefore.size).toBe(2);
      
      // Rotate
      routeManager.rotateContextRoutes('ctx_test', RouteRotationReason.IDENTITY_ROTATION);
      
      const summaryAfter = routeManager.getContextEndpointSummary('ctx_test');
      expect(summaryAfter.size).toBe(0);
    });
  });

  describe('Deterministic Routing', () => {
    it('should be deterministic for same inputs', () => {
      // Create route
      const route1 = routeManager.getOrCreateRoute(
        'ctx_test',
        'https://example.com',
        RpcPurpose.BLOCKHASH
      );
      const endpoint1 = route1.route.endpointId;
      
      // Clear and recreate
      resetRpcRouteManager();
      const newManager = getRpcRouteManager();
      
      const route2 = newManager.getOrCreateRoute(
        'ctx_test',
        'https://example.com',
        RpcPurpose.BLOCKHASH
      );
      
      // Same context + origin + purpose should get same endpoint (deterministic)
      expect(route2.route.endpointId).toBe(endpoint1);
    });

    it('should consistently separate purposes', () => {
      // Create routes
      const blockhash1 = routeManager.getOrCreateRoute('ctx_test', 'origin1', RpcPurpose.BLOCKHASH);
      const slot1 = routeManager.getOrCreateRoute('ctx_test', 'origin1', RpcPurpose.SLOT);
      
      // Clear and recreate
      resetRpcRouteManager();
      const newManager = getRpcRouteManager();
      
      const blockhash2 = newManager.getOrCreateRoute('ctx_test', 'origin1', RpcPurpose.BLOCKHASH);
      const slot2 = newManager.getOrCreateRoute('ctx_test', 'origin1', RpcPurpose.SLOT);
      
      // Same separation pattern
      expect(blockhash1.route.endpointId).toBe(blockhash2.route.endpointId);
      expect(slot1.route.endpointId).toBe(slot2.route.endpointId);
      expect(blockhash1.route.endpointId).not.toBe(slot1.route.endpointId);
    });
  });
});

// ============ TxPipeline Route Integration ============

describe('TxPipeline Route Integration', () => {
  beforeEach(() => {
    resetRpcEndpointPool();
    resetRpcRouteManager();
    resetReadOnlyRpcClient();
    resetTxStateMachine();
    resetTxPipeline();
    resetTxSubmissionGate();
  });

  afterEach(() => {
    resetRpcEndpointPool();
    resetRpcRouteManager();
    resetReadOnlyRpcClient();
    resetTxStateMachine();
    resetTxPipeline();
    resetTxSubmissionGate();
  });

  describe('Routed RPC Calls', () => {
    it('should use route context for fetchBlockhash', async () => {
      const pipeline = getTxPipeline();
      const payload = createTestPayload();
      
      const tx = pipeline.createTransaction('ctx_test', payload);
      const response = await pipeline.fetchBlockhash(tx.txId);
      
      expect(response.success).toBe(true);
      expect(response.routeId).toBeDefined();
      expect(response.routeId).toMatch(/^route_/);
    });

    it('should use route context for fetchSlot', async () => {
      const pipeline = getTxPipeline();
      const payload = createTestPayload();
      
      const tx = pipeline.createTransaction('ctx_test', payload);
      const response = await pipeline.fetchSlot(tx.txId);
      
      expect(response.success).toBe(true);
      expect(response.routeId).toBeDefined();
    });

    it('should use different endpoints for blockhash and slot', async () => {
      const pipeline = getTxPipeline();
      const payload = createTestPayload();
      
      const tx = pipeline.createTransaction('ctx_test', payload);
      
      const blockhashResponse = await pipeline.fetchBlockhash(tx.txId);
      const slotResponse = await pipeline.fetchSlot(tx.txId);
      
      // Different routes
      expect(blockhashResponse.routeId).not.toBe(slotResponse.routeId);
      
      // Different endpoints (when available)
      expect(blockhashResponse.endpointId).not.toBe(slotResponse.endpointId);
    });
  });

  describe('Receipt with Route Info', () => {
    it('should include route info in receipt', async () => {
      const pipeline = getTxPipeline();
      const stateMachine = getTxStateMachine();
      const payload = createTestPayload();
      
      const tx = pipeline.createTransaction('ctx_test', payload);
      
      // Fetch RPC data with routing
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
      
      expect(receipt.rpcRouteId).toBeDefined();
      expect(receipt.rpcPurpose).toBeDefined();
      expect(receipt.endpointReused).toBeDefined();
    });
  });

  describe('Route Rotation in Pipeline', () => {
    it('should support route rotation through pipeline', async () => {
      const pipeline = getTxPipeline();
      const payload = createTestPayload();
      
      // Create transaction and fetch blockhash
      const tx = pipeline.createTransaction('ctx_test', payload);
      await pipeline.fetchBlockhash(tx.txId);
      
      const beforeRotation = pipeline.getRouteForTx(tx.txId, RpcPurpose.BLOCKHASH);
      expect(beforeRotation).toBeDefined();
      
      // Rotate routes
      const rotated = pipeline.rotateContextRoutes('ctx_test', RouteRotationReason.IDENTITY_ROTATION);
      expect(rotated).toBeGreaterThanOrEqual(1); // At least BLOCKHASH route
      
      // Check routes are rotated in route manager
      const routeManager = pipeline.getRouteManager();
      const allActive = routeManager.getAllActiveRoutes();
      const contextRoutes = allActive.filter(r => r.contextId === 'ctx_test');
      expect(contextRoutes.length).toBe(0);
    });
  });

  describe('Purpose Separation Check', () => {
    it('should report purpose separation status', async () => {
      const pipeline = getTxPipeline();
      const payload = createTestPayload();
      
      const tx = pipeline.createTransaction('ctx_test', payload);
      
      // Fetch both - with 2 endpoints, should be separated
      await pipeline.fetchBlockhash(tx.txId);
      await pipeline.fetchSlot(tx.txId);
      
      const separated = pipeline.arePurposesSeparated('ctx_test');
      expect(separated).toBe(true);
    });
  });
});

// ============ Phase 3.5 Guarantees ============

describe('Phase 3.5 Guarantees', () => {
  beforeEach(() => {
    resetRpcEndpointPool();
    resetRpcRouteManager();
    resetReadOnlyRpcClient();
    resetTxStateMachine();
    resetTxPipeline();
    resetTxSubmissionGate();
  });

  afterEach(() => {
    resetRpcEndpointPool();
    resetRpcRouteManager();
    resetReadOnlyRpcClient();
    resetTxStateMachine();
    resetTxPipeline();
    resetTxSubmissionGate();
  });

  it('NO transaction submission despite routing', async () => {
    const pipeline = getTxPipeline();
    const gate = getTxSubmissionGate();
    const payload = createTestPayload();
    
    const tx = pipeline.createTransaction('ctx_test', payload);
    
    // Use routing
    await pipeline.fetchBlockhash(tx.txId);
    await pipeline.fetchSlot(tx.txId);
    
    // Submission still blocked
    const result = pipeline.attemptSubmission(tx.txId);
    expect(result.allowed).toBe(false);
    
    // Gate still effective
    expect(() => gate.sendTransaction({})).toThrow(SubmissionBlockedError);
  });

  it('NO signing changes from routing', async () => {
    const pipeline = getTxPipeline();
    const payload = createTestPayload();
    
    const tx = pipeline.createTransaction('ctx_test', payload);
    
    // Routing doesn't affect signing
    await pipeline.fetchBlockhash(tx.txId);
    await pipeline.fetchSlot(tx.txId);
    
    // Signing still works via wallet adapter (not testing actual signing here)
    expect(pipeline.isIntentEnforcedForSigning()).toBe(false);
  });

  it('Phase 3.2 gate remains fully effective', async () => {
    const pipeline = getTxPipeline();
    const gate = getTxSubmissionGate();
    const payload = createTestPayload();
    
    const tx = pipeline.createTransaction('ctx_test', payload);
    
    // Heavy routing usage
    for (let i = 0; i < 10; i++) {
      await pipeline.fetchBlockhash(tx.txId);
      await pipeline.fetchSlot(tx.txId);
    }
    
    // Gate still blocking
    const status = gate.getStatus();
    expect(status.blocking).toBe(true);
    
    // All blocked methods still throw
    expect(() => gate.sendTransaction({})).toThrow();
    expect(() => gate.sendRawTransaction({})).toThrow();
    expect(() => gate.submitTransaction({})).toThrow();
  });

  it('Deterministic routing behavior', () => {
    const routeManager = getRpcRouteManager();
    
    // Same inputs should give same results
    const route1 = routeManager.getOrCreateRoute('ctx_1', 'origin_1', RpcPurpose.BLOCKHASH);
    const route2 = routeManager.getOrCreateRoute('ctx_1', 'origin_1', RpcPurpose.BLOCKHASH);
    
    expect(route1.route.endpointId).toBe(route2.route.endpointId);
    expect(route1.route.routeId).toBe(route2.route.routeId);
  });

  it('Different purposes use different endpoints when available', () => {
    const routeManager = getRpcRouteManager();
    
    // With 2 default endpoints
    const blockhash = routeManager.getOrCreateRoute('ctx_test', 'origin', RpcPurpose.BLOCKHASH);
    const slot = routeManager.getOrCreateRoute('ctx_test', 'origin', RpcPurpose.SLOT);
    
    expect(blockhash.route.endpointId).not.toBe(slot.route.endpointId);
  });

  it('Route rotation works on identity change', () => {
    const routeManager = getRpcRouteManager();
    
    // Create routes
    routeManager.getOrCreateRoute('ctx_test', 'origin', RpcPurpose.BLOCKHASH);
    routeManager.getOrCreateRoute('ctx_test', 'origin', RpcPurpose.SLOT);
    
    // Verify routes exist
    const beforeRotation = routeManager.getContextRoutes('ctx_test');
    expect(beforeRotation.filter(r => r.active).length).toBe(2);
    
    // Rotate
    const rotated = routeManager.rotateContextRoutes('ctx_test', RouteRotationReason.IDENTITY_ROTATION);
    expect(rotated).toBe(2);
    
    // All routes deactivated
    const afterRotation = routeManager.getContextRoutes('ctx_test');
    expect(afterRotation.filter(r => r.active).length).toBe(0);
  });
});

// ============ RpcPurpose Enum Tests ============

describe('RpcPurpose Enum', () => {
  it('should have correct values', () => {
    expect(RpcPurpose.READ).toBe('READ');
    expect(RpcPurpose.BLOCKHASH).toBe('BLOCKHASH');
    expect(RpcPurpose.SLOT).toBe('SLOT');
    expect(RpcPurpose.VERSION).toBe('VERSION');
    expect(RpcPurpose.HEALTH).toBe('HEALTH');
  });
});

// ============ RouteRotationReason Enum Tests ============

describe('RouteRotationReason Enum', () => {
  it('should have correct values', () => {
    expect(RouteRotationReason.NEW_CONTEXT).toBe('NEW_CONTEXT');
    expect(RouteRotationReason.IDENTITY_ROTATION).toBe('IDENTITY_ROTATION');
    expect(RouteRotationReason.EXPIRED).toBe('EXPIRED');
    expect(RouteRotationReason.MANUAL).toBe('MANUAL');
  });
});


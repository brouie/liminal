/**
 * Liminal - Solana RPC Submission Client
 * 
 * PHASE 4.0: Enables real transaction submission via RPC.
 * 
 * RULES:
 * - ONLY exposes sendRawTransaction + confirmTransaction
 * - Must be blocked by: KillSwitch + InvariantManager + ExecutionPolicyManager
 * - Reuses RpcRouteManager / RpcEndpointPool for endpoint selection
 * - Adds timeouts + structured errors
 */

import { v4 as uuidv4 } from 'uuid';
import {
  RpcEndpointConfig,
  RpcPurpose,
  SubmissionResult,
} from '../../../shared/tx-types';
import { getRpcEndpointPool, RpcEndpointPool } from './RpcEndpointPool';
import { getRpcRouteManager, RpcRouteManager } from './RpcRouteManager';
import { getInvariantManager, InvariantManager } from '../invariants';
import { getExecutionPolicyManager, ExecutionPolicyManager } from '../policy';
import { ContextId } from '../../../shared/types';
import { InvariantId } from '../../../shared/tx-types';

// ============ Errors ============

/**
 * Error thrown for RPC submission failures
 */
export class RpcSubmissionError extends Error {
  public readonly endpointId: string;
  public readonly routeId?: string;
  public readonly latencyMs: number;
  
  constructor(message: string, endpointId: string, latencyMs: number, routeId?: string) {
    super(message);
    this.name = 'RpcSubmissionError';
    this.endpointId = endpointId;
    this.routeId = routeId;
    this.latencyMs = latencyMs;
  }
}

/**
 * Error thrown when submission is blocked by safety checks
 */
export class SubmissionBlockedError extends Error {
  public readonly reasonCode: string;
  
  constructor(message: string, reasonCode: string) {
    super(message);
    this.name = 'SubmissionBlockedError';
    this.reasonCode = reasonCode;
  }
}

// ============ Constants ============

/**
 * Default timeout for RPC calls (30 seconds)
 */
const DEFAULT_RPC_TIMEOUT_MS = 30000;

/**
 * Default confirmation timeout (60 seconds)
 */
const DEFAULT_CONFIRMATION_TIMEOUT_MS = 60000;

// ============ SolanaRpcSubmitClient ============

/**
 * Solana RPC Submission Client
 * 
 * Handles transaction submission to Solana RPC endpoints.
 * Enforces all safety checks before allowing submission.
 */
export class SolanaRpcSubmitClient {
  private useMockMode: boolean;
  
  constructor(useMockMode: boolean = false) {
    this.useMockMode = useMockMode;
  }
  
  /**
   * Get managers dynamically to handle resets properly
   */
  private get pool(): RpcEndpointPool {
    return getRpcEndpointPool();
  }
  
  private get routeManager(): RpcRouteManager {
    return getRpcRouteManager();
  }
  
  private get invariantManager(): InvariantManager {
    return getInvariantManager();
  }
  
  private get policyManager(): ExecutionPolicyManager {
    return getExecutionPolicyManager();
  }
  
  /**
   * Check all safety gates before submission
   */
  private checkSafetyGates(): void {
    // 1. Kill-switch check
    this.invariantManager.enforceKillSwitch('sendRawTransaction');
    
    // 2. Invariant check
    this.invariantManager.enforceInvariant(InvariantId.NO_SUBMISSION_WHEN_POLICY_LOCKED);
    
    // 3. Policy check
    const policyCheck = this.policyManager.checkSubmission();
    if (!policyCheck.allowed) {
      throw new SubmissionBlockedError(
        policyCheck.reason || 'Blocked by execution policy',
        'POLICY_BLOCKED'
      );
    }
  }
  
  /**
   * Make an RPC call with timeout
   */
  private async makeRpcCall<T>(
    method: string,
    params: unknown[],
    endpoint: RpcEndpointConfig,
    timeoutMs: number = DEFAULT_RPC_TIMEOUT_MS
  ): Promise<T> {
    const startTime = Date.now();
    
    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new RpcSubmissionError(`RPC call timed out after ${timeoutMs}ms`, endpoint.id, Date.now() - startTime));
      }, timeoutMs);
    });
    
    // Create fetch promise
    const fetchPromise = fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
    }).then(async (response) => {
      const latencyMs = Date.now() - startTime;
      
      if (!response.ok) {
        this.pool.recordFailure(endpoint.id);
        throw new RpcSubmissionError(
          `HTTP ${response.status}: ${response.statusText}`,
          endpoint.id,
          latencyMs
        );
      }
      
      const json = await response.json();
      
      if (json.error) {
        this.pool.recordFailure(endpoint.id);
        throw new RpcSubmissionError(
          json.error.message || 'RPC error',
          endpoint.id,
          latencyMs
        );
      }
      
      // Record success
      this.pool.recordSuccess(endpoint.id, latencyMs);
      
      return json.result as T;
    });
    
    return Promise.race([fetchPromise, timeoutPromise]);
  }
  
  /**
   * Send raw transaction to Solana RPC
   * 
   * @param signedTx - Base64-encoded signed transaction
   * @param contextId - Context ID
   * @param origin - Origin
   * @returns Transaction signature
   */
  async sendRawTransaction(
    signedTx: string,
    contextId: ContextId,
    origin: string
  ): Promise<{ signature: string; endpointId: string; routeId: string; latencyMs: number }> {
    // Check safety gates
    this.checkSafetyGates();
    
    // Get route for submission
    const routeResult = this.routeManager.getOrCreateRoute(contextId, origin, RpcPurpose.SUBMIT);
    const route = routeResult.route;
    const endpoint = this.pool.getEndpoint(route.endpointId);
    
    if (!endpoint) {
      throw new RpcSubmissionError('Endpoint not found', route.endpointId, 0, route.routeId);
    }
    
    const startTime = Date.now();
    
    // If in mock mode, return mock signature
    if (this.useMockMode) {
      const mockSignature = `mock_${uuidv4().replace(/-/g, '')}`;
      const latencyMs = Date.now() - startTime;
      this.pool.recordSuccess(endpoint.id, latencyMs);
      return {
        signature: mockSignature,
        endpointId: endpoint.id,
        routeId: route.routeId,
        latencyMs,
      };
    }
    
    // Send transaction via RPC
    try {
      const signature = await this.makeRpcCall<string>(
        'sendTransaction',
        [signedTx, { encoding: 'base64', skipPreflight: false }],
        endpoint
      );
      
      const latencyMs = Date.now() - startTime;
      
      return {
        signature,
        endpointId: endpoint.id,
        routeId: route.routeId,
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      if (error instanceof RpcSubmissionError) {
        throw error;
      }
      throw new RpcSubmissionError(
        error instanceof Error ? error.message : 'Unknown error',
        endpoint.id,
        latencyMs,
        route.routeId
      );
    }
  }
  
  /**
   * Confirm transaction
   * 
   * @param signature - Transaction signature
   * @param contextId - Context ID
   * @param origin - Origin
   * @param commitment - Commitment level (default: 'confirmed')
   * @returns Confirmation result with slot
   */
  async confirmTransaction(
    signature: string,
    contextId: ContextId,
    origin: string,
    commitment: 'processed' | 'confirmed' | 'finalized' = 'confirmed'
  ): Promise<{ slot: number; endpointId: string; routeId: string; latencyMs: number }> {
    // Check safety gates (still need to verify policy allows)
    this.checkSafetyGates();
    
    // Get route for confirmation (reuse submission route if possible)
    const routeResult = this.routeManager.getOrCreateRoute(contextId, origin, RpcPurpose.SUBMIT);
    const route = routeResult.route;
    
    // Get endpoint from pool
    const endpoint = this.pool.getEndpoint(route.endpointId);
    
    if (!endpoint) {
      throw new RpcSubmissionError('Endpoint not found', route.endpointId, 0, route.routeId);
    }
    
    const startTime = Date.now();
    
    // If in mock mode, return mock slot
    if (this.useMockMode) {
      const mockSlot = Math.floor(Date.now() / 1000); // Mock slot based on time
      const latencyMs = Date.now() - startTime;
      return {
        slot: mockSlot,
        endpointId: endpoint.id,
        routeId: route.routeId,
        latencyMs,
      };
    }
    
    // Poll for confirmation
    const maxAttempts = Math.ceil(DEFAULT_CONFIRMATION_TIMEOUT_MS / 2000); // Poll every 2 seconds
    let attempt = 0;
    
    while (attempt < maxAttempts) {
      try {
        const result = await this.makeRpcCall<Array<{ slot?: number; err?: unknown } | null>>(
          'getSignatureStatuses',
          [[signature], { searchTransactionHistory: true }],
          endpoint,
          5000 // Shorter timeout for polling
        );
        
        const status = result?.[0];
        if (status && status.slot && !status.err) {
          const latencyMs = Date.now() - startTime;
          return {
            slot: status.slot,
            endpointId: endpoint.id,
            routeId: route.routeId,
            latencyMs,
          };
        }
      } catch (error) {
        // Continue polling on error (might be transient)
        if (attempt === maxAttempts - 1) {
          const latencyMs = Date.now() - startTime;
          throw new RpcSubmissionError(
            `Confirmation timeout: ${error instanceof Error ? error.message : 'Unknown error'}`,
            endpoint.id,
            latencyMs,
            route.routeId
          );
        }
      }
      
      attempt++;
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds between polls
    }
    
    const latencyMs = Date.now() - startTime;
    throw new RpcSubmissionError(
      'Confirmation timeout: transaction not confirmed within timeout period',
      endpoint.id,
      latencyMs,
      route.routeId
    );
  }
  
  /**
   * Send and confirm transaction in one call
   * 
   * @param signedTx - Base64-encoded signed transaction
   * @param contextId - Context ID
   * @param origin - Origin
   * @param commitment - Commitment level (default: 'confirmed')
   * @returns Submission result with signature and slot
   */
  async sendAndConfirmRawTransaction(
    signedTx: string,
    contextId: ContextId,
    origin: string,
    commitment: 'processed' | 'confirmed' | 'finalized' = 'confirmed'
  ): Promise<SubmissionResult> {
    const submissionId = `sub_${uuidv4()}`;
    const timestamp = Date.now();
    
    try {
      // Send transaction
      const sendResult = await this.sendRawTransaction(signedTx, contextId, origin);
      
      // Confirm transaction
      const confirmResult = await this.confirmTransaction(sendResult.signature, contextId, origin, commitment);
      
      const totalLatencyMs = sendResult.latencyMs + confirmResult.latencyMs;
      
      return {
        submissionId,
        success: true,
        signature: sendResult.signature,
        slot: confirmResult.slot,
        rpcEndpointId: sendResult.endpointId,
        rpcRouteId: sendResult.routeId,
        timestamp,
        latencyMs: totalLatencyMs,
      };
    } catch (error) {
      const latencyMs = error instanceof RpcSubmissionError ? error.latencyMs : 0;
      const endpointId = error instanceof RpcSubmissionError ? error.endpointId : 'unknown';
      const routeId = error instanceof RpcSubmissionError ? error.routeId : undefined;
      
      return {
        submissionId,
        success: false,
        rpcEndpointId: endpointId,
        rpcRouteId: routeId,
        timestamp,
        error: error instanceof Error ? error.message : 'Unknown error',
        latencyMs,
      };
    }
  }
}

// Singleton instance
let rpcSubmitClient: SolanaRpcSubmitClient | null = null;

/**
 * Get the SolanaRpcSubmitClient singleton
 */
export function getSolanaRpcSubmitClient(useMockMode: boolean = true): SolanaRpcSubmitClient {
  if (!rpcSubmitClient) {
    rpcSubmitClient = new SolanaRpcSubmitClient(useMockMode);
  }
  return rpcSubmitClient;
}

/**
 * Reset the SolanaRpcSubmitClient singleton (for testing)
 */
export function resetSolanaRpcSubmitClient(): void {
  rpcSubmitClient = null;
}

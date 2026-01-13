/**
 * Liminal - Read-Only Solana RPC Client
 * 
 * A Solana RPC client wrapper that ONLY exposes read-only methods.
 * 
 * PHASE 3.4 RULES:
 * - ONLY read-only methods: getHealth, getLatestBlockhash, getSlot, getVersion
 * - ANY method resembling submission THROWS immediately
 * - NO sendTransaction, sendRawTransaction, or any broadcast
 * - Phase 3.2 gate remains effective
 */

import {
  RpcEndpointConfig,
  RpcReadOnlyResponse,
  RpcHealthResult,
  BlockhashResponse,
  SlotResponse,
  VersionResponse,
} from '../../../shared/tx-types';
import { getRpcEndpointPool, RpcEndpointPool } from './RpcEndpointPool';
import { SubmissionBlockedError } from '../tx/TxSubmissionGate';
import { SubmissionBlockReason } from '../../../shared/tx-types';

// ============ Blocked Methods ============

/**
 * Methods that are BLOCKED and will THROW if called
 */
const BLOCKED_METHODS = [
  'sendTransaction',
  'sendRawTransaction',
  'sendAndConfirmTransaction',
  'sendAndConfirmRawTransaction',
  'simulateTransaction', // We'll add our own safe simulation later
  'requestAirdrop', // No airdrops
] as const;

// ============ RPC Error ============

/**
 * Error thrown for RPC failures
 */
export class RpcError extends Error {
  public readonly endpointId: string;
  public readonly latencyMs: number;
  
  constructor(message: string, endpointId: string, latencyMs: number) {
    super(message);
    this.name = 'RpcError';
    this.endpointId = endpointId;
    this.latencyMs = latencyMs;
  }
}

// ============ ReadOnlySolanaRpcClient ============

/**
 * Read-Only Solana RPC Client
 * 
 * This client ONLY allows read-only RPC calls:
 * - getHealth()
 * - getLatestBlockhash()
 * - getSlot()
 * - getVersion()
 * 
 * ALL transaction submission methods are BLOCKED.
 * Attempting to call them THROWS SubmissionBlockedError.
 */
export class ReadOnlySolanaRpcClient {
  private useMockMode: boolean;
  
  constructor(useMockMode: boolean = false) {
    this.useMockMode = useMockMode;
  }
  
  /**
   * Get the pool dynamically to handle resets properly
   */
  private get pool(): RpcEndpointPool {
    return getRpcEndpointPool();
  }
  
  /**
   * Make a read-only RPC call
   */
  private async makeRpcCall<T>(
    method: string,
    params: unknown[] = [],
    endpoint?: RpcEndpointConfig
  ): Promise<RpcReadOnlyResponse<T>> {
    // Select endpoint if not provided
    const selectedEndpoint = endpoint || this.pool.selectBestEndpoint();
    if (!selectedEndpoint) {
      return {
        success: false,
        endpointId: 'none',
        latencyMs: 0,
        error: 'No RPC endpoints available',
        timestamp: Date.now(),
      };
    }
    
    const startTime = Date.now();
    
    // If in mock mode, return mock data
    if (this.useMockMode) {
      return this.getMockResponse<T>(method, selectedEndpoint.id, startTime);
    }
    
    try {
      const response = await fetch(selectedEndpoint.url, {
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
      });
      
      const latencyMs = Date.now() - startTime;
      
      if (!response.ok) {
        this.pool.recordFailure(selectedEndpoint.id);
        return {
          success: false,
          endpointId: selectedEndpoint.id,
          latencyMs,
          error: `HTTP ${response.status}: ${response.statusText}`,
          timestamp: Date.now(),
        };
      }
      
      const json = await response.json();
      
      if (json.error) {
        this.pool.recordFailure(selectedEndpoint.id);
        return {
          success: false,
          endpointId: selectedEndpoint.id,
          latencyMs,
          error: json.error.message || 'RPC error',
          timestamp: Date.now(),
        };
      }
      
      // Record success
      this.pool.recordSuccess(selectedEndpoint.id, latencyMs);
      
      return {
        success: true,
        data: json.result as T,
        endpointId: selectedEndpoint.id,
        latencyMs,
        timestamp: Date.now(),
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      this.pool.recordFailure(selectedEndpoint.id);
      
      return {
        success: false,
        endpointId: selectedEndpoint.id,
        latencyMs,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }
  }
  
  /**
   * Get mock response for testing
   */
  private getMockResponse<T>(
    method: string,
    endpointId: string,
    startTime: number
  ): RpcReadOnlyResponse<T> {
    const latencyMs = Date.now() - startTime + Math.random() * 50;
    
    let data: unknown;
    
    switch (method) {
      case 'getHealth':
        data = 'ok';
        break;
      case 'getLatestBlockhash':
        data = {
          value: {
            blockhash: 'MockBlockhash' + Date.now().toString(36),
            lastValidBlockHeight: 200000000 + Math.floor(Math.random() * 1000),
          },
        };
        break;
      case 'getSlot':
        data = 200000000 + Math.floor(Math.random() * 1000);
        break;
      case 'getVersion':
        data = {
          'solana-core': '1.18.0',
          'feature-set': 123456789,
        };
        break;
      default:
        data = null;
    }
    
    // Record success in mock mode too
    this.pool.recordSuccess(endpointId, latencyMs);
    
    return {
      success: true,
      data: data as T,
      endpointId,
      latencyMs,
      timestamp: Date.now(),
    };
  }
  
  // ============ Read-Only Methods ============
  
  /**
   * Check health of an RPC endpoint
   */
  async getHealth(endpoint?: RpcEndpointConfig): Promise<RpcHealthResult> {
    const response = await this.makeRpcCall<string>('getHealth', [], endpoint);
    
    return {
      healthy: response.success && response.data === 'ok',
      latencyMs: response.latencyMs,
      error: response.error,
      timestamp: response.timestamp,
    };
  }
  
  /**
   * Get the latest blockhash
   * 
   * This is READ-ONLY - does NOT submit any transaction.
   */
  async getLatestBlockhash(
    endpoint?: RpcEndpointConfig
  ): Promise<RpcReadOnlyResponse<BlockhashResponse>> {
    const response = await this.makeRpcCall<{ value: { blockhash: string; lastValidBlockHeight: number } }>(
      'getLatestBlockhash',
      [{ commitment: 'finalized' }],
      endpoint
    );
    
    if (response.success && response.data) {
      return {
        success: true,
        data: {
          blockhash: response.data.value.blockhash,
          lastValidBlockHeight: response.data.value.lastValidBlockHeight,
        },
        endpointId: response.endpointId,
        latencyMs: response.latencyMs,
        timestamp: response.timestamp,
      };
    }
    
    return {
      success: false,
      endpointId: response.endpointId,
      latencyMs: response.latencyMs,
      error: response.error,
      timestamp: response.timestamp,
    };
  }
  
  /**
   * Get the current slot
   * 
   * This is READ-ONLY - does NOT submit any transaction.
   */
  async getSlot(endpoint?: RpcEndpointConfig): Promise<RpcReadOnlyResponse<SlotResponse>> {
    const response = await this.makeRpcCall<number>('getSlot', [], endpoint);
    
    if (response.success && response.data !== undefined) {
      // Update slot in pool metrics
      this.pool.recordSuccess(response.endpointId, response.latencyMs, response.data);
      
      return {
        success: true,
        data: { slot: response.data },
        endpointId: response.endpointId,
        latencyMs: response.latencyMs,
        timestamp: response.timestamp,
      };
    }
    
    return {
      success: false,
      endpointId: response.endpointId,
      latencyMs: response.latencyMs,
      error: response.error,
      timestamp: response.timestamp,
    };
  }
  
  /**
   * Get Solana version
   * 
   * This is READ-ONLY - does NOT submit any transaction.
   */
  async getVersion(endpoint?: RpcEndpointConfig): Promise<RpcReadOnlyResponse<VersionResponse>> {
    const response = await this.makeRpcCall<{ 'solana-core': string; 'feature-set'?: number }>(
      'getVersion',
      [],
      endpoint
    );
    
    if (response.success && response.data) {
      return {
        success: true,
        data: {
          solanaCore: response.data['solana-core'],
          featureSet: response.data['feature-set'],
        },
        endpointId: response.endpointId,
        latencyMs: response.latencyMs,
        timestamp: response.timestamp,
      };
    }
    
    return {
      success: false,
      endpointId: response.endpointId,
      latencyMs: response.latencyMs,
      error: response.error,
      timestamp: response.timestamp,
    };
  }
  
  // ============ Blocked Methods (THROW) ============
  
  /**
   * BLOCKED: sendTransaction
   * @throws SubmissionBlockedError
   */
  sendTransaction(_transaction: unknown): never {
    throw new SubmissionBlockedError(
      'sendTransaction',
      SubmissionBlockReason.GATE_BLOCKED
    );
  }
  
  /**
   * BLOCKED: sendRawTransaction
   * @throws SubmissionBlockedError
   */
  sendRawTransaction(_rawTransaction: unknown): never {
    throw new SubmissionBlockedError(
      'sendRawTransaction',
      SubmissionBlockReason.GATE_BLOCKED
    );
  }
  
  /**
   * BLOCKED: sendAndConfirmTransaction
   * @throws SubmissionBlockedError
   */
  sendAndConfirmTransaction(_transaction: unknown): never {
    throw new SubmissionBlockedError(
      'sendAndConfirmTransaction',
      SubmissionBlockReason.GATE_BLOCKED
    );
  }
  
  /**
   * BLOCKED: sendAndConfirmRawTransaction
   * @throws SubmissionBlockedError
   */
  sendAndConfirmRawTransaction(_rawTransaction: unknown): never {
    throw new SubmissionBlockedError(
      'sendAndConfirmRawTransaction',
      SubmissionBlockReason.GATE_BLOCKED
    );
  }
  
  /**
   * BLOCKED: simulateTransaction (unsafe version)
   * @throws SubmissionBlockedError
   */
  simulateTransaction(_transaction: unknown): never {
    throw new SubmissionBlockedError(
      'simulateTransaction',
      SubmissionBlockReason.GATE_BLOCKED
    );
  }
  
  /**
   * BLOCKED: requestAirdrop
   * @throws SubmissionBlockedError
   */
  requestAirdrop(_address: unknown, _amount: unknown): never {
    throw new SubmissionBlockedError(
      'requestAirdrop',
      SubmissionBlockReason.GATE_BLOCKED
    );
  }
  
  // ============ Utility Methods ============
  
  /**
   * Set mock mode (for testing)
   */
  setMockMode(useMock: boolean): void {
    this.useMockMode = useMock;
  }
  
  /**
   * Check if in mock mode
   */
  isInMockMode(): boolean {
    return this.useMockMode;
  }
  
  /**
   * Get the endpoint pool
   */
  getPool(): RpcEndpointPool {
    return this.pool;
  }
  
  /**
   * Check all endpoints health
   */
  async healthCheckAll(): Promise<Map<string, RpcHealthResult>> {
    const results = new Map<string, RpcHealthResult>();
    const endpoints = this.pool.getEnabledEndpoints();
    
    for (const endpoint of endpoints) {
      const health = await this.getHealth(endpoint);
      results.set(endpoint.id, health);
    }
    
    return results;
  }
  
  /**
   * Get list of blocked methods
   */
  getBlockedMethods(): readonly string[] {
    return BLOCKED_METHODS;
  }
}

// Singleton instance
let readOnlyRpcClient: ReadOnlySolanaRpcClient | null = null;

/**
 * Get the ReadOnlySolanaRpcClient singleton
 */
export function getReadOnlyRpcClient(useMockMode: boolean = true): ReadOnlySolanaRpcClient {
  if (!readOnlyRpcClient) {
    readOnlyRpcClient = new ReadOnlySolanaRpcClient(useMockMode);
  }
  return readOnlyRpcClient;
}

/**
 * Reset the ReadOnlySolanaRpcClient singleton (for testing)
 */
export function resetReadOnlyRpcClient(): void {
  readOnlyRpcClient = null;
}


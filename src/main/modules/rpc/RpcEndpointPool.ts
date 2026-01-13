/**
 * Liminal - RPC Endpoint Pool
 * 
 * Manages a pool of Solana RPC endpoints with metrics and scoring.
 * 
 * PHASE 3.4 RULES:
 * - READ-ONLY operations only
 * - NO transaction submission
 * - Deterministic scoring function
 * - Metrics tracking per endpoint
 */

import {
  RpcEndpointConfig,
  RpcEndpointMetrics,
  RpcHealthResult,
} from '../../../shared/tx-types';

// ============ Default Endpoints ============

/**
 * Default RPC endpoints (public, free tier)
 */
const DEFAULT_ENDPOINTS: RpcEndpointConfig[] = [
  {
    id: 'mainnet-public-1',
    url: 'https://api.mainnet-beta.solana.com',
    name: 'Solana Mainnet (Public)',
    supportsWs: true,
    isPrivate: false,
    weight: 1,
    enabled: true,
  },
  {
    id: 'devnet-public-1',
    url: 'https://api.devnet.solana.com',
    name: 'Solana Devnet (Public)',
    supportsWs: true,
    isPrivate: false,
    weight: 1,
    enabled: true,
  },
];

// ============ Scoring Constants ============

const SCORE_WEIGHTS = {
  successRate: 0.4,      // 40% weight
  latency: 0.3,          // 30% weight
  freshness: 0.2,        // 20% weight
  configWeight: 0.1,     // 10% weight
};

const LATENCY_THRESHOLDS = {
  excellent: 100,   // < 100ms = full score
  good: 300,        // < 300ms = 75% score
  acceptable: 1000, // < 1000ms = 50% score
  poor: 3000,       // < 3000ms = 25% score
};

const FRESHNESS_THRESHOLD_MS = 60000; // 1 minute

// ============ RpcEndpointPool ============

/**
 * RPC Endpoint Pool
 * 
 * Manages multiple RPC endpoints with:
 * - Metrics tracking (latency, success rate, freshness)
 * - Deterministic scoring
 * - Endpoint selection based on score
 * 
 * READ-ONLY - does NOT perform any transaction submission.
 */
export class RpcEndpointPool {
  /** Configured endpoints */
  private endpoints: Map<string, RpcEndpointConfig> = new Map();
  
  /** Metrics per endpoint */
  private metrics: Map<string, RpcEndpointMetrics> = new Map();
  
  constructor(customEndpoints?: RpcEndpointConfig[]) {
    // Load default endpoints
    for (const endpoint of DEFAULT_ENDPOINTS) {
      this.addEndpoint(endpoint);
    }
    
    // Add custom endpoints
    if (customEndpoints) {
      for (const endpoint of customEndpoints) {
        this.addEndpoint(endpoint);
      }
    }
  }
  
  /**
   * Add an endpoint to the pool
   * 
   * Note: We clone the config to avoid mutating the original
   */
  addEndpoint(config: RpcEndpointConfig): void {
    // Clone the config to avoid mutating the original (especially DEFAULT_ENDPOINTS)
    const clonedConfig = { ...config };
    this.endpoints.set(clonedConfig.id, clonedConfig);
    
    // Initialize metrics
    if (!this.metrics.has(clonedConfig.id)) {
      this.metrics.set(clonedConfig.id, {
        endpointId: clonedConfig.id,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        avgLatencyMs: 0,
        score: 50, // Default neutral score
      });
    }
  }
  
  /**
   * Remove an endpoint from the pool
   */
  removeEndpoint(endpointId: string): boolean {
    const deleted = this.endpoints.delete(endpointId);
    this.metrics.delete(endpointId);
    return deleted;
  }
  
  /**
   * Get endpoint configuration
   */
  getEndpoint(endpointId: string): RpcEndpointConfig | undefined {
    return this.endpoints.get(endpointId);
  }
  
  /**
   * Get all enabled endpoints
   */
  getEnabledEndpoints(): RpcEndpointConfig[] {
    return Array.from(this.endpoints.values()).filter(e => e.enabled);
  }
  
  /**
   * Get all endpoints (including disabled)
   */
  getAllEndpoints(): RpcEndpointConfig[] {
    return Array.from(this.endpoints.values());
  }
  
  /**
   * Get metrics for an endpoint
   */
  getMetrics(endpointId: string): RpcEndpointMetrics | undefined {
    return this.metrics.get(endpointId);
  }
  
  /**
   * Get all metrics
   */
  getAllMetrics(): RpcEndpointMetrics[] {
    return Array.from(this.metrics.values());
  }
  
  /**
   * Record a successful request
   */
  recordSuccess(endpointId: string, latencyMs: number, slot?: number): void {
    const metrics = this.metrics.get(endpointId);
    if (!metrics) return;
    
    metrics.totalRequests++;
    metrics.successfulRequests++;
    metrics.lastSuccessAt = Date.now();
    
    // Update average latency (exponential moving average)
    if (metrics.totalRequests === 1) {
      metrics.avgLatencyMs = latencyMs;
    } else {
      const alpha = 0.3; // EMA smoothing factor
      metrics.avgLatencyMs = alpha * latencyMs + (1 - alpha) * metrics.avgLatencyMs;
    }
    
    // Update slot if provided
    if (slot !== undefined) {
      metrics.lastKnownSlot = slot;
    }
    
    // Recalculate score
    this.recalculateScore(endpointId);
  }
  
  /**
   * Record a failed request
   */
  recordFailure(endpointId: string): void {
    const metrics = this.metrics.get(endpointId);
    if (!metrics) return;
    
    metrics.totalRequests++;
    metrics.failedRequests++;
    metrics.lastFailureAt = Date.now();
    
    // Recalculate score
    this.recalculateScore(endpointId);
  }
  
  /**
   * Recalculate score for an endpoint
   * 
   * Score is deterministic based on:
   * - Success rate (40%)
   * - Latency (30%)
   * - Freshness (20%)
   * - Config weight (10%)
   */
  private recalculateScore(endpointId: string): void {
    const metrics = this.metrics.get(endpointId);
    const config = this.endpoints.get(endpointId);
    if (!metrics || !config) return;
    
    // Success rate score (0-100)
    let successScore = 0;
    if (metrics.totalRequests > 0) {
      successScore = (metrics.successfulRequests / metrics.totalRequests) * 100;
    } else {
      successScore = 50; // Neutral for no data
    }
    
    // Latency score (0-100)
    let latencyScore = 0;
    if (metrics.avgLatencyMs < LATENCY_THRESHOLDS.excellent) {
      latencyScore = 100;
    } else if (metrics.avgLatencyMs < LATENCY_THRESHOLDS.good) {
      latencyScore = 75;
    } else if (metrics.avgLatencyMs < LATENCY_THRESHOLDS.acceptable) {
      latencyScore = 50;
    } else if (metrics.avgLatencyMs < LATENCY_THRESHOLDS.poor) {
      latencyScore = 25;
    } else {
      latencyScore = 10;
    }
    
    // Freshness score (0-100)
    let freshnessScore = 0;
    if (metrics.lastSuccessAt) {
      const age = Date.now() - metrics.lastSuccessAt;
      if (age < FRESHNESS_THRESHOLD_MS) {
        freshnessScore = 100;
      } else if (age < FRESHNESS_THRESHOLD_MS * 5) {
        freshnessScore = 50;
      } else {
        freshnessScore = 10;
      }
    } else {
      freshnessScore = 50; // Neutral for no data
    }
    
    // Config weight score (0-100)
    const weightScore = Math.min((config.weight || 1) * 50, 100);
    
    // Calculate weighted score
    metrics.score = Math.round(
      successScore * SCORE_WEIGHTS.successRate +
      latencyScore * SCORE_WEIGHTS.latency +
      freshnessScore * SCORE_WEIGHTS.freshness +
      weightScore * SCORE_WEIGHTS.configWeight
    );
  }
  
  /**
   * Select the best endpoint based on score
   * 
   * @returns Best endpoint config or undefined if none available
   */
  selectBestEndpoint(): RpcEndpointConfig | undefined {
    const enabledEndpoints = this.getEnabledEndpoints();
    if (enabledEndpoints.length === 0) return undefined;
    
    // Sort by score (descending)
    const sorted = enabledEndpoints
      .map(e => ({
        config: e,
        score: this.metrics.get(e.id)?.score || 0,
      }))
      .sort((a, b) => b.score - a.score);
    
    return sorted[0]?.config;
  }
  
  /**
   * Get endpoints ranked by score
   */
  getRankedEndpoints(): Array<{ config: RpcEndpointConfig; metrics: RpcEndpointMetrics }> {
    return this.getEnabledEndpoints()
      .map(config => ({
        config,
        metrics: this.metrics.get(config.id)!,
      }))
      .filter(e => e.metrics)
      .sort((a, b) => b.metrics.score - a.metrics.score);
  }
  
  /**
   * Enable/disable an endpoint
   */
  setEndpointEnabled(endpointId: string, enabled: boolean): boolean {
    const config = this.endpoints.get(endpointId);
    if (!config) return false;
    
    config.enabled = enabled;
    return true;
  }
  
  /**
   * Reset metrics for an endpoint
   */
  resetMetrics(endpointId: string): void {
    const metrics = this.metrics.get(endpointId);
    if (metrics) {
      metrics.totalRequests = 0;
      metrics.successfulRequests = 0;
      metrics.failedRequests = 0;
      metrics.avgLatencyMs = 0;
      metrics.lastSuccessAt = undefined;
      metrics.lastFailureAt = undefined;
      metrics.lastKnownSlot = undefined;
      metrics.score = 50;
    }
  }
  
  /**
   * Reset all metrics
   */
  resetAllMetrics(): void {
    for (const endpointId of this.metrics.keys()) {
      this.resetMetrics(endpointId);
    }
  }
  
  /**
   * Clear the pool
   */
  clear(): void {
    this.endpoints.clear();
    this.metrics.clear();
  }
}

// Singleton instance
let rpcEndpointPool: RpcEndpointPool | null = null;

/**
 * Get the RpcEndpointPool singleton
 */
export function getRpcEndpointPool(): RpcEndpointPool {
  if (!rpcEndpointPool) {
    rpcEndpointPool = new RpcEndpointPool();
  }
  return rpcEndpointPool;
}

/**
 * Reset the RpcEndpointPool singleton (for testing)
 */
export function resetRpcEndpointPool(): void {
  if (rpcEndpointPool) {
    rpcEndpointPool.clear();
  }
  rpcEndpointPool = null;
}


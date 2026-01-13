/**
 * Liminal - RPC Route Manager
 * 
 * Manages RPC routing for metadata privacy.
 * 
 * PHASE 3.5 RULES:
 * - Different purposes may use different endpoints
 * - Routes rotate on context/identity change
 * - Deterministic routing behavior
 * - NO transaction submission
 */

import { randomBytes, createHash } from 'crypto';
import { ContextId } from '../../../shared/types';
import {
  RpcRouteContext,
  RpcPurpose,
  RouteSelectionResult,
  RouteRotationReason,
  RpcEndpointConfig,
} from '../../../shared/tx-types';
import { getRpcEndpointPool, RpcEndpointPool } from './RpcEndpointPool';

// ============ Route ID Generation ============

/**
 * Generate unique route ID
 */
function generateRouteId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(6).toString('hex');
  return `route_${timestamp}_${random}`;
}

/**
 * Generate deterministic route key for caching
 */
function getRouteKey(contextId: ContextId, origin: string, purpose: RpcPurpose): string {
  return `${contextId}:${origin}:${purpose}`;
}

// ============ RpcRouteManager ============

/**
 * RPC Route Manager
 * 
 * Manages purpose-based endpoint selection for metadata privacy:
 * - Different purposes (blockhash, slot, version) can use different endpoints
 * - Routes are scoped to context + origin + purpose
 * - Routes rotate on identity change
 * 
 * This ONLY handles routing - NO transaction submission.
 */
export class RpcRouteManager {
  /** Active routes by route key */
  private routes: Map<string, RpcRouteContext> = new Map();
  
  /** Route ID to route key mapping */
  private routeIdToKey: Map<string, string> = new Map();
  
  /** Endpoint assignments per context for purpose separation */
  private contextEndpointAssignments: Map<ContextId, Map<RpcPurpose, string>> = new Map();
  
  /** Get the endpoint pool dynamically */
  private get pool(): RpcEndpointPool {
    return getRpcEndpointPool();
  }
  
  /**
   * Get or create a route for the given parameters
   * 
   * @param contextId - Context ID
   * @param origin - Origin
   * @param purpose - RPC purpose
   * @returns Route selection result
   */
  getOrCreateRoute(
    contextId: ContextId,
    origin: string,
    purpose: RpcPurpose
  ): RouteSelectionResult {
    const routeKey = getRouteKey(contextId, origin, purpose);
    
    // Check for existing active route
    const existingRoute = this.routes.get(routeKey);
    if (existingRoute && existingRoute.active) {
      existingRoute.lastUsedAt = Date.now();
      existingRoute.useCount++;
      
      return {
        route: existingRoute,
        isNew: false,
        endpointReused: this.isEndpointReused(contextId, existingRoute.endpointId, purpose),
      };
    }
    
    // Create new route with endpoint selection
    const { endpointId, reused } = this.selectEndpointForPurpose(contextId, purpose);
    
    const route: RpcRouteContext = {
      routeId: generateRouteId(),
      contextId,
      origin,
      purpose,
      endpointId,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      useCount: 1,
      active: true,
    };
    
    // Store route
    this.routes.set(routeKey, route);
    this.routeIdToKey.set(route.routeId, routeKey);
    
    // Record endpoint assignment
    this.recordEndpointAssignment(contextId, purpose, endpointId);
    
    return {
      route,
      isNew: true,
      endpointReused: reused,
    };
  }
  
  /**
   * Select an endpoint for a purpose, trying to use different endpoints
   * for different purposes to improve privacy
   */
  private selectEndpointForPurpose(
    contextId: ContextId,
    purpose: RpcPurpose
  ): { endpointId: string; reused: boolean } {
    const enabledEndpoints = this.pool.getEnabledEndpoints();
    
    if (enabledEndpoints.length === 0) {
      // No endpoints available
      return { endpointId: 'none', reused: false };
    }
    
    // Get already assigned endpoints for this context
    const contextAssignments = this.contextEndpointAssignments.get(contextId);
    const usedEndpoints = contextAssignments 
      ? new Set(contextAssignments.values())
      : new Set<string>();
    
    // Try to find an endpoint NOT already used for another purpose
    const availableEndpoints = enabledEndpoints.filter(
      e => !usedEndpoints.has(e.id)
    );
    
    if (availableEndpoints.length > 0) {
      // Use deterministic selection from available endpoints
      const selected = this.selectBestFromList(availableEndpoints);
      return { endpointId: selected.id, reused: false };
    }
    
    // All endpoints already used for other purposes
    // Fall back to best available (endpoint reuse)
    const selected = this.selectBestFromList(enabledEndpoints);
    return { endpointId: selected.id, reused: true };
  }
  
  /**
   * Select best endpoint from a list based on pool metrics
   */
  private selectBestFromList(endpoints: RpcEndpointConfig[]): RpcEndpointConfig {
    if (endpoints.length === 0) {
      throw new Error('No endpoints to select from');
    }
    
    if (endpoints.length === 1) {
      return endpoints[0];
    }
    
    // Sort by score (descending)
    const sorted = endpoints
      .map(e => ({
        config: e,
        score: this.pool.getMetrics(e.id)?.score || 50,
      }))
      .sort((a, b) => b.score - a.score);
    
    return sorted[0].config;
  }
  
  /**
   * Record endpoint assignment for a context + purpose
   */
  private recordEndpointAssignment(
    contextId: ContextId,
    purpose: RpcPurpose,
    endpointId: string
  ): void {
    let contextMap = this.contextEndpointAssignments.get(contextId);
    if (!contextMap) {
      contextMap = new Map();
      this.contextEndpointAssignments.set(contextId, contextMap);
    }
    contextMap.set(purpose, endpointId);
  }
  
  /**
   * Check if an endpoint is reused from another purpose in the same context
   */
  private isEndpointReused(
    contextId: ContextId,
    endpointId: string,
    currentPurpose: RpcPurpose
  ): boolean {
    const contextMap = this.contextEndpointAssignments.get(contextId);
    if (!contextMap) return false;
    
    for (const [purpose, assignedId] of contextMap) {
      if (purpose !== currentPurpose && assignedId === endpointId) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Get route by ID
   */
  getRoute(routeId: string): RpcRouteContext | undefined {
    const routeKey = this.routeIdToKey.get(routeId);
    if (!routeKey) return undefined;
    return this.routes.get(routeKey);
  }
  
  /**
   * Get all routes for a context
   */
  getContextRoutes(contextId: ContextId): RpcRouteContext[] {
    const routes: RpcRouteContext[] = [];
    for (const route of this.routes.values()) {
      if (route.contextId === contextId) {
        routes.push(route);
      }
    }
    return routes;
  }
  
  /**
   * Rotate routes for a context
   * 
   * Called on identity rotation to ensure new endpoints are used.
   * 
   * @param contextId - Context ID
   * @param reason - Rotation reason
   * @returns Number of routes rotated
   */
  rotateContextRoutes(contextId: ContextId, reason: RouteRotationReason): number {
    let count = 0;
    
    // Deactivate all routes for this context
    for (const [routeKey, route] of this.routes) {
      if (route.contextId === contextId && route.active) {
        route.active = false;
        count++;
      }
    }
    
    // Clear endpoint assignments for this context
    this.contextEndpointAssignments.delete(contextId);
    
    return count;
  }
  
  /**
   * Clear all routes for a context
   */
  clearContext(contextId: ContextId): number {
    let count = 0;
    
    for (const [routeKey, route] of this.routes) {
      if (route.contextId === contextId) {
        this.routes.delete(routeKey);
        this.routeIdToKey.delete(route.routeId);
        count++;
      }
    }
    
    this.contextEndpointAssignments.delete(contextId);
    
    return count;
  }
  
  /**
   * Clear all routes
   */
  clear(): void {
    this.routes.clear();
    this.routeIdToKey.clear();
    this.contextEndpointAssignments.clear();
  }
  
  /**
   * Get endpoint assignment summary for a context
   */
  getContextEndpointSummary(contextId: ContextId): Map<RpcPurpose, string> {
    return this.contextEndpointAssignments.get(contextId) || new Map();
  }
  
  /**
   * Check if purposes are using different endpoints in a context
   */
  arePurposesSeparated(contextId: ContextId): boolean {
    const assignments = this.contextEndpointAssignments.get(contextId);
    if (!assignments || assignments.size <= 1) {
      return true; // Only one purpose, so "separated" by default
    }
    
    const usedEndpoints = new Set(assignments.values());
    return usedEndpoints.size === assignments.size;
  }
  
  /**
   * Get all active routes
   */
  getAllActiveRoutes(): RpcRouteContext[] {
    return Array.from(this.routes.values()).filter(r => r.active);
  }
}

// Singleton instance
let rpcRouteManager: RpcRouteManager | null = null;

/**
 * Get the RpcRouteManager singleton
 */
export function getRpcRouteManager(): RpcRouteManager {
  if (!rpcRouteManager) {
    rpcRouteManager = new RpcRouteManager();
  }
  return rpcRouteManager;
}

/**
 * Reset the RpcRouteManager singleton (for testing)
 */
export function resetRpcRouteManager(): void {
  if (rpcRouteManager) {
    rpcRouteManager.clear();
  }
  rpcRouteManager = null;
}


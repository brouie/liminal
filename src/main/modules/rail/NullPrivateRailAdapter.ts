/**
 * Liminal - Null Private Rail Adapter
 * 
 * A stub implementation of IPrivateRailAdapter that always
 * returns "not available" for all operations.
 * 
 * PHASE 3.6 RULES:
 * - STUB ONLY - No execution
 * - NO network calls
 * - NO cryptographic operations
 * - NO submission
 * - Always returns "not supported"
 * - Deterministic placeholder values
 * 
 * PHASE 3.7 ADDITIONS:
 * - Also checks ExecutionPolicy for private rail permission
 * - Policy adds another layer of protection
 */

import {
  IPrivateRailAdapter,
  PrivateRailCapabilities,
  PrivateRailStatus,
  PrivateRailPrepContext,
  PrivateRailPrepResult,
  PrivateRailEstimateResult,
  PrivateRailValidationResult,
  SimulatedTxPayload,
} from '../../../shared/tx-types';
import { getExecutionPolicyManager } from '../policy';

/**
 * Null Private Rail Adapter
 * 
 * This is a stub implementation that:
 * - Always reports "not available"
 * - Returns deterministic placeholder values
 * - NEVER executes anything
 * - NEVER makes network calls
 * - NEVER performs cryptographic operations
 * 
 * PHASE 3.7: Also checks ExecutionPolicy for additional protection.
 * 
 * Purpose: Define the adapter contract so future private
 * rail implementations can plug in without refactoring.
 */
export class NullPrivateRailAdapter implements IPrivateRailAdapter {
  readonly name = 'NullPrivateRailAdapter';
  readonly version = '0.0.1'; // Updated for Phase 3.7
  
  /**
   * Get capabilities - all disabled
   * 
   * Returns a capabilities object with all features disabled.
   * This is the "null" implementation - no private features.
   */
  getCapabilities(): PrivateRailCapabilities {
    return {
      supportsTransfers: false,
      supportsProgramCalls: false,
      hidesSender: false,
      hidesAmount: false,
      hidesRecipient: false,
      requiresRelayer: false,
      requiresZkProof: false,
      maxTxSize: undefined,
      minAmount: undefined,
      maxAmount: undefined,
      estimatedLatencyMs: undefined,
      feeMultiplier: undefined,
    };
  }
  
  /**
   * Get status - always NOT_AVAILABLE
   * 
   * PHASE 3.7: Also checks execution policy for additional reason
   */
  getStatus(): PrivateRailStatus {
    // Check policy first (Phase 3.7)
    const policyCheck = getExecutionPolicyManager().checkPrivateRail();
    if (!policyCheck.allowed) {
      return PrivateRailStatus.DISABLED_BY_POLICY;
    }
    
    // NullAdapter always returns NOT_AVAILABLE
    return PrivateRailStatus.NOT_AVAILABLE;
  }
  
  /**
   * Check availability - always false
   * 
   * PHASE 3.7: Also checks execution policy
   */
  isAvailable(): boolean {
    // Check policy first (Phase 3.7)
    const policyCheck = getExecutionPolicyManager().checkPrivateRail();
    if (!policyCheck.allowed) {
      return false;
    }
    
    // NullAdapter is never available
    return false;
  }
  
  /**
   * Prepare - always returns not available
   * 
   * PHASE 3.6: NO actual preparation occurs
   * PHASE 3.7: Also checks execution policy
   */
  async prepare(
    _payload: SimulatedTxPayload,
    _context: PrivateRailPrepContext
  ): Promise<PrivateRailPrepResult> {
    // Check policy first (Phase 3.7)
    const policyCheck = getExecutionPolicyManager().checkPrivateRail();
    const reason = policyCheck.allowed
      ? 'Private rail not available: NullPrivateRailAdapter is a stub implementation'
      : `Private rail blocked by policy: ${policyCheck.reason}`;
    
    return {
      success: false,
      available: false,
      reason,
      preparedPayload: undefined,
      estimatedFee: undefined,
      estimatedLatencyMs: undefined,
      timestamp: Date.now(),
    };
  }
  
  /**
   * Estimate - always returns not available
   * 
   * PHASE 3.6: NO actual estimation occurs
   */
  async estimate(_payload: SimulatedTxPayload): Promise<PrivateRailEstimateResult> {
    return {
      success: false,
      available: false,
      reason: 'Private rail not available: NullPrivateRailAdapter is a stub implementation',
      estimatedTotalFee: undefined,
      estimatedTimeMs: undefined,
      privacyScore: 0,
      timestamp: Date.now(),
    };
  }
  
  /**
   * Validate - always returns not available
   * 
   * PHASE 3.6: NO actual validation occurs
   */
  async validate(_payload: SimulatedTxPayload): Promise<PrivateRailValidationResult> {
    return {
      valid: false,
      available: false,
      errors: ['Private rail not available'],
      warnings: [],
      reason: 'NullPrivateRailAdapter is a stub implementation',
      timestamp: Date.now(),
    };
  }
}

// Singleton instance
let nullAdapter: NullPrivateRailAdapter | null = null;

/**
 * Get the NullPrivateRailAdapter singleton
 */
export function getNullPrivateRailAdapter(): NullPrivateRailAdapter {
  if (!nullAdapter) {
    nullAdapter = new NullPrivateRailAdapter();
  }
  return nullAdapter;
}

/**
 * Reset the NullPrivateRailAdapter singleton (for testing)
 */
export function resetNullPrivateRailAdapter(): void {
  nullAdapter = null;
}

/**
 * Get the current active private rail adapter
 * 
 * PHASE 3.6: Always returns the NullPrivateRailAdapter
 * Future phases may return different adapters based on configuration.
 */
export function getPrivateRailAdapter(): IPrivateRailAdapter {
  return getNullPrivateRailAdapter();
}


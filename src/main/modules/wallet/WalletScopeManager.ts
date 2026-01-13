/**
 * Liminal - Wallet Scope Manager
 * 
 * Manages wallet permissions per-origin and per-context.
 * 
 * PHASE 3.1 RULES:
 * - Scoped per-origin AND per-context
 * - Revocable permissions
 * - NO global wallet state
 * - NO sendTransaction
 * - NO RPC submission
 */

import { ContextId, ContextState } from '../../../shared/types';
import { WalletScope } from '../../../shared/tx-types';
import { getContextManager } from '../ContextManager';

/**
 * Unique key for scope lookup
 */
function scopeKey(origin: string, contextId: ContextId): string {
  return `${origin}::${contextId}`;
}

/**
 * Scope validation result
 */
export interface ScopeValidation {
  valid: boolean;
  reason?: string;
  scope?: WalletScope;
}

/**
 * Wallet Scope Manager
 * 
 * Manages wallet permissions that are:
 * - Per-origin
 * - Per-context
 * - Revocable
 * 
 * NO global wallet state.
 */
export class WalletScopeManager {
  /** Active scopes indexed by origin::contextId */
  private scopes: Map<string, WalletScope> = new Map();
  
  /**
   * Grant a wallet scope for origin + context
   * 
   * @param origin - Origin requesting access
   * @param contextId - Context ID to scope to
   * @returns Granted scope or error
   */
  grantScope(origin: string, contextId: ContextId): ScopeValidation {
    // Validate origin
    if (!origin || origin.length === 0) {
      return { valid: false, reason: 'Origin is required' };
    }
    
    // Validate context exists and is active
    const contextValidation = this.validateContext(contextId);
    if (!contextValidation.valid) {
      return contextValidation;
    }
    
    const key = scopeKey(origin, contextId);
    
    // Check if already granted
    if (this.scopes.has(key)) {
      const existing = this.scopes.get(key)!;
      if (existing.active) {
        return { valid: true, scope: existing };
      }
    }
    
    // Create new scope
    const scope: WalletScope = {
      origin,
      contextId,
      grantedAt: Date.now(),
      active: true,
    };
    
    this.scopes.set(key, scope);
    
    return { valid: true, scope };
  }
  
  /**
   * Revoke a wallet scope
   * 
   * @param origin - Origin to revoke
   * @param contextId - Context ID to revoke
   * @returns Whether revocation was successful
   */
  revokeScope(origin: string, contextId: ContextId): boolean {
    const key = scopeKey(origin, contextId);
    const scope = this.scopes.get(key);
    
    if (!scope) {
      return false;
    }
    
    scope.active = false;
    return true;
  }
  
  /**
   * Revoke all scopes for a context
   * 
   * @param contextId - Context ID to revoke all scopes for
   * @returns Number of scopes revoked
   */
  revokeContext(contextId: ContextId): number {
    let count = 0;
    
    for (const [key, scope] of this.scopes) {
      if (scope.contextId === contextId && scope.active) {
        scope.active = false;
        count++;
      }
    }
    
    return count;
  }
  
  /**
   * Revoke all scopes for an origin
   * 
   * @param origin - Origin to revoke all scopes for
   * @returns Number of scopes revoked
   */
  revokeOrigin(origin: string): number {
    let count = 0;
    
    for (const [key, scope] of this.scopes) {
      if (scope.origin === origin && scope.active) {
        scope.active = false;
        count++;
      }
    }
    
    return count;
  }
  
  /**
   * Get scope for origin + context
   * 
   * @param origin - Origin
   * @param contextId - Context ID
   * @returns Scope if exists, undefined otherwise
   */
  getScope(origin: string, contextId: ContextId): WalletScope | undefined {
    const key = scopeKey(origin, contextId);
    return this.scopes.get(key);
  }
  
  /**
   * Check if scope is active
   * 
   * @param origin - Origin
   * @param contextId - Context ID
   * @returns Whether scope is active
   */
  isScopeActive(origin: string, contextId: ContextId): boolean {
    const scope = this.getScope(origin, contextId);
    return scope?.active === true;
  }
  
  /**
   * Validate that signing is allowed for a scope
   * 
   * @param origin - Origin
   * @param contextId - Context ID
   * @returns Validation result
   */
  validateForSigning(origin: string, contextId: ContextId): ScopeValidation {
    // Check scope exists and is active
    const scope = this.getScope(origin, contextId);
    if (!scope) {
      return { valid: false, reason: 'No wallet scope granted for this origin and context' };
    }
    
    if (!scope.active) {
      return { valid: false, reason: 'Wallet scope has been revoked' };
    }
    
    // Validate context is still active
    const contextValidation = this.validateContext(contextId);
    if (!contextValidation.valid) {
      return contextValidation;
    }
    
    return { valid: true, scope };
  }
  
  /**
   * Validate context exists and is in ACTIVE state
   */
  private validateContext(contextId: ContextId): ScopeValidation {
    const contextManager = getContextManager();
    const context = contextManager.getContext(contextId);
    
    if (!context) {
      return { valid: false, reason: 'Context does not exist' };
    }
    
    if (context.state !== ContextState.CTX_ACTIVE) {
      return { valid: false, reason: `Context is not active (state: ${context.state})` };
    }
    
    return { valid: true };
  }
  
  /**
   * Get all active scopes
   */
  getAllActiveScopes(): WalletScope[] {
    return Array.from(this.scopes.values()).filter(s => s.active);
  }
  
  /**
   * Get all scopes for a context
   */
  getContextScopes(contextId: ContextId): WalletScope[] {
    return Array.from(this.scopes.values()).filter(s => s.contextId === contextId);
  }
  
  /**
   * Get all scopes for an origin
   */
  getOriginScopes(origin: string): WalletScope[] {
    return Array.from(this.scopes.values()).filter(s => s.origin === origin);
  }
  
  /**
   * Clear all scopes (for testing)
   */
  clear(): void {
    this.scopes.clear();
  }
}

// Singleton instance
let walletScopeManager: WalletScopeManager | null = null;

/**
 * Get the WalletScopeManager singleton
 */
export function getWalletScopeManager(): WalletScopeManager {
  if (!walletScopeManager) {
    walletScopeManager = new WalletScopeManager();
  }
  return walletScopeManager;
}

/**
 * Reset the WalletScopeManager singleton (for testing)
 */
export function resetWalletScopeManager(): void {
  if (walletScopeManager) {
    walletScopeManager.clear();
  }
  walletScopeManager = null;
}


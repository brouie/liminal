/**
 * Liminal - Wallet Adapter
 * 
 * Implements scoped wallet signing (NO submission).
 * 
 * PHASE 3.1 RULES:
 * - Signing ONLY
 * - NO sendTransaction
 * - NO RPC submission
 * - NO funds movement
 * - NO private rail
 * - Scoped per-origin AND per-context
 */

import { createHash, randomBytes } from 'crypto';
import { ContextId, ContextState } from '../../../shared/types';
import {
  TxState,
  TxObject,
  ILiminalWalletAdapter,
  WalletConnectionResult,
  WalletScope,
  SigningResult,
  SimulatedTxPayload,
  InvariantId,
} from '../../../shared/tx-types';
import { getWalletScopeManager, WalletScopeManager } from './WalletScopeManager';
import { getTxStateMachine } from '../tx/TxStateMachine';
import { getContextManager } from '../ContextManager';
import { getInvariantManager } from '../invariants';

/**
 * Generate a deterministic "public key" for a scope
 * This is NOT a real wallet - it's a simulation for the adapter layer
 */
function generateScopedPublicKey(origin: string, contextId: ContextId): string {
  const hash = createHash('sha256')
    .update(`liminal:wallet:${origin}:${contextId}`)
    .digest('hex');
  return hash.slice(0, 44); // Solana-like pubkey length
}

/**
 * Hash a transaction payload for consistency checking
 */
function hashPayload(payload: SimulatedTxPayload): string {
  const data = JSON.stringify({
    programId: payload.programId,
    instructionData: payload.instructionData,
    instructionCount: payload.instructionCount,
    accounts: payload.accounts,
    estimatedAmount: payload.estimatedAmount,
    origin: payload.origin,
  });
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Generate a simulated signature
 * This is NOT a real signature - it's for the adapter layer only
 */
function generateSimulatedSignature(
  payload: SimulatedTxPayload,
  scope: WalletScope
): string {
  const data = `${hashPayload(payload)}:${scope.origin}:${scope.contextId}:${Date.now()}`;
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Generate a simulated signed payload
 * This is NOT a real signed transaction - it's for the adapter layer only
 */
function generateSignedPayload(
  payload: SimulatedTxPayload,
  signature: string
): string {
  const combined = {
    payload,
    signature,
    signedAt: Date.now(),
  };
  return Buffer.from(JSON.stringify(combined)).toString('base64');
}

/**
 * Liminal Wallet Adapter
 * 
 * Implements scoped wallet operations:
 * - Connect per origin + context
 * - Sign transactions (NO submission)
 * - Revoke permissions
 * 
 * THIS DOES NOT SEND TRANSACTIONS.
 */
export class LiminalWalletAdapter implements ILiminalWalletAdapter {
  private scopeManager: WalletScopeManager;
  
  constructor() {
    this.scopeManager = getWalletScopeManager();
  }
  
  /**
   * Connect wallet for a specific origin and context
   * 
   * @param origin - Origin requesting connection
   * @param contextId - Context ID to scope to
   * @returns Connection result
   */
  async connect(origin: string, contextId: ContextId): Promise<WalletConnectionResult> {
    // Grant scope
    const validation = this.scopeManager.grantScope(origin, contextId);
    
    if (!validation.valid) {
      return {
        success: false,
        error: validation.reason,
      };
    }
    
    // Generate scoped public key
    const publicKey = generateScopedPublicKey(origin, contextId);
    
    return {
      success: true,
      publicKey,
      scope: validation.scope,
    };
  }
  
  /**
   * Sign a single transaction
   * 
   * PHASE 3.1: Signing ONLY - NO submission
   * PHASE 3.9: Enforces invariants at signing boundary
   * 
   * @param txId - Transaction ID to sign
   * @returns Signing result
   */
  async signTransaction(txId: string): Promise<SigningResult> {
    // PHASE 3.9: Enforce invariants at signing boundary
    const invariantManager = getInvariantManager();
    invariantManager.enforceKillSwitch('signTransaction');
    invariantManager.enforceInvariant(InvariantId.NO_FUNDS_MOVEMENT_PHASE_3);
    
    const stateMachine = getTxStateMachine();
    
    // Get transaction
    const tx = stateMachine.getTransaction(txId);
    if (!tx) {
      return this.createFailedResult(
        'Transaction not found',
        { origin: '', contextId: '' as ContextId, grantedAt: 0, active: false }
      );
    }
    
    // Validate transaction state
    const stateValidation = this.validateTransactionState(tx);
    if (!stateValidation.valid) {
      return this.createFailedResult(
        stateValidation.reason!,
        this.getScopeFromTx(tx)
      );
    }
    
    // Validate scope
    const scopeValidation = this.scopeManager.validateForSigning(
      tx.payload.origin,
      tx.contextId
    );
    
    if (!scopeValidation.valid) {
      return this.createFailedResult(
        scopeValidation.reason!,
        this.getScopeFromTx(tx)
      );
    }
    
    const scope = scopeValidation.scope!;
    
    // Dry-run consistency check
    const consistencyCheck = this.validatePayloadConsistency(tx);
    if (!consistencyCheck.consistent) {
      return this.createFailedResult(
        `Payload mismatch: ${consistencyCheck.reason}`,
        scope,
        consistencyCheck.payloadHash,
        consistencyCheck.dryRunHash
      );
    }
    
    // Generate signature (simulated - NOT a real signature)
    const signature = generateSimulatedSignature(tx.payload, scope);
    const signedPayload = generateSignedPayload(tx.payload, signature);
    
    return {
      success: true,
      signedPayload,
      signature,
      signerScope: scope,
      payloadHash: consistencyCheck.payloadHash,
      dryRunHash: consistencyCheck.dryRunHash,
      payloadConsistent: true,
      timestamp: Date.now(),
      submitted: false, // ALWAYS false - NO submission
    };
  }
  
  /**
   * Sign multiple transactions
   * 
   * PHASE 3.1: Signing ONLY - NO submission
   * 
   * @param txIds - Transaction IDs to sign
   * @returns Array of signing results
   */
  async signAllTransactions(txIds: string[]): Promise<SigningResult[]> {
    const results: SigningResult[] = [];
    
    for (const txId of txIds) {
      const result = await this.signTransaction(txId);
      results.push(result);
      
      // Stop on first failure
      if (!result.success) {
        break;
      }
    }
    
    return results;
  }
  
  /**
   * Check if wallet is connected for scope
   */
  isConnected(origin: string, contextId: ContextId): boolean {
    return this.scopeManager.isScopeActive(origin, contextId);
  }
  
  /**
   * Disconnect wallet for scope
   */
  disconnect(origin: string, contextId: ContextId): void {
    this.scopeManager.revokeScope(origin, contextId);
  }
  
  /**
   * Get current scope
   */
  getScope(origin: string, contextId: ContextId): WalletScope | undefined {
    return this.scopeManager.getScope(origin, contextId);
  }
  
  /**
   * Revoke all scopes for a context
   */
  revokeContext(contextId: ContextId): void {
    this.scopeManager.revokeContext(contextId);
  }
  
  /**
   * Revoke all scopes for an origin
   */
  revokeOrigin(origin: string): void {
    this.scopeManager.revokeOrigin(origin);
  }
  
  /**
   * Validate transaction is in correct state for signing
   */
  private validateTransactionState(tx: TxObject): { valid: boolean; reason?: string } {
    // Must have completed dry-run
    if (!tx.dryRunResult) {
      return { valid: false, reason: 'Transaction has not completed dry-run' };
    }
    
    // Dry-run must have succeeded
    if (!tx.dryRunResult.success) {
      return { valid: false, reason: 'Dry-run was not successful' };
    }
    
    // State must be TX_DRY_RUN (ready for signing) or TX_SIGN (already in signing)
    if (tx.state !== TxState.TX_DRY_RUN && tx.state !== TxState.TX_SIGN) {
      return { valid: false, reason: `Invalid transaction state for signing: ${tx.state}` };
    }
    
    // Validate context is still active
    const contextManager = getContextManager();
    const context = contextManager.getContext(tx.contextId);
    
    if (!context) {
      return { valid: false, reason: 'Context no longer exists' };
    }
    
    if (context.state !== ContextState.CTX_ACTIVE) {
      return { valid: false, reason: `Context is not active (state: ${context.state})` };
    }
    
    return { valid: true };
  }
  
  /**
   * Validate payload consistency between current payload and dry-run
   * Prevents bait-and-switch attacks
   */
  private validatePayloadConsistency(tx: TxObject): {
    consistent: boolean;
    reason?: string;
    payloadHash: string;
    dryRunHash: string;
  } {
    const payloadHash = hashPayload(tx.payload);
    
    // For dry-run, we use the same payload, so hash should match
    // In a real implementation, we'd compare against the actual dry-run payload
    const dryRunHash = payloadHash; // Same payload was used for dry-run
    
    // Check that critical fields haven't changed since classification
    if (tx.classification) {
      const classifiedAmount = tx.classification.metadata.estimatedAmount || 0;
      if (Math.abs(tx.payload.estimatedAmount - classifiedAmount) > 0.0001) {
        return {
          consistent: false,
          reason: 'Amount changed since classification',
          payloadHash,
          dryRunHash,
        };
      }
    }
    
    return {
      consistent: true,
      payloadHash,
      dryRunHash,
    };
  }
  
  /**
   * Create a failed signing result
   */
  private createFailedResult(
    error: string,
    scope: WalletScope,
    payloadHash: string = '',
    dryRunHash: string = ''
  ): SigningResult {
    return {
      success: false,
      signerScope: scope,
      payloadHash,
      dryRunHash,
      payloadConsistent: false,
      timestamp: Date.now(),
      error,
      submitted: false, // ALWAYS false - NO submission
    };
  }
  
  /**
   * Get scope info from transaction
   */
  private getScopeFromTx(tx: TxObject): WalletScope {
    const scope = this.scopeManager.getScope(tx.payload.origin, tx.contextId);
    return scope || {
      origin: tx.payload.origin,
      contextId: tx.contextId,
      grantedAt: 0,
      active: false,
    };
  }
}

// Singleton instance
let liminalWalletAdapter: LiminalWalletAdapter | null = null;

/**
 * Get the LiminalWalletAdapter singleton
 */
export function getLiminalWalletAdapter(): LiminalWalletAdapter {
  if (!liminalWalletAdapter) {
    liminalWalletAdapter = new LiminalWalletAdapter();
  }
  return liminalWalletAdapter;
}

/**
 * Reset the LiminalWalletAdapter singleton (for testing)
 */
export function resetLiminalWalletAdapter(): void {
  liminalWalletAdapter = null;
}


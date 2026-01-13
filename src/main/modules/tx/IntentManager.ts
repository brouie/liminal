/**
 * Liminal - Intent Manager
 * 
 * Manages user intent and consent for transaction actions.
 * 
 * PHASE 3.3 RULES:
 * - Intent required before signing (if enforcement enabled)
 * - Intent ALWAYS required before submission (future phases)
 * - Intents are IMMUTABLE once created
 * - Intents have expiration
 * - NO transaction submission
 * - NO RPC calls
 */

import { randomBytes, createHash } from 'crypto';
import { ContextId } from '../../../shared/types';
import {
  UserIntent,
  IntentType,
  IntentStatus,
  CreateIntentOptions,
  IntentConfirmationResult,
  IntentValidation,
} from '../../../shared/tx-types';

// Default TTL: 5 minutes
const DEFAULT_INTENT_TTL_MS = 5 * 60 * 1000;

/**
 * Generate unique intent ID
 */
function generateIntentId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(8).toString('hex');
  return `intent_${timestamp}_${random}`;
}

/**
 * Error thrown when intent is not found
 */
export class IntentNotFoundError extends Error {
  constructor(intentId: string) {
    super(`Intent not found: ${intentId}`);
    this.name = 'IntentNotFoundError';
  }
}

/**
 * Error thrown when intent is expired
 */
export class IntentExpiredError extends Error {
  constructor(intentId: string) {
    super(`Intent expired: ${intentId}`);
    this.name = 'IntentExpiredError';
  }
}

/**
 * Error thrown when intent is already consumed
 */
export class IntentAlreadyConsumedError extends Error {
  constructor(intentId: string) {
    super(`Intent already consumed: ${intentId}`);
    this.name = 'IntentAlreadyConsumedError';
  }
}

/**
 * Error thrown when intent modification is attempted
 */
export class IntentImmutableError extends Error {
  constructor(intentId: string, field: string) {
    super(`Cannot modify immutable intent field: ${field} on ${intentId}`);
    this.name = 'IntentImmutableError';
  }
}

/**
 * Intent Manager
 * 
 * Manages the lifecycle of user intents:
 * - Creation (immutable)
 * - Confirmation
 * - Expiration
 * - Consumption
 * - Revocation
 */
export class IntentManager {
  /** Active intents by ID */
  private intents: Map<string, UserIntent> = new Map();
  
  /** Index: txId -> intentId */
  private txIntents: Map<string, string> = new Map();
  
  /** Whether to enforce intent before signing */
  private enforceIntentForSigning: boolean = false;
  
  /**
   * Create a new user intent
   * 
   * Intents are IMMUTABLE once created.
   * 
   * @param options - Intent creation options
   * @returns Created intent
   */
  createIntent(options: CreateIntentOptions): UserIntent {
    const now = Date.now();
    const ttlMs = options.ttlMs ?? DEFAULT_INTENT_TTL_MS;
    
    const intent: UserIntent = {
      intentId: generateIntentId(),
      txId: options.txId,
      origin: options.origin,
      contextId: options.contextId,
      createdAt: now,
      expiresAt: now + ttlMs,
      intentType: options.intentType,
      status: IntentStatus.PENDING,
    };
    
    // Store intent
    this.intents.set(intent.intentId, intent);
    
    // Index by txId
    this.txIntents.set(options.txId, intent.intentId);
    
    return this.freezeIntent(intent);
  }
  
  /**
   * Confirm an intent
   * 
   * Confirmation is local, deterministic, and auditable.
   * 
   * @param intentId - Intent ID to confirm
   * @returns Confirmation result
   */
  confirmIntent(intentId: string): IntentConfirmationResult {
    const intent = this.intents.get(intentId);
    
    if (!intent) {
      return {
        success: false,
        intentId,
        error: 'Intent not found',
      };
    }
    
    // Check if expired
    if (this.isExpired(intent)) {
      intent.status = IntentStatus.EXPIRED;
      return {
        success: false,
        intentId,
        error: 'Intent has expired',
        expired: true,
      };
    }
    
    // Check if already consumed
    if (intent.status === IntentStatus.CONSUMED) {
      return {
        success: false,
        intentId,
        error: 'Intent already consumed',
        alreadyConsumed: true,
      };
    }
    
    // Check if revoked
    if (intent.status === IntentStatus.REVOKED) {
      return {
        success: false,
        intentId,
        error: 'Intent has been revoked',
      };
    }
    
    // Check if already confirmed
    if (intent.status === IntentStatus.CONFIRMED) {
      // Already confirmed, return success
      return {
        success: true,
        intentId,
      };
    }
    
    // Confirm the intent
    intent.status = IntentStatus.CONFIRMED;
    intent.confirmedAt = Date.now();
    
    return {
      success: true,
      intentId,
    };
  }
  
  /**
   * Consume an intent (mark as used)
   * 
   * Once consumed, intent cannot be used again.
   * 
   * @param intentId - Intent ID to consume
   * @returns Whether consumption was successful
   */
  consumeIntent(intentId: string): boolean {
    const intent = this.intents.get(intentId);
    
    if (!intent) {
      return false;
    }
    
    // Can only consume confirmed intents
    if (intent.status !== IntentStatus.CONFIRMED) {
      return false;
    }
    
    // Check if expired
    if (this.isExpired(intent)) {
      intent.status = IntentStatus.EXPIRED;
      return false;
    }
    
    intent.status = IntentStatus.CONSUMED;
    intent.consumedAt = Date.now();
    
    return true;
  }
  
  /**
   * Revoke an intent
   * 
   * @param intentId - Intent ID to revoke
   * @returns Whether revocation was successful
   */
  revokeIntent(intentId: string): boolean {
    const intent = this.intents.get(intentId);
    
    if (!intent) {
      return false;
    }
    
    // Cannot revoke consumed intents
    if (intent.status === IntentStatus.CONSUMED) {
      return false;
    }
    
    intent.status = IntentStatus.REVOKED;
    
    return true;
  }
  
  /**
   * Get intent by ID
   * 
   * @param intentId - Intent ID
   * @returns Intent or undefined
   */
  getIntent(intentId: string): UserIntent | undefined {
    const intent = this.intents.get(intentId);
    if (!intent) return undefined;
    
    // Check and update expired status
    if (this.isExpired(intent) && intent.status === IntentStatus.PENDING) {
      intent.status = IntentStatus.EXPIRED;
    }
    
    return this.freezeIntent(intent);
  }
  
  /**
   * Get intent for a transaction
   * 
   * @param txId - Transaction ID
   * @returns Intent or undefined
   */
  getIntentForTx(txId: string): UserIntent | undefined {
    const intentId = this.txIntents.get(txId);
    if (!intentId) return undefined;
    
    return this.getIntent(intentId);
  }
  
  /**
   * Validate intent for an action
   * 
   * @param intentId - Intent ID
   * @param requiredType - Required intent type (optional)
   * @returns Validation result
   */
  validateIntent(
    intentId: string,
    requiredType?: IntentType
  ): IntentValidation {
    const intent = this.intents.get(intentId);
    
    if (!intent) {
      return {
        valid: false,
        reason: 'Intent not found',
      };
    }
    
    // Check expiration
    if (this.isExpired(intent)) {
      if (intent.status === IntentStatus.PENDING) {
        intent.status = IntentStatus.EXPIRED;
      }
      return {
        valid: false,
        intent: this.freezeIntent(intent),
        reason: 'Intent has expired',
      };
    }
    
    // Check status
    if (intent.status !== IntentStatus.CONFIRMED) {
      return {
        valid: false,
        intent: this.freezeIntent(intent),
        reason: `Intent is ${intent.status}, must be CONFIRMED`,
      };
    }
    
    // Check type if required
    if (requiredType && intent.intentType !== requiredType) {
      return {
        valid: false,
        intent: this.freezeIntent(intent),
        reason: `Intent type is ${intent.intentType}, required ${requiredType}`,
      };
    }
    
    return {
      valid: true,
      intent: this.freezeIntent(intent),
    };
  }
  
  /**
   * Validate intent for signing
   * 
   * @param txId - Transaction ID
   * @returns Validation result
   */
  validateForSigning(txId: string): IntentValidation {
    // If enforcement is disabled, always valid
    if (!this.enforceIntentForSigning) {
      return { valid: true };
    }
    
    const intentId = this.txIntents.get(txId);
    if (!intentId) {
      return {
        valid: false,
        reason: 'No intent found for transaction',
      };
    }
    
    // SIGN_ONLY or SIGN_AND_SUBMIT both allow signing
    return this.validateIntent(intentId);
  }
  
  /**
   * Validate intent for submission
   * 
   * Note: Submission is STILL BLOCKED in Phase 3.3.
   * This validation is for future phases.
   * 
   * @param txId - Transaction ID
   * @returns Validation result
   */
  validateForSubmission(txId: string): IntentValidation {
    const intentId = this.txIntents.get(txId);
    if (!intentId) {
      return {
        valid: false,
        reason: 'No intent found for transaction',
      };
    }
    
    // Must be SIGN_AND_SUBMIT for submission
    return this.validateIntent(intentId, IntentType.SIGN_AND_SUBMIT);
  }
  
  /**
   * Set whether to enforce intent before signing
   * 
   * @param enforce - Whether to enforce
   */
  setEnforceIntentForSigning(enforce: boolean): void {
    this.enforceIntentForSigning = enforce;
  }
  
  /**
   * Get whether intent is enforced for signing
   */
  isIntentEnforcedForSigning(): boolean {
    return this.enforceIntentForSigning;
  }
  
  /**
   * Check if intent is expired
   */
  private isExpired(intent: UserIntent): boolean {
    return Date.now() > intent.expiresAt;
  }
  
  /**
   * Create a frozen (immutable) copy of intent for external use
   */
  private freezeIntent(intent: UserIntent): UserIntent {
    return Object.freeze({ ...intent });
  }
  
  /**
   * Clear all intents for a context
   */
  clearContext(contextId: ContextId): number {
    let count = 0;
    
    for (const [intentId, intent] of this.intents) {
      if (intent.contextId === contextId) {
        this.intents.delete(intentId);
        this.txIntents.delete(intent.txId);
        count++;
      }
    }
    
    return count;
  }
  
  /**
   * Clear all intents
   */
  clear(): void {
    this.intents.clear();
    this.txIntents.clear();
  }
  
  /**
   * Get all intents (for debugging/testing)
   */
  getAllIntents(): UserIntent[] {
    return Array.from(this.intents.values()).map(i => this.freezeIntent(i));
  }
}

// Singleton instance
let intentManager: IntentManager | null = null;

/**
 * Get the IntentManager singleton
 */
export function getIntentManager(): IntentManager {
  if (!intentManager) {
    intentManager = new IntentManager();
  }
  return intentManager;
}

/**
 * Reset the IntentManager singleton (for testing)
 */
export function resetIntentManager(): void {
  if (intentManager) {
    intentManager.clear();
  }
  intentManager = null;
}


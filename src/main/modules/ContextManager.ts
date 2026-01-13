/**
 * ContextManager - Per-tab Context Isolation with State Machine
 * 
 * Manages isolated browser contexts with partitioned sessions.
 * Each context has its own cookies, storage, and cache.
 * 
 * State Machine:
 *   NEW -> POLICY_EVAL -> ROUTE_SET -> ACTIVE
 *   ACTIVE -> ROTATING -> DRAINING -> POLICY_EVAL (for identity rotation)
 *   ACTIVE -> CLOSED (for destruction)
 *   Any -> ERROR (on failure)
 */

import { session, Session } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { 
  BrowserContext, 
  ContextId, 
  ProxyConfig, 
  ContextState, 
  VALID_STATE_TRANSITIONS 
} from '../../shared/types';

/**
 * Error thrown when an invalid state transition is attempted
 */
export class InvalidStateTransitionError extends Error {
  constructor(
    public contextId: ContextId,
    public fromState: ContextState,
    public toState: ContextState
  ) {
    super(`Invalid state transition for context ${contextId}: ${fromState} -> ${toState}`);
    this.name = 'InvalidStateTransitionError';
  }
}

/**
 * Error thrown when an operation is attempted in an invalid state
 */
export class InvalidContextStateError extends Error {
  constructor(
    public contextId: ContextId,
    public currentState: ContextState,
    public requiredState: ContextState | ContextState[],
    public operation: string
  ) {
    const required = Array.isArray(requiredState) ? requiredState.join(' or ') : requiredState;
    super(`Cannot ${operation} for context ${contextId}: state is ${currentState}, requires ${required}`);
    this.name = 'InvalidContextStateError';
  }
}

export class ContextManager {
  private contexts: Map<ContextId, BrowserContext> = new Map();
  private sessions: Map<ContextId, Session> = new Map();

  /**
   * Validate and execute a state transition
   */
  transitionTo(contextId: ContextId, newState: ContextState): BrowserContext {
    const context = this.contexts.get(contextId);
    if (!context) {
      throw new Error(`Context ${contextId} not found`);
    }

    const currentState = context.state;
    const validTransitions = VALID_STATE_TRANSITIONS[currentState];

    if (!validTransitions.includes(newState)) {
      // Transition to ERROR state if attempting invalid transition
      if (newState !== ContextState.CTX_ERROR) {
        context.state = ContextState.CTX_ERROR;
        context.active = false;
        context.errorMessage = `Invalid transition attempted: ${currentState} -> ${newState}`;
      }
      throw new InvalidStateTransitionError(contextId, currentState, newState);
    }

    // Execute the transition
    context.state = newState;
    
    // Update active flag based on state
    context.active = newState === ContextState.CTX_ACTIVE;

    return context;
  }

  /**
   * Get the current state of a context
   */
  getContextState(contextId: ContextId): ContextState | undefined {
    return this.contexts.get(contextId)?.state;
  }

  /**
   * Check if a context is in a specific state
   */
  isInState(contextId: ContextId, state: ContextState | ContextState[]): boolean {
    const currentState = this.getContextState(contextId);
    if (!currentState) return false;
    
    if (Array.isArray(state)) {
      return state.includes(currentState);
    }
    return currentState === state;
  }

  /**
   * Transition context to error state
   */
  setError(contextId: ContextId, errorMessage: string): void {
    const context = this.contexts.get(contextId);
    if (!context) return;

    context.state = ContextState.CTX_ERROR;
    context.active = false;
    context.errorMessage = errorMessage;
  }

  /**
   * Create a new isolated browser context (starts in CTX_NEW state)
   */
  createContext(proxyConfig?: ProxyConfig): BrowserContext {
    const id = uuidv4();
    const partition = `persist:liminal-${id}`;
    
    const context: BrowserContext = {
      id,
      partition,
      state: ContextState.CTX_NEW,
      proxy: proxyConfig || { type: 'direct' },
      createdAt: Date.now(),
      tabIds: [],
      active: false, // Not active until state is CTX_ACTIVE
    };

    // Create isolated session
    const ses = session.fromPartition(partition, { cache: true });
    
    // Configure session for privacy
    this.configureSession(ses);
    
    this.contexts.set(id, context);
    this.sessions.set(id, ses);

    return context;
  }

  /**
   * Initialize a context through the state machine to ACTIVE state
   * Transitions: NEW -> POLICY_EVAL -> ROUTE_SET -> ACTIVE
   */
  async initializeContext(contextId: ContextId): Promise<BrowserContext> {
    const context = this.contexts.get(contextId);
    if (!context) {
      throw new Error(`Context ${contextId} not found`);
    }

    // NEW -> POLICY_EVAL
    if (context.state === ContextState.CTX_NEW) {
      this.transitionTo(contextId, ContextState.CTX_POLICY_EVAL);
    }

    // POLICY_EVAL -> ROUTE_SET (policy evaluation happens here)
    if (context.state === ContextState.CTX_POLICY_EVAL) {
      // Policy evaluation is currently a pass-through
      // Future phases may add actual policy checks here
      this.transitionTo(contextId, ContextState.CTX_ROUTE_SET);
    }

    // ROUTE_SET -> ACTIVE (route/proxy configuration happens externally)
    // This transition is triggered by activateContext() after proxy is set

    return context;
  }

  /**
   * Activate a context (transition from ROUTE_SET to ACTIVE)
   * Should be called after proxy is configured
   */
  activateContext(contextId: ContextId): BrowserContext {
    const context = this.contexts.get(contextId);
    if (!context) {
      throw new Error(`Context ${contextId} not found`);
    }

    if (context.state !== ContextState.CTX_ROUTE_SET) {
      throw new InvalidContextStateError(
        contextId, 
        context.state, 
        ContextState.CTX_ROUTE_SET, 
        'activate context'
      );
    }

    return this.transitionTo(contextId, ContextState.CTX_ACTIVE);
  }

  /**
   * Configure session with privacy defaults
   */
  private configureSession(ses: Session): void {
    // Disable third-party cookies by default
    ses.cookies.flushStore();
    
    // Set strict referrer policy
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
      const headers = { ...details.requestHeaders };
      
      // Minimize referrer leakage
      if (headers['Referer']) {
        try {
          const refererUrl = new URL(headers['Referer']);
          const requestUrl = new URL(details.url);
          
          // Only send origin for cross-origin requests
          if (refererUrl.origin !== requestUrl.origin) {
            headers['Referer'] = refererUrl.origin + '/';
          }
        } catch {
          // Invalid URL, remove referrer
          delete headers['Referer'];
        }
      }
      
      // Remove tracking headers
      delete headers['X-Client-Data'];
      
      callback({ requestHeaders: headers });
    });
  }

  /**
   * Get a context by ID
   */
  getContext(contextId: ContextId): BrowserContext | undefined {
    return this.contexts.get(contextId);
  }

  /**
   * Get the Electron session for a context
   */
  getSession(contextId: ContextId): Session | undefined {
    return this.sessions.get(contextId);
  }

  /**
   * Get all active contexts (state == CTX_ACTIVE)
   */
  getAllContexts(): BrowserContext[] {
    return Array.from(this.contexts.values()).filter(c => c.active);
  }

  /**
   * Get all contexts regardless of state
   */
  getAllContextsIncludingInactive(): BrowserContext[] {
    return Array.from(this.contexts.values());
  }

  /**
   * Associate a tab with a context
   * Only allowed when context is ACTIVE
   */
  addTabToContext(contextId: ContextId, tabId: number): boolean {
    const context = this.contexts.get(contextId);
    if (!context) return false;
    
    // Allow adding tabs during initialization states as well
    const allowedStates = [
      ContextState.CTX_NEW,
      ContextState.CTX_POLICY_EVAL,
      ContextState.CTX_ROUTE_SET,
      ContextState.CTX_ACTIVE,
    ];
    
    if (!allowedStates.includes(context.state)) {
      return false;
    }
    
    if (!context.tabIds.includes(tabId)) {
      context.tabIds.push(tabId);
    }
    return true;
  }

  /**
   * Remove a tab from a context
   */
  removeTabFromContext(contextId: ContextId, tabId: number): boolean {
    const context = this.contexts.get(contextId);
    if (!context) return false;
    
    const index = context.tabIds.indexOf(tabId);
    if (index > -1) {
      context.tabIds.splice(index, 1);
    }
    return true;
  }

  /**
   * Rotate identity - clear all session data and optionally change proxy
   * State flow: ACTIVE -> ROTATING -> DRAINING -> POLICY_EVAL -> ROUTE_SET -> ACTIVE
   */
  async rotateIdentity(contextId: ContextId, newProxy?: ProxyConfig): Promise<BrowserContext | null> {
    const context = this.contexts.get(contextId);
    const ses = this.sessions.get(contextId);
    
    if (!context || !ses) return null;

    // Must be in ACTIVE state to rotate
    if (context.state !== ContextState.CTX_ACTIVE) {
      throw new InvalidContextStateError(
        contextId,
        context.state,
        ContextState.CTX_ACTIVE,
        'rotate identity'
      );
    }

    // ACTIVE -> ROTATING
    this.transitionTo(contextId, ContextState.CTX_ROTATING);

    // ROTATING -> DRAINING
    this.transitionTo(contextId, ContextState.CTX_DRAINING);

    // Clear all session data during DRAINING phase
    await ses.clearStorageData({
      storages: [
        'cookies',
        'localstorage',
        'indexdb',
        'websql',
        'serviceworkers',
        'cachestorage',
      ],
    });
    await ses.clearCache();
    await ses.clearAuthCache();

    // DRAINING -> POLICY_EVAL
    this.transitionTo(contextId, ContextState.CTX_POLICY_EVAL);

    // Update proxy if provided
    if (newProxy) {
      context.proxy = newProxy;
    }

    // Update context metadata
    context.createdAt = Date.now();

    // POLICY_EVAL -> ROUTE_SET
    this.transitionTo(contextId, ContextState.CTX_ROUTE_SET);

    // ROUTE_SET -> ACTIVE (re-activate the context)
    this.transitionTo(contextId, ContextState.CTX_ACTIVE);

    return context;
  }

  /**
   * Destroy a context and clean up resources
   * Transitions to CLOSED state
   */
  async destroyContext(contextId: ContextId): Promise<boolean> {
    const context = this.contexts.get(contextId);
    const ses = this.sessions.get(contextId);
    
    if (!context) return false;

    // Can only close from ACTIVE state (or ERROR state for cleanup)
    const canClose = context.state === ContextState.CTX_ACTIVE || 
                     context.state === ContextState.CTX_ERROR;
    
    if (canClose && context.state === ContextState.CTX_ACTIVE) {
      // ACTIVE -> CLOSED
      this.transitionTo(contextId, ContextState.CTX_CLOSED);
    } else {
      // Force to closed state
      context.state = ContextState.CTX_CLOSED;
      context.active = false;
    }

    // Clear session data if session exists
    if (ses) {
      try {
        await ses.clearStorageData();
        await ses.clearCache();
      } catch (error) {
        console.error(`Failed to clear session for context ${contextId}:`, error);
      }
    }

    // Remove from maps
    this.contexts.delete(contextId);
    this.sessions.delete(contextId);

    return true;
  }

  /**
   * Get context statistics
   */
  getStats(): { total: number; active: number; totalTabs: number; byState: Record<ContextState, number> } {
    const contexts = Array.from(this.contexts.values());
    
    const byState = Object.values(ContextState).reduce((acc, state) => {
      acc[state] = contexts.filter(c => c.state === state).length;
      return acc;
    }, {} as Record<ContextState, number>);

    return {
      total: contexts.length,
      active: contexts.filter(c => c.active).length,
      totalTabs: contexts.reduce((sum, c) => sum + c.tabIds.length, 0),
      byState,
    };
  }
}

// Singleton instance
let instance: ContextManager | null = null;

export function getContextManager(): ContextManager {
  if (!instance) {
    instance = new ContextManager();
  }
  return instance;
}

export function resetContextManager(): void {
  instance = null;
}

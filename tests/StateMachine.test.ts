/**
 * Context State Machine Tests
 * 
 * Tests for the context state machine, state transitions, and enforcement.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  ContextState, 
  VALID_STATE_TRANSITIONS, 
  BrowserContext, 
  ProxyConfig, 
  ContextId 
} from '../src/shared/types';

/**
 * Testable State Machine implementation (mirrors ContextManager logic)
 */
class TestableStateMachine {
  private contexts: Map<ContextId, BrowserContext> = new Map();
  private idCounter = 0;

  createContext(proxyConfig?: ProxyConfig): BrowserContext {
    const id = `test-context-${++this.idCounter}`;
    const partition = `persist:liminal-${id}`;
    
    const context: BrowserContext = {
      id,
      partition,
      state: ContextState.CTX_NEW,
      proxy: proxyConfig || { type: 'direct' },
      createdAt: Date.now(),
      tabIds: [],
      active: false,
    };

    this.contexts.set(id, context);
    return context;
  }

  getContext(contextId: ContextId): BrowserContext | undefined {
    return this.contexts.get(contextId);
  }

  getContextState(contextId: ContextId): ContextState | undefined {
    return this.contexts.get(contextId)?.state;
  }

  isInState(contextId: ContextId, state: ContextState | ContextState[]): boolean {
    const currentState = this.getContextState(contextId);
    if (!currentState) return false;
    
    if (Array.isArray(state)) {
      return state.includes(currentState);
    }
    return currentState === state;
  }

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

    context.state = newState;
    context.active = newState === ContextState.CTX_ACTIVE;

    return context;
  }

  setError(contextId: ContextId, errorMessage: string): void {
    const context = this.contexts.get(contextId);
    if (!context) return;

    context.state = ContextState.CTX_ERROR;
    context.active = false;
    context.errorMessage = errorMessage;
  }

  /**
   * Initialize context through state machine: NEW -> POLICY_EVAL -> ROUTE_SET
   */
  initializeContext(contextId: ContextId): BrowserContext {
    const context = this.contexts.get(contextId);
    if (!context) {
      throw new Error(`Context ${contextId} not found`);
    }

    if (context.state === ContextState.CTX_NEW) {
      this.transitionTo(contextId, ContextState.CTX_POLICY_EVAL);
    }

    if (context.state === ContextState.CTX_POLICY_EVAL) {
      this.transitionTo(contextId, ContextState.CTX_ROUTE_SET);
    }

    return context;
  }

  /**
   * Activate context: ROUTE_SET -> ACTIVE
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
   * Rotate identity: ACTIVE -> ROTATING -> DRAINING -> POLICY_EVAL -> ROUTE_SET -> ACTIVE
   */
  rotateIdentity(contextId: ContextId, newProxy?: ProxyConfig): BrowserContext {
    const context = this.contexts.get(contextId);
    if (!context) {
      throw new Error(`Context ${contextId} not found`);
    }

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

    // DRAINING -> POLICY_EVAL
    this.transitionTo(contextId, ContextState.CTX_POLICY_EVAL);

    if (newProxy) {
      context.proxy = newProxy;
    }

    context.createdAt = Date.now();

    // POLICY_EVAL -> ROUTE_SET
    this.transitionTo(contextId, ContextState.CTX_ROUTE_SET);

    // ROUTE_SET -> ACTIVE
    this.transitionTo(contextId, ContextState.CTX_ACTIVE);

    return context;
  }

  /**
   * Close context: ACTIVE -> CLOSED
   */
  closeContext(contextId: ContextId): BrowserContext {
    const context = this.contexts.get(contextId);
    if (!context) {
      throw new Error(`Context ${contextId} not found`);
    }

    if (context.state !== ContextState.CTX_ACTIVE) {
      throw new InvalidContextStateError(
        contextId,
        context.state,
        ContextState.CTX_ACTIVE,
        'close context'
      );
    }

    return this.transitionTo(contextId, ContextState.CTX_CLOSED);
  }
}

/**
 * Error classes for testing
 */
class InvalidStateTransitionError extends Error {
  constructor(
    public contextId: ContextId,
    public fromState: ContextState,
    public toState: ContextState
  ) {
    super(`Invalid state transition for context ${contextId}: ${fromState} -> ${toState}`);
    this.name = 'InvalidStateTransitionError';
  }
}

class InvalidContextStateError extends Error {
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

/**
 * Testable Interceptor that enforces state checks
 */
class TestableInterceptor {
  private stateMachine: TestableStateMachine;

  constructor(stateMachine: TestableStateMachine) {
    this.stateMachine = stateMachine;
  }

  /**
   * Check if requests are allowed - only in CTX_ACTIVE state
   */
  isRequestAllowed(contextId: ContextId): boolean {
    return this.stateMachine.isInState(contextId, ContextState.CTX_ACTIVE);
  }

  /**
   * Simulate request interception
   */
  interceptRequest(contextId: ContextId, url: string): { allowed: boolean; reason?: string } {
    if (!this.isRequestAllowed(contextId)) {
      const state = this.stateMachine.getContextState(contextId);
      return { 
        allowed: false, 
        reason: `Context not in ACTIVE state (current: ${state})` 
      };
    }
    return { allowed: true };
  }
}

/**
 * Testable ProxyManager that enforces state checks
 */
class TestableProxyManager {
  private stateMachine: TestableStateMachine;
  private proxies: Map<ContextId, ProxyConfig> = new Map();

  constructor(stateMachine: TestableStateMachine) {
    this.stateMachine = stateMachine;
  }

  /**
   * Set proxy - only allowed in CTX_ROUTE_SET state
   */
  setProxy(contextId: ContextId, config: ProxyConfig): { success: boolean; error?: string } {
    const context = this.stateMachine.getContext(contextId);
    if (!context) {
      return { success: false, error: 'Context not found' };
    }

    if (context.state !== ContextState.CTX_ROUTE_SET) {
      return { 
        success: false, 
        error: `Cannot set proxy: state is ${context.state}, requires ${ContextState.CTX_ROUTE_SET}` 
      };
    }

    this.proxies.set(contextId, config);
    context.proxy = config;
    return { success: true };
  }

  canSetProxy(contextId: ContextId): boolean {
    return this.stateMachine.isInState(contextId, ContextState.CTX_ROUTE_SET);
  }
}

// ========================= TESTS =========================

describe('Context State Machine', () => {
  let sm: TestableStateMachine;

  beforeEach(() => {
    sm = new TestableStateMachine();
  });

  describe('Initial State', () => {
    it('should create context in CTX_NEW state', () => {
      const ctx = sm.createContext();
      expect(ctx.state).toBe(ContextState.CTX_NEW);
    });

    it('should have active=false in CTX_NEW state', () => {
      const ctx = sm.createContext();
      expect(ctx.active).toBe(false);
    });
  });

  describe('Valid State Transitions', () => {
    it('should allow NEW -> POLICY_EVAL', () => {
      const ctx = sm.createContext();
      const result = sm.transitionTo(ctx.id, ContextState.CTX_POLICY_EVAL);
      expect(result.state).toBe(ContextState.CTX_POLICY_EVAL);
    });

    it('should allow POLICY_EVAL -> ROUTE_SET', () => {
      const ctx = sm.createContext();
      sm.transitionTo(ctx.id, ContextState.CTX_POLICY_EVAL);
      const result = sm.transitionTo(ctx.id, ContextState.CTX_ROUTE_SET);
      expect(result.state).toBe(ContextState.CTX_ROUTE_SET);
    });

    it('should allow ROUTE_SET -> ACTIVE', () => {
      const ctx = sm.createContext();
      sm.transitionTo(ctx.id, ContextState.CTX_POLICY_EVAL);
      sm.transitionTo(ctx.id, ContextState.CTX_ROUTE_SET);
      const result = sm.transitionTo(ctx.id, ContextState.CTX_ACTIVE);
      expect(result.state).toBe(ContextState.CTX_ACTIVE);
      expect(result.active).toBe(true);
    });

    it('should allow ACTIVE -> ROTATING', () => {
      const ctx = sm.createContext();
      sm.initializeContext(ctx.id);
      sm.activateContext(ctx.id);
      const result = sm.transitionTo(ctx.id, ContextState.CTX_ROTATING);
      expect(result.state).toBe(ContextState.CTX_ROTATING);
    });

    it('should allow ROTATING -> DRAINING', () => {
      const ctx = sm.createContext();
      sm.initializeContext(ctx.id);
      sm.activateContext(ctx.id);
      sm.transitionTo(ctx.id, ContextState.CTX_ROTATING);
      const result = sm.transitionTo(ctx.id, ContextState.CTX_DRAINING);
      expect(result.state).toBe(ContextState.CTX_DRAINING);
    });

    it('should allow DRAINING -> POLICY_EVAL (for rotation cycle)', () => {
      const ctx = sm.createContext();
      sm.initializeContext(ctx.id);
      sm.activateContext(ctx.id);
      sm.transitionTo(ctx.id, ContextState.CTX_ROTATING);
      sm.transitionTo(ctx.id, ContextState.CTX_DRAINING);
      const result = sm.transitionTo(ctx.id, ContextState.CTX_POLICY_EVAL);
      expect(result.state).toBe(ContextState.CTX_POLICY_EVAL);
    });

    it('should allow ACTIVE -> CLOSED', () => {
      const ctx = sm.createContext();
      sm.initializeContext(ctx.id);
      sm.activateContext(ctx.id);
      const result = sm.transitionTo(ctx.id, ContextState.CTX_CLOSED);
      expect(result.state).toBe(ContextState.CTX_CLOSED);
      expect(result.active).toBe(false);
    });

    it('should allow any state -> ERROR', () => {
      const ctx = sm.createContext();
      const result = sm.transitionTo(ctx.id, ContextState.CTX_ERROR);
      expect(result.state).toBe(ContextState.CTX_ERROR);
    });
  });

  describe('Invalid State Transitions', () => {
    it('should throw on NEW -> ACTIVE (skipping states)', () => {
      const ctx = sm.createContext();
      expect(() => sm.transitionTo(ctx.id, ContextState.CTX_ACTIVE))
        .toThrow(InvalidStateTransitionError);
    });

    it('should throw on NEW -> ROUTE_SET (skipping POLICY_EVAL)', () => {
      const ctx = sm.createContext();
      expect(() => sm.transitionTo(ctx.id, ContextState.CTX_ROUTE_SET))
        .toThrow(InvalidStateTransitionError);
    });

    it('should throw on POLICY_EVAL -> ACTIVE (skipping ROUTE_SET)', () => {
      const ctx = sm.createContext();
      sm.transitionTo(ctx.id, ContextState.CTX_POLICY_EVAL);
      expect(() => sm.transitionTo(ctx.id, ContextState.CTX_ACTIVE))
        .toThrow(InvalidStateTransitionError);
    });

    it('should throw on ACTIVE -> DRAINING (skipping ROTATING)', () => {
      const ctx = sm.createContext();
      sm.initializeContext(ctx.id);
      sm.activateContext(ctx.id);
      expect(() => sm.transitionTo(ctx.id, ContextState.CTX_DRAINING))
        .toThrow(InvalidStateTransitionError);
    });

    it('should throw on CLOSED -> anything (terminal state)', () => {
      const ctx = sm.createContext();
      sm.initializeContext(ctx.id);
      sm.activateContext(ctx.id);
      sm.transitionTo(ctx.id, ContextState.CTX_CLOSED);
      expect(() => sm.transitionTo(ctx.id, ContextState.CTX_ACTIVE))
        .toThrow(InvalidStateTransitionError);
    });

    it('should throw on ERROR -> anything (terminal state)', () => {
      const ctx = sm.createContext();
      sm.transitionTo(ctx.id, ContextState.CTX_ERROR);
      expect(() => sm.transitionTo(ctx.id, ContextState.CTX_NEW))
        .toThrow(InvalidStateTransitionError);
    });

    it('should set context to ERROR state on invalid transition attempt', () => {
      const ctx = sm.createContext();
      try {
        sm.transitionTo(ctx.id, ContextState.CTX_ACTIVE);
      } catch {
        // Expected
      }
      expect(ctx.state).toBe(ContextState.CTX_ERROR);
      expect(ctx.errorMessage).toContain('Invalid transition');
    });
  });

  describe('Full Initialization Flow', () => {
    it('should initialize context through NEW -> POLICY_EVAL -> ROUTE_SET', () => {
      const ctx = sm.createContext();
      expect(ctx.state).toBe(ContextState.CTX_NEW);

      sm.initializeContext(ctx.id);
      expect(ctx.state).toBe(ContextState.CTX_ROUTE_SET);
    });

    it('should activate context ROUTE_SET -> ACTIVE', () => {
      const ctx = sm.createContext();
      sm.initializeContext(ctx.id);
      sm.activateContext(ctx.id);
      expect(ctx.state).toBe(ContextState.CTX_ACTIVE);
      expect(ctx.active).toBe(true);
    });

    it('should throw when activating from wrong state', () => {
      const ctx = sm.createContext();
      // Don't call initializeContext, still in NEW state
      expect(() => sm.activateContext(ctx.id))
        .toThrow(InvalidContextStateError);
    });
  });

  describe('Identity Rotation Flow', () => {
    it('should complete full rotation cycle', () => {
      const ctx = sm.createContext();
      sm.initializeContext(ctx.id);
      sm.activateContext(ctx.id);
      
      const originalCreatedAt = ctx.createdAt;
      
      // Wait a bit to ensure timestamp difference
      vi.useFakeTimers();
      vi.advanceTimersByTime(100);
      
      sm.rotateIdentity(ctx.id);
      
      expect(ctx.state).toBe(ContextState.CTX_ACTIVE);
      expect(ctx.active).toBe(true);
      expect(ctx.createdAt).toBeGreaterThan(originalCreatedAt);
      
      vi.useRealTimers();
    });

    it('should update proxy during rotation if provided', () => {
      const ctx = sm.createContext({ type: 'direct' });
      sm.initializeContext(ctx.id);
      sm.activateContext(ctx.id);

      const newProxy: ProxyConfig = { type: 'socks5', host: '127.0.0.1', port: 9050 };
      sm.rotateIdentity(ctx.id, newProxy);

      expect(ctx.proxy).toEqual(newProxy);
    });

    it('should throw when rotating from non-ACTIVE state', () => {
      const ctx = sm.createContext();
      sm.initializeContext(ctx.id);
      // Context is in ROUTE_SET, not ACTIVE
      expect(() => sm.rotateIdentity(ctx.id))
        .toThrow(InvalidContextStateError);
    });
  });
});

describe('Interceptor State Enforcement', () => {
  let sm: TestableStateMachine;
  let interceptor: TestableInterceptor;

  beforeEach(() => {
    sm = new TestableStateMachine();
    interceptor = new TestableInterceptor(sm);
  });

  it('should NOT allow requests in CTX_NEW state', () => {
    const ctx = sm.createContext();
    const result = interceptor.interceptRequest(ctx.id, 'https://example.com');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('CTX_NEW');
  });

  it('should NOT allow requests in CTX_POLICY_EVAL state', () => {
    const ctx = sm.createContext();
    sm.transitionTo(ctx.id, ContextState.CTX_POLICY_EVAL);
    const result = interceptor.interceptRequest(ctx.id, 'https://example.com');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('CTX_POLICY_EVAL');
  });

  it('should NOT allow requests in CTX_ROUTE_SET state', () => {
    const ctx = sm.createContext();
    sm.initializeContext(ctx.id);
    const result = interceptor.interceptRequest(ctx.id, 'https://example.com');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('CTX_ROUTE_SET');
  });

  it('should ALLOW requests in CTX_ACTIVE state', () => {
    const ctx = sm.createContext();
    sm.initializeContext(ctx.id);
    sm.activateContext(ctx.id);
    const result = interceptor.interceptRequest(ctx.id, 'https://example.com');
    expect(result.allowed).toBe(true);
  });

  it('should NOT allow requests in CTX_ROTATING state', () => {
    const ctx = sm.createContext();
    sm.initializeContext(ctx.id);
    sm.activateContext(ctx.id);
    sm.transitionTo(ctx.id, ContextState.CTX_ROTATING);
    const result = interceptor.interceptRequest(ctx.id, 'https://example.com');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('CTX_ROTATING');
  });

  it('should NOT allow requests in CTX_DRAINING state', () => {
    const ctx = sm.createContext();
    sm.initializeContext(ctx.id);
    sm.activateContext(ctx.id);
    sm.transitionTo(ctx.id, ContextState.CTX_ROTATING);
    sm.transitionTo(ctx.id, ContextState.CTX_DRAINING);
    const result = interceptor.interceptRequest(ctx.id, 'https://example.com');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('CTX_DRAINING');
  });

  it('should NOT allow requests in CTX_CLOSED state', () => {
    const ctx = sm.createContext();
    sm.initializeContext(ctx.id);
    sm.activateContext(ctx.id);
    sm.transitionTo(ctx.id, ContextState.CTX_CLOSED);
    const result = interceptor.interceptRequest(ctx.id, 'https://example.com');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('CTX_CLOSED');
  });

  it('should NOT allow requests in CTX_ERROR state', () => {
    const ctx = sm.createContext();
    sm.setError(ctx.id, 'Some error');
    const result = interceptor.interceptRequest(ctx.id, 'https://example.com');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('CTX_ERROR');
  });

  it('should ALLOW requests after identity rotation completes', () => {
    const ctx = sm.createContext();
    sm.initializeContext(ctx.id);
    sm.activateContext(ctx.id);
    
    // Before rotation - should be allowed
    expect(interceptor.interceptRequest(ctx.id, 'https://example.com').allowed).toBe(true);
    
    // After rotation - should still be allowed
    sm.rotateIdentity(ctx.id);
    expect(interceptor.interceptRequest(ctx.id, 'https://example.com').allowed).toBe(true);
  });
});

describe('ProxyManager State Enforcement', () => {
  let sm: TestableStateMachine;
  let proxyManager: TestableProxyManager;

  beforeEach(() => {
    sm = new TestableStateMachine();
    proxyManager = new TestableProxyManager(sm);
  });

  it('should NOT allow setting proxy in CTX_NEW state', () => {
    const ctx = sm.createContext();
    const result = proxyManager.setProxy(ctx.id, { type: 'socks5', host: '127.0.0.1', port: 9050 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('CTX_NEW');
  });

  it('should NOT allow setting proxy in CTX_POLICY_EVAL state', () => {
    const ctx = sm.createContext();
    sm.transitionTo(ctx.id, ContextState.CTX_POLICY_EVAL);
    const result = proxyManager.setProxy(ctx.id, { type: 'socks5', host: '127.0.0.1', port: 9050 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('CTX_POLICY_EVAL');
  });

  it('should ALLOW setting proxy in CTX_ROUTE_SET state', () => {
    const ctx = sm.createContext();
    sm.initializeContext(ctx.id);
    expect(ctx.state).toBe(ContextState.CTX_ROUTE_SET);
    
    const result = proxyManager.setProxy(ctx.id, { type: 'socks5', host: '127.0.0.1', port: 9050 });
    expect(result.success).toBe(true);
    expect(ctx.proxy.type).toBe('socks5');
  });

  it('should NOT allow setting proxy in CTX_ACTIVE state', () => {
    const ctx = sm.createContext();
    sm.initializeContext(ctx.id);
    sm.activateContext(ctx.id);
    
    const result = proxyManager.setProxy(ctx.id, { type: 'http', host: '127.0.0.1', port: 8080 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('CTX_ACTIVE');
  });

  it('should report canSetProxy correctly', () => {
    const ctx = sm.createContext();
    expect(proxyManager.canSetProxy(ctx.id)).toBe(false);
    
    sm.transitionTo(ctx.id, ContextState.CTX_POLICY_EVAL);
    expect(proxyManager.canSetProxy(ctx.id)).toBe(false);
    
    sm.transitionTo(ctx.id, ContextState.CTX_ROUTE_SET);
    expect(proxyManager.canSetProxy(ctx.id)).toBe(true);
    
    sm.transitionTo(ctx.id, ContextState.CTX_ACTIVE);
    expect(proxyManager.canSetProxy(ctx.id)).toBe(false);
  });
});

describe('VALID_STATE_TRANSITIONS constant', () => {
  it('should define all states', () => {
    const definedStates = Object.keys(VALID_STATE_TRANSITIONS);
    const allStates = Object.values(ContextState);
    
    expect(definedStates.length).toBe(allStates.length);
    for (const state of allStates) {
      expect(VALID_STATE_TRANSITIONS[state]).toBeDefined();
    }
  });

  it('should allow ERROR transition from all non-terminal states', () => {
    const nonTerminalStates = [
      ContextState.CTX_NEW,
      ContextState.CTX_POLICY_EVAL,
      ContextState.CTX_ROUTE_SET,
      ContextState.CTX_ACTIVE,
      ContextState.CTX_ROTATING,
      ContextState.CTX_DRAINING,
      ContextState.CTX_CLOSED,
    ];

    for (const state of nonTerminalStates) {
      expect(VALID_STATE_TRANSITIONS[state]).toContain(ContextState.CTX_ERROR);
    }
  });

  it('should have ERROR as terminal state (no outgoing transitions)', () => {
    expect(VALID_STATE_TRANSITIONS[ContextState.CTX_ERROR]).toEqual([]);
  });
});


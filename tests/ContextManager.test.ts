/**
 * ContextManager Tests
 * 
 * Tests for the context isolation and management functionality.
 * Note: These tests mock Electron APIs since we're running in Node.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BrowserContext, ProxyConfig, ContextId, ContextState } from '../src/shared/types';

// Mock Electron's session module
vi.mock('electron', () => ({
  session: {
    fromPartition: vi.fn(() => ({
      cookies: {
        flushStore: vi.fn(),
      },
      webRequest: {
        onBeforeSendHeaders: vi.fn(),
      },
      clearStorageData: vi.fn().mockResolvedValue(undefined),
      clearCache: vi.fn().mockResolvedValue(undefined),
      clearAuthCache: vi.fn().mockResolvedValue(undefined),
    })),
  },
}));

// Simplified ContextManager for testing (without Electron dependencies)
// Updated to include state field
class TestableContextManager {
  private contexts: Map<ContextId, BrowserContext> = new Map();
  private idCounter = 0;

  createContext(proxyConfig?: ProxyConfig): BrowserContext {
    const id = `test-context-${++this.idCounter}`;
    const partition = `persist:liminal-${id}`;
    
    const context: BrowserContext = {
      id,
      partition,
      state: ContextState.CTX_NEW, // Start in NEW state
      proxy: proxyConfig || { type: 'direct' },
      createdAt: Date.now(),
      tabIds: [],
      active: false, // Not active until state is CTX_ACTIVE
    };

    this.contexts.set(id, context);
    return context;
  }

  getContext(contextId: ContextId): BrowserContext | undefined {
    return this.contexts.get(contextId);
  }

  getAllContexts(): BrowserContext[] {
    return Array.from(this.contexts.values()).filter(c => c.active);
  }

  addTabToContext(contextId: ContextId, tabId: number): boolean {
    const context = this.contexts.get(contextId);
    if (!context) return false;
    
    if (!context.tabIds.includes(tabId)) {
      context.tabIds.push(tabId);
    }
    return true;
  }

  removeTabFromContext(contextId: ContextId, tabId: number): boolean {
    const context = this.contexts.get(contextId);
    if (!context) return false;
    
    const index = context.tabIds.indexOf(tabId);
    if (index > -1) {
      context.tabIds.splice(index, 1);
    }
    return true;
  }

  // Simulate full initialization: NEW -> POLICY_EVAL -> ROUTE_SET -> ACTIVE
  initializeAndActivate(contextId: ContextId): BrowserContext | null {
    const context = this.contexts.get(contextId);
    if (!context) return null;
    
    context.state = ContextState.CTX_ACTIVE;
    context.active = true;
    return context;
  }

  async rotateIdentity(contextId: ContextId, newProxy?: ProxyConfig): Promise<BrowserContext | null> {
    const context = this.contexts.get(contextId);
    if (!context) return null;

    // Context must be active to rotate
    if (context.state !== ContextState.CTX_ACTIVE) {
      return null;
    }

    // Simulate clearing session data
    if (newProxy) {
      context.proxy = newProxy;
    }

    context.createdAt = Date.now();
    return context;
  }

  async destroyContext(contextId: ContextId): Promise<boolean> {
    const context = this.contexts.get(contextId);
    if (!context) return false;

    context.state = ContextState.CTX_CLOSED;
    context.active = false;
    this.contexts.delete(contextId);
    return true;
  }

  getStats(): { total: number; active: number; totalTabs: number } {
    const contexts = Array.from(this.contexts.values());
    return {
      total: contexts.length,
      active: contexts.filter(c => c.active).length,
      totalTabs: contexts.reduce((sum, c) => sum + c.tabIds.length, 0),
    };
  }
}

describe('ContextManager', () => {
  let manager: TestableContextManager;

  beforeEach(() => {
    manager = new TestableContextManager();
  });

  describe('createContext', () => {
    it('should create a new context with unique ID', () => {
      const ctx1 = manager.createContext();
      const ctx2 = manager.createContext();

      expect(ctx1.id).toBeDefined();
      expect(ctx2.id).toBeDefined();
      expect(ctx1.id).not.toBe(ctx2.id);
    });

    it('should create context with default direct proxy', () => {
      const ctx = manager.createContext();

      expect(ctx.proxy.type).toBe('direct');
    });

    it('should create context with custom proxy', () => {
      const proxy: ProxyConfig = {
        type: 'socks5',
        host: '127.0.0.1',
        port: 9050,
      };
      const ctx = manager.createContext(proxy);

      expect(ctx.proxy.type).toBe('socks5');
      expect(ctx.proxy.host).toBe('127.0.0.1');
      expect(ctx.proxy.port).toBe(9050);
    });

    it('should initialize context in CTX_NEW state', () => {
      const ctx = manager.createContext();

      expect(ctx.state).toBe(ContextState.CTX_NEW);
      expect(ctx.active).toBe(false);
    });

    it('should initialize context with correct defaults', () => {
      const before = Date.now();
      const ctx = manager.createContext();
      const after = Date.now();

      expect(ctx.tabIds).toEqual([]);
      expect(ctx.createdAt).toBeGreaterThanOrEqual(before);
      expect(ctx.createdAt).toBeLessThanOrEqual(after);
      expect(ctx.partition).toContain('persist:liminal-');
    });
  });

  describe('getContext', () => {
    it('should retrieve existing context', () => {
      const created = manager.createContext();
      const retrieved = manager.getContext(created.id);

      expect(retrieved).toEqual(created);
    });

    it('should return undefined for non-existent context', () => {
      const retrieved = manager.getContext('non-existent-id');

      expect(retrieved).toBeUndefined();
    });
  });

  describe('getAllContexts', () => {
    it('should return all active contexts', () => {
      const ctx1 = manager.createContext();
      const ctx2 = manager.createContext();
      const ctx3 = manager.createContext();

      // Activate all contexts
      manager.initializeAndActivate(ctx1.id);
      manager.initializeAndActivate(ctx2.id);
      manager.initializeAndActivate(ctx3.id);

      const all = manager.getAllContexts();

      expect(all.length).toBe(3);
    });

    it('should not return inactive contexts', async () => {
      const ctx1 = manager.createContext();
      const ctx2 = manager.createContext();

      manager.initializeAndActivate(ctx1.id);
      manager.initializeAndActivate(ctx2.id);

      await manager.destroyContext(ctx1.id);

      const all = manager.getAllContexts();

      expect(all.length).toBe(1);
    });

    it('should not return contexts that are not yet active', () => {
      manager.createContext(); // Not activated
      const ctx2 = manager.createContext();
      manager.initializeAndActivate(ctx2.id); // Activated

      const all = manager.getAllContexts();

      expect(all.length).toBe(1);
    });
  });

  describe('addTabToContext', () => {
    it('should add tab ID to context', () => {
      const ctx = manager.createContext();
      const result = manager.addTabToContext(ctx.id, 100);

      expect(result).toBe(true);
      expect(ctx.tabIds).toContain(100);
    });

    it('should not add duplicate tab IDs', () => {
      const ctx = manager.createContext();
      manager.addTabToContext(ctx.id, 100);
      manager.addTabToContext(ctx.id, 100);

      expect(ctx.tabIds.length).toBe(1);
    });

    it('should return false for non-existent context', () => {
      const result = manager.addTabToContext('fake-id', 100);

      expect(result).toBe(false);
    });
  });

  describe('removeTabFromContext', () => {
    it('should remove tab ID from context', () => {
      const ctx = manager.createContext();
      manager.addTabToContext(ctx.id, 100);
      manager.addTabToContext(ctx.id, 200);

      const result = manager.removeTabFromContext(ctx.id, 100);

      expect(result).toBe(true);
      expect(ctx.tabIds).not.toContain(100);
      expect(ctx.tabIds).toContain(200);
    });

    it('should handle removing non-existent tab ID', () => {
      const ctx = manager.createContext();
      const result = manager.removeTabFromContext(ctx.id, 999);

      expect(result).toBe(true);
    });

    it('should return false for non-existent context', () => {
      const result = manager.removeTabFromContext('fake-id', 100);

      expect(result).toBe(false);
    });
  });

  describe('rotateIdentity', () => {
    it('should update createdAt timestamp', async () => {
      const ctx = manager.createContext();
      manager.initializeAndActivate(ctx.id);
      const originalTime = ctx.createdAt;

      // Small delay to ensure time difference
      await new Promise(r => setTimeout(r, 10));

      await manager.rotateIdentity(ctx.id);

      expect(ctx.createdAt).toBeGreaterThan(originalTime);
    });

    it('should update proxy if provided', async () => {
      const ctx = manager.createContext({ type: 'direct' });
      manager.initializeAndActivate(ctx.id);
      const newProxy: ProxyConfig = {
        type: 'http',
        host: 'proxy.example.com',
        port: 8080,
      };

      await manager.rotateIdentity(ctx.id, newProxy);

      expect(ctx.proxy.type).toBe('http');
      expect(ctx.proxy.host).toBe('proxy.example.com');
    });

    it('should keep existing proxy if none provided', async () => {
      const originalProxy: ProxyConfig = {
        type: 'socks5',
        host: '127.0.0.1',
        port: 9050,
      };
      const ctx = manager.createContext(originalProxy);
      manager.initializeAndActivate(ctx.id);

      await manager.rotateIdentity(ctx.id);

      expect(ctx.proxy).toEqual(originalProxy);
    });

    it('should return null for non-existent context', async () => {
      const result = await manager.rotateIdentity('fake-id');

      expect(result).toBeNull();
    });

    it('should return null if context is not in ACTIVE state', async () => {
      const ctx = manager.createContext();
      // Context is in NEW state, not ACTIVE
      const result = await manager.rotateIdentity(ctx.id);

      expect(result).toBeNull();
    });
  });

  describe('destroyContext', () => {
    it('should remove context from manager', async () => {
      const ctx = manager.createContext();
      manager.initializeAndActivate(ctx.id);

      const result = await manager.destroyContext(ctx.id);

      expect(result).toBe(true);
      expect(manager.getContext(ctx.id)).toBeUndefined();
    });

    it('should return false for non-existent context', async () => {
      const result = await manager.destroyContext('fake-id');

      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const ctx1 = manager.createContext();
      const ctx2 = manager.createContext();
      
      manager.initializeAndActivate(ctx1.id);
      manager.initializeAndActivate(ctx2.id);
      
      manager.addTabToContext(ctx1.id, 1);
      manager.addTabToContext(ctx1.id, 2);
      manager.addTabToContext(ctx2.id, 3);

      const stats = manager.getStats();

      expect(stats.total).toBe(2);
      expect(stats.active).toBe(2);
      expect(stats.totalTabs).toBe(3);
    });
  });

  describe('Context Isolation', () => {
    it('should create unique partitions for each context', () => {
      const ctx1 = manager.createContext();
      const ctx2 = manager.createContext();

      expect(ctx1.partition).not.toBe(ctx2.partition);
      expect(ctx1.partition).toContain(ctx1.id);
      expect(ctx2.partition).toContain(ctx2.id);
    });

    it('should maintain separate tab lists per context', () => {
      const ctx1 = manager.createContext();
      const ctx2 = manager.createContext();

      manager.addTabToContext(ctx1.id, 100);
      manager.addTabToContext(ctx2.id, 200);

      expect(ctx1.tabIds).toContain(100);
      expect(ctx1.tabIds).not.toContain(200);
      expect(ctx2.tabIds).toContain(200);
      expect(ctx2.tabIds).not.toContain(100);
    });
  });
});

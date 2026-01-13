/**
 * ProxyManager - Per-context Proxy Support
 * 
 * Manages proxy configurations for each browser context.
 * Supports SOCKS5 and HTTP proxies.
 * 
 * State Machine Integration:
 * - Proxy can only be set when context is in CTX_ROUTE_SET state
 */

import { Session } from 'electron';
import { ContextId, ProxyConfig, ContextState } from '../../shared/types';
import { getContextManager, InvalidContextStateError } from './ContextManager';

export class ProxyManager {
  private proxyConfigs: Map<ContextId, ProxyConfig> = new Map();

  /**
   * Convert ProxyConfig to Electron proxy rules string
   */
  private toProxyRules(config: ProxyConfig): string {
    if (config.type === 'direct' || !config.host || !config.port) {
      return 'direct://';
    }

    const protocol = config.type === 'socks5' ? 'socks5' : 'http';
    
    if (config.username && config.password) {
      return `${protocol}://${config.username}:${config.password}@${config.host}:${config.port}`;
    }
    
    return `${protocol}://${config.host}:${config.port}`;
  }

  /**
   * Set proxy for a context
   * Only allowed when context is in CTX_ROUTE_SET state
   */
  async setProxy(contextId: ContextId, config: ProxyConfig): Promise<{ success: boolean; error?: string }> {
    const contextManager = getContextManager();
    const session = contextManager.getSession(contextId);
    const context = contextManager.getContext(contextId);

    if (!session || !context) {
      return { success: false, error: `Context ${contextId} not found` };
    }

    // Enforce state check: proxy can only be set in CTX_ROUTE_SET state
    if (context.state !== ContextState.CTX_ROUTE_SET) {
      const error = new InvalidContextStateError(
        contextId,
        context.state,
        ContextState.CTX_ROUTE_SET,
        'set proxy'
      );
      console.error(error.message);
      return { success: false, error: error.message };
    }

    try {
      const proxyRules = this.toProxyRules(config);
      
      await session.setProxy({
        proxyRules,
        proxyBypassRules: '<local>', // Bypass proxy for localhost
      });

      // Update stored config
      this.proxyConfigs.set(contextId, config);
      context.proxy = config;

      console.log(`Proxy set for context ${contextId}: ${config.type}`);
      return { success: true };
    } catch (error) {
      console.error(`Failed to set proxy for context ${contextId}:`, error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Set proxy during identity rotation (internal use)
   * Allowed during CTX_ROUTE_SET state after rotation draining
   */
  async setProxyInternal(contextId: ContextId, config: ProxyConfig): Promise<boolean> {
    const contextManager = getContextManager();
    const session = contextManager.getSession(contextId);
    const context = contextManager.getContext(contextId);

    if (!session || !context) {
      return false;
    }

    try {
      const proxyRules = this.toProxyRules(config);
      
      await session.setProxy({
        proxyRules,
        proxyBypassRules: '<local>',
      });

      this.proxyConfigs.set(contextId, config);
      context.proxy = config;
      return true;
    } catch (error) {
      console.error(`Failed to set proxy for context ${contextId}:`, error);
      return false;
    }
  }

  /**
   * Get proxy configuration for a context
   */
  getProxy(contextId: ContextId): ProxyConfig | undefined {
    return this.proxyConfigs.get(contextId);
  }

  /**
   * Clear proxy for a context (set to direct)
   * Only allowed in CTX_ROUTE_SET state
   */
  async clearProxy(contextId: ContextId): Promise<{ success: boolean; error?: string }> {
    return this.setProxy(contextId, { type: 'direct' });
  }

  /**
   * Remove proxy configuration when context is destroyed
   */
  removeContext(contextId: ContextId): void {
    this.proxyConfigs.delete(contextId);
  }

  /**
   * Validate proxy configuration
   */
  validateConfig(config: ProxyConfig): { valid: boolean; error?: string } {
    if (config.type === 'direct') {
      return { valid: true };
    }

    if (!config.host) {
      return { valid: false, error: 'Proxy host is required' };
    }

    if (!config.port || config.port < 1 || config.port > 65535) {
      return { valid: false, error: 'Valid proxy port (1-65535) is required' };
    }

    if (config.type !== 'socks5' && config.type !== 'http') {
      return { valid: false, error: 'Proxy type must be socks5 or http' };
    }

    // If username is provided, password should also be provided
    if (config.username && !config.password) {
      return { valid: false, error: 'Password is required when username is provided' };
    }

    return { valid: true };
  }

  /**
   * Parse proxy URL string to ProxyConfig
   */
  parseProxyUrl(url: string): ProxyConfig | null {
    try {
      // Handle direct
      if (url === 'direct' || url === 'direct://') {
        return { type: 'direct' };
      }

      const parsed = new URL(url);
      const type = parsed.protocol.replace(':', '') as 'socks5' | 'http';
      
      if (type !== 'socks5' && type !== 'http') {
        return null;
      }

      return {
        type,
        host: parsed.hostname,
        port: parseInt(parsed.port, 10),
        username: parsed.username || undefined,
        password: parsed.password || undefined,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get all proxy configurations
   */
  getAllProxies(): Map<ContextId, ProxyConfig> {
    return new Map(this.proxyConfigs);
  }

  /**
   * Check if setting proxy is allowed for a context
   */
  canSetProxy(contextId: ContextId): boolean {
    const contextManager = getContextManager();
    return contextManager.isInState(contextId, ContextState.CTX_ROUTE_SET);
  }
}

// Singleton instance
let instance: ProxyManager | null = null;

export function getProxyManager(): ProxyManager {
  if (!instance) {
    instance = new ProxyManager();
  }
  return instance;
}

export function resetProxyManager(): void {
  instance = null;
}

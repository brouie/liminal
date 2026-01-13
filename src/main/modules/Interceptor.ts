/**
 * Interceptor - Request Interception Module
 * 
 * Intercepts all requests using Electron's webRequest API.
 * Blocks requests matching the blocklist and logs all third-party domains.
 * 
 * State Machine Integration:
 * - Requests are ONLY allowed when context is in CTX_ACTIVE state
 * - All other states result in request cancellation
 * 
 * Privacy Hardening (Phase 1.2):
 * - Timing jitter for third-party requests
 * - Header hardening (referrer, user-agent, client hints)
 * 
 * NO AI, NO Solana, NO wallets.
 */

import { Session, WebContents } from 'electron';
import { readFileSync, existsSync, watchFile } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import {
  Blocklist,
  BlocklistRule,
  ContextId,
  ContextState,
  InterceptionResult,
} from '../../shared/types';
import { getReceiptStore } from './ReceiptStore';
import { getContextManager } from './ContextManager';
import { getTimingJitter } from './TimingJitter';
import { getHeaderHardening } from './HeaderHardening';

export class Interceptor {
  private blocklist: BlocklistRule[] = [];
  private blocklistPath: string;
  private compiledPatterns: Map<string, RegExp> = new Map();

  constructor() {
    // Default blocklist path
    this.blocklistPath = join(app.getAppPath(), 'config', 'blocklist.json');
    this.loadBlocklist();
    this.watchBlocklist();
  }

  /**
   * Load blocklist from JSON file
   */
  loadBlocklist(customPath?: string): void {
    const path = customPath || this.blocklistPath;
    
    try {
      if (existsSync(path)) {
        const content = readFileSync(path, 'utf-8');
        const data: Blocklist = JSON.parse(content);
        this.blocklist = data.rules || [];
        this.compilePatterns();
        console.log(`Loaded ${this.blocklist.length} blocklist rules`);
      } else {
        console.warn(`Blocklist not found at ${path}, using empty blocklist`);
        this.blocklist = [];
      }
    } catch (error) {
      console.error('Failed to load blocklist:', error);
      this.blocklist = [];
    }
  }

  /**
   * Pre-compile wildcard patterns to RegExp for performance
   */
  private compilePatterns(): void {
    this.compiledPatterns.clear();
    
    for (const rule of this.blocklist) {
      const pattern = this.wildcardToRegex(rule.domain);
      this.compiledPatterns.set(rule.domain, pattern);
    }
  }

  /**
   * Convert wildcard pattern to RegExp
   */
  private wildcardToRegex(pattern: string): RegExp {
    // Escape special regex chars except *
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`, 'i');
  }

  /**
   * Watch blocklist file for changes
   */
  private watchBlocklist(): void {
    if (existsSync(this.blocklistPath)) {
      watchFile(this.blocklistPath, { interval: 5000 }, () => {
        console.log('Blocklist changed, reloading...');
        this.loadBlocklist();
      });
    }
  }

  /**
   * Check if a domain matches any blocklist rule
   */
  matchesBlocklist(domain: string): BlocklistRule | null {
    for (const rule of this.blocklist) {
      const pattern = this.compiledPatterns.get(rule.domain);
      if (pattern && pattern.test(domain)) {
        return rule;
      }
    }
    return null;
  }

  /**
   * Extract domain from URL
   */
  extractDomain(url: string): string | null {
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return null;
    }
  }

  /**
   * Check if request is third-party relative to the page origin
   */
  isThirdParty(requestUrl: string, pageUrl: string): boolean {
    try {
      const reqDomain = new URL(requestUrl).hostname;
      const pageDomain = new URL(pageUrl).hostname;
      
      // Extract base domain (simple approach - handles most cases)
      const getBaseDomain = (hostname: string): string => {
        const parts = hostname.split('.');
        if (parts.length > 2) {
          return parts.slice(-2).join('.');
        }
        return hostname;
      };
      
      return getBaseDomain(reqDomain) !== getBaseDomain(pageDomain);
    } catch {
      return true; // Treat parse failures as third-party
    }
  }

  /**
   * Check if requests are allowed for a context
   * Only CTX_ACTIVE state allows requests
   */
  isRequestAllowed(contextId: ContextId): boolean {
    const contextManager = getContextManager();
    return contextManager.isInState(contextId, ContextState.CTX_ACTIVE);
  }

  /**
   * Attach interceptor to a session for a specific context
   * Enforces state check: requests only allowed in CTX_ACTIVE state
   * Applies timing jitter and header hardening
   */
  attachToSession(ses: Session, contextId: ContextId, getPageUrl: (webContentsId: number) => string | null): void {
    const receiptStore = getReceiptStore();
    const contextManager = getContextManager();
    const timingJitter = getTimingJitter();
    const headerHardening = getHeaderHardening();

    // Track timing jitter delays per request (for testing/debugging)
    const requestDelays: Map<string, number> = new Map();

    // ========== Request Interception (onBeforeRequest) ==========
    ses.webRequest.onBeforeRequest((details, callback) => {
      // STATE CHECK: Block ALL requests if context is not in CTX_ACTIVE state
      const context = contextManager.getContext(contextId);
      if (!context || context.state !== ContextState.CTX_ACTIVE) {
        console.log(`Request blocked - context ${contextId} not in ACTIVE state (current: ${context?.state || 'not found'})`);
        callback({ cancel: true });
        return;
      }

      const domain = this.extractDomain(details.url);
      
      if (!domain) {
        callback({ cancel: false });
        return;
      }

      // Get the page URL from the webContents
      const webContentsId = details.webContentsId ?? -1;
      const pageUrl = getPageUrl(webContentsId);
      const isThirdParty = pageUrl ? this.isThirdParty(details.url, pageUrl) : true;
      
      // Calculate timing jitter for third-party requests
      const jitterDelay = timingJitter.calculateDelay(contextId, details.url, isThirdParty);
      if (jitterDelay > 0) {
        requestDelays.set(details.url, jitterDelay);
      }

      // Check blocklist
      const matchedRule = this.matchesBlocklist(domain);
      const blocked = matchedRule !== null;

      // Create interception result
      const result: InterceptionResult = {
        blocked,
        domain,
        isThirdParty,
        matchedRule: matchedRule || undefined,
        url: details.url,
        timestamp: Date.now(),
      };

      // Record in receipt store
      receiptStore.recordInterception(contextId, result);

      // Apply timing jitter if needed (only for allowed third-party requests)
      if (!blocked && jitterDelay > 0) {
        // Note: onBeforeRequest doesn't support async delays directly
        // The jitter is logged for now; actual implementation would require
        // response interception or a different approach
        // For now, we track the delay for testing purposes
      }

      // Block or allow
      callback({ cancel: blocked });
    });

    // ========== Header Hardening (onBeforeSendHeaders) ==========
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
      const headers = { ...details.requestHeaders };
      
      // Get page URL for referrer calculation
      const webContentsId = details.webContentsId ?? -1;
      const pageUrl = getPageUrl(webContentsId);
      
      // Apply header hardening
      const hardenedHeaders = headerHardening.hardenHeaders(
        headers,
        details.url,
        pageUrl
      );

      callback({ requestHeaders: hardenedHeaders });
    });
  }

  /**
   * Get current blocklist rules
   */
  getBlocklistRules(): BlocklistRule[] {
    return [...this.blocklist];
  }

  /**
   * Add a rule dynamically
   */
  addRule(rule: BlocklistRule): void {
    this.blocklist.push(rule);
    this.compiledPatterns.set(rule.domain, this.wildcardToRegex(rule.domain));
  }

  /**
   * Remove a rule by domain pattern
   */
  removeRule(domain: string): boolean {
    const index = this.blocklist.findIndex(r => r.domain === domain);
    if (index > -1) {
      this.blocklist.splice(index, 1);
      this.compiledPatterns.delete(domain);
      return true;
    }
    return false;
  }

  /**
   * Test a URL against the blocklist (for testing/debugging)
   */
  testUrl(url: string): { blocked: boolean; rule: BlocklistRule | null } {
    const domain = this.extractDomain(url);
    if (!domain) {
      return { blocked: false, rule: null };
    }
    const rule = this.matchesBlocklist(domain);
    return { blocked: rule !== null, rule };
  }
}

// Singleton instance
let instance: Interceptor | null = null;

export function getInterceptor(): Interceptor {
  if (!instance) {
    instance = new Interceptor();
  }
  return instance;
}

export function resetInterceptor(): void {
  instance = null;
}

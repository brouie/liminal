/**
 * Interceptor Tests
 * 
 * Tests for the request interception and blocklist rule evaluation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BlocklistRule } from '../src/shared/types';

// Simplified Interceptor for testing (without Electron/fs dependencies)
class TestableInterceptor {
  private blocklist: BlocklistRule[] = [];
  private compiledPatterns: Map<string, RegExp> = new Map();

  constructor(rules: BlocklistRule[] = []) {
    this.blocklist = rules;
    this.compilePatterns();
  }

  loadRules(rules: BlocklistRule[]): void {
    this.blocklist = rules;
    this.compilePatterns();
  }

  private compilePatterns(): void {
    this.compiledPatterns.clear();
    
    for (const rule of this.blocklist) {
      const pattern = this.wildcardToRegex(rule.domain);
      this.compiledPatterns.set(rule.domain, pattern);
    }
  }

  private wildcardToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`, 'i');
  }

  matchesBlocklist(domain: string): BlocklistRule | null {
    for (const rule of this.blocklist) {
      const pattern = this.compiledPatterns.get(rule.domain);
      if (pattern && pattern.test(domain)) {
        return rule;
      }
    }
    return null;
  }

  extractDomain(url: string): string | null {
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return null;
    }
  }

  isThirdParty(requestUrl: string, pageUrl: string): boolean {
    try {
      const reqDomain = new URL(requestUrl).hostname;
      const pageDomain = new URL(pageUrl).hostname;
      
      const getBaseDomain = (hostname: string): string => {
        const parts = hostname.split('.');
        if (parts.length > 2) {
          return parts.slice(-2).join('.');
        }
        return hostname;
      };
      
      return getBaseDomain(reqDomain) !== getBaseDomain(pageDomain);
    } catch {
      return true;
    }
  }

  testUrl(url: string): { blocked: boolean; rule: BlocklistRule | null } {
    const domain = this.extractDomain(url);
    if (!domain) {
      return { blocked: false, rule: null };
    }
    const rule = this.matchesBlocklist(domain);
    return { blocked: rule !== null, rule };
  }

  addRule(rule: BlocklistRule): void {
    this.blocklist.push(rule);
    this.compiledPatterns.set(rule.domain, this.wildcardToRegex(rule.domain));
  }

  removeRule(domain: string): boolean {
    const index = this.blocklist.findIndex(r => r.domain === domain);
    if (index > -1) {
      this.blocklist.splice(index, 1);
      this.compiledPatterns.delete(domain);
      return true;
    }
    return false;
  }

  getBlocklistRules(): BlocklistRule[] {
    return [...this.blocklist];
  }
}

describe('Interceptor', () => {
  let interceptor: TestableInterceptor;

  const defaultRules: BlocklistRule[] = [
    { domain: '*.doubleclick.net', category: 'advertising' },
    { domain: '*.google-analytics.com', category: 'tracking' },
    { domain: 'facebook.com', category: 'tracking' },
    { domain: '*.facebook.net', category: 'tracking' },
    { domain: 'tracker.example.com', category: 'tracking' },
    { domain: '*.ads.*', category: 'advertising' },
  ];

  beforeEach(() => {
    interceptor = new TestableInterceptor(defaultRules);
  });

  describe('Domain Extraction', () => {
    it('should extract domain from HTTP URL', () => {
      const domain = interceptor.extractDomain('http://example.com/path');
      expect(domain).toBe('example.com');
    });

    it('should extract domain from HTTPS URL', () => {
      const domain = interceptor.extractDomain('https://www.example.com/path?query=1');
      expect(domain).toBe('www.example.com');
    });

    it('should extract domain with port', () => {
      const domain = interceptor.extractDomain('https://example.com:8080/path');
      expect(domain).toBe('example.com');
    });

    it('should return null for invalid URL', () => {
      const domain = interceptor.extractDomain('not-a-valid-url');
      expect(domain).toBeNull();
    });

    it('should handle IP addresses', () => {
      const domain = interceptor.extractDomain('http://192.168.1.1/path');
      expect(domain).toBe('192.168.1.1');
    });
  });

  describe('Wildcard Pattern Matching', () => {
    it('should match exact domain', () => {
      const result = interceptor.matchesBlocklist('facebook.com');
      expect(result).not.toBeNull();
      expect(result?.domain).toBe('facebook.com');
    });

    it('should match wildcard subdomain pattern', () => {
      const result = interceptor.matchesBlocklist('ads.doubleclick.net');
      expect(result).not.toBeNull();
      expect(result?.domain).toBe('*.doubleclick.net');
    });

    it('should match multiple subdomain levels with single wildcard', () => {
      const result = interceptor.matchesBlocklist('pagead2.googlesyndication.doubleclick.net');
      expect(result).not.toBeNull();
    });

    it('should match middle wildcard pattern', () => {
      const result = interceptor.matchesBlocklist('cdn.ads.example.com');
      expect(result).not.toBeNull();
      expect(result?.category).toBe('advertising');
    });

    it('should not match partial domain names', () => {
      const result = interceptor.matchesBlocklist('notfacebook.com');
      expect(result).toBeNull();
    });

    it('should not match unrelated domains', () => {
      const result = interceptor.matchesBlocklist('example.org');
      expect(result).toBeNull();
    });

    it('should be case-insensitive', () => {
      const result = interceptor.matchesBlocklist('ADS.DOUBLECLICK.NET');
      expect(result).not.toBeNull();
    });
  });

  describe('URL Testing', () => {
    it('should block URL matching blocklist', () => {
      const result = interceptor.testUrl('https://www.google-analytics.com/analytics.js');
      expect(result.blocked).toBe(true);
      expect(result.rule?.category).toBe('tracking');
    });

    it('should allow URL not matching blocklist', () => {
      const result = interceptor.testUrl('https://example.com/page.html');
      expect(result.blocked).toBe(false);
      expect(result.rule).toBeNull();
    });

    it('should not block invalid URLs', () => {
      const result = interceptor.testUrl('invalid-url');
      expect(result.blocked).toBe(false);
    });
  });

  describe('Third-Party Detection', () => {
    it('should identify cross-domain requests as third-party', () => {
      const result = interceptor.isThirdParty(
        'https://tracker.com/pixel.gif',
        'https://example.com/page.html'
      );
      expect(result).toBe(true);
    });

    it('should identify same-domain requests as first-party', () => {
      const result = interceptor.isThirdParty(
        'https://example.com/script.js',
        'https://example.com/page.html'
      );
      expect(result).toBe(false);
    });

    it('should treat subdomains as first-party', () => {
      const result = interceptor.isThirdParty(
        'https://cdn.example.com/script.js',
        'https://www.example.com/page.html'
      );
      expect(result).toBe(false);
    });

    it('should identify different subdomains as first-party (same base domain)', () => {
      const result = interceptor.isThirdParty(
        'https://api.example.com/data',
        'https://app.example.com/page.html'
      );
      expect(result).toBe(false);
    });

    it('should treat invalid URLs as third-party', () => {
      const result = interceptor.isThirdParty(
        'invalid-url',
        'https://example.com/page.html'
      );
      expect(result).toBe(true);
    });
  });

  describe('Dynamic Rule Management', () => {
    it('should add new rule', () => {
      const newRule: BlocklistRule = {
        domain: 'newtracker.com',
        category: 'tracking',
      };

      interceptor.addRule(newRule);
      const result = interceptor.matchesBlocklist('newtracker.com');

      expect(result).not.toBeNull();
      expect(result?.domain).toBe('newtracker.com');
    });

    it('should remove existing rule', () => {
      const result1 = interceptor.matchesBlocklist('facebook.com');
      expect(result1).not.toBeNull();

      const removed = interceptor.removeRule('facebook.com');
      expect(removed).toBe(true);

      const result2 = interceptor.matchesBlocklist('facebook.com');
      expect(result2).toBeNull();
    });

    it('should return false when removing non-existent rule', () => {
      const removed = interceptor.removeRule('nonexistent.com');
      expect(removed).toBe(false);
    });

    it('should return copy of blocklist rules', () => {
      const rules = interceptor.getBlocklistRules();
      rules.push({ domain: 'test.com', category: 'test' });

      // Original should not be modified
      expect(interceptor.getBlocklistRules().length).toBe(defaultRules.length);
    });
  });

  describe('Category Classification', () => {
    it('should return correct category for advertising', () => {
      const result = interceptor.matchesBlocklist('pagead.doubleclick.net');
      expect(result?.category).toBe('advertising');
    });

    it('should return correct category for tracking', () => {
      const result = interceptor.matchesBlocklist('www.google-analytics.com');
      expect(result?.category).toBe('tracking');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty blocklist', () => {
      const emptyInterceptor = new TestableInterceptor([]);
      const result = emptyInterceptor.matchesBlocklist('anything.com');
      expect(result).toBeNull();
    });

    it('should handle domains with many subdomains', () => {
      const result = interceptor.matchesBlocklist('a.b.c.d.doubleclick.net');
      expect(result).not.toBeNull();
    });

    it('should handle very long domain names', () => {
      const longDomain = 'a'.repeat(50) + '.example.com';
      const result = interceptor.matchesBlocklist(longDomain);
      expect(result).toBeNull();
    });

    it('should handle punycode domains', () => {
      const result = interceptor.extractDomain('https://xn--n3h.com/path');
      expect(result).toBe('xn--n3h.com');
    });

    it('should handle URLs with authentication', () => {
      const domain = interceptor.extractDomain('https://user:pass@example.com/path');
      expect(domain).toBe('example.com');
    });
  });

  describe('Pattern Edge Cases', () => {
    it('should not match when wildcard is at wrong position', () => {
      // *.facebook.net should NOT match facebook.net directly
      const interceptor2 = new TestableInterceptor([
        { domain: '*.test.com', category: 'test' }
      ]);
      
      // test.com alone should not match *.test.com
      const result = interceptor2.matchesBlocklist('test.com');
      expect(result).toBeNull();
      
      // sub.test.com should match
      const result2 = interceptor2.matchesBlocklist('sub.test.com');
      expect(result2).not.toBeNull();
    });

    it('should handle patterns with special regex characters', () => {
      const interceptor2 = new TestableInterceptor([
        { domain: 'example.com', category: 'test' }, // . is special in regex
      ]);
      
      const result = interceptor2.matchesBlocklist('exampleXcom');
      expect(result).toBeNull(); // Should not match because . is escaped
    });
  });
});

describe('Blocklist Rule Evaluation Performance', () => {
  it('should handle large blocklist efficiently', () => {
    // Create a large blocklist
    const largeBlocklist: BlocklistRule[] = [];
    for (let i = 0; i < 10000; i++) {
      largeBlocklist.push({
        domain: `tracker${i}.example${i % 100}.com`,
        category: 'tracking',
      });
    }
    largeBlocklist.push({
      domain: '*.target-domain.com',
      category: 'target',
    });

    const interceptor = new TestableInterceptor(largeBlocklist);

    const start = performance.now();
    
    // Test 1000 lookups
    for (let i = 0; i < 1000; i++) {
      interceptor.matchesBlocklist(`sub${i}.target-domain.com`);
    }
    
    const elapsed = performance.now() - start;
    
    // Should complete in reasonable time (less than 5 seconds for 1000 lookups on slow machines)
    expect(elapsed).toBeLessThan(5000);
  });
});


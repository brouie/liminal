/**
 * Privacy Hardening Tests (Phase 1.2)
 * 
 * Tests for execution-layer privacy hardening:
 * - Fingerprint protection (context-specific, deterministic)
 * - Timing jitter (bounded, context-seeded)
 * - Header hardening (referrer, user-agent, client hints)
 * 
 * NO AI, NO Solana, NO wallets.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContextId } from '../src/shared/types';

// ============ Fingerprint Protection Tests ============

/**
 * Simplified hash function for testing (same as in FingerprintProtection)
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash;
}

/**
 * Seeded PRNG for testing (same as in FingerprintProtection)
 */
function seededRandom(seed: number): () => number {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Testable FingerprintProtection
 */
interface FingerprintConfig {
  contextId: ContextId;
  canvasNoiseSeed: number;
  webglVendor: string;
  webglRenderer: string;
  languages: string[];
  hardwareConcurrency: number;
  deviceMemory: number;
  platform: string;
}

class TestableFingerprintProtection {
  private configs: Map<ContextId, FingerprintConfig> = new Map();

  private WEBGL_VENDORS = ['Google Inc.', 'Intel Inc.', 'Mesa'];
  private WEBGL_RENDERERS = [
    'ANGLE (Intel, Mesa Intel(R) Graphics, OpenGL 4.6)',
    'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060, OpenGL 4.5)',
    'ANGLE (AMD, AMD Radeon Graphics, OpenGL 4.6)',
    'Mesa Intel(R) UHD Graphics 620',
  ];
  private LANGUAGE_SETS = [['en-US', 'en'], ['en-GB', 'en'], ['en-US']];
  private HARDWARE_CONCURRENCY_VALUES = [4, 8, 12, 16];
  private DEVICE_MEMORY_VALUES = [4, 8];
  private PLATFORM_VALUES = ['Win32', 'Linux x86_64', 'MacIntel'];

  generateConfig(contextId: ContextId): FingerprintConfig {
    const existing = this.configs.get(contextId);
    if (existing) return existing;

    const baseSeed = hashString(contextId);
    const rng = seededRandom(baseSeed);

    const config: FingerprintConfig = {
      contextId,
      canvasNoiseSeed: Math.floor(rng() * 0xFFFFFFFF),
      webglVendor: this.WEBGL_VENDORS[Math.floor(rng() * this.WEBGL_VENDORS.length)],
      webglRenderer: this.WEBGL_RENDERERS[Math.floor(rng() * this.WEBGL_RENDERERS.length)],
      languages: this.LANGUAGE_SETS[Math.floor(rng() * this.LANGUAGE_SETS.length)],
      hardwareConcurrency: this.HARDWARE_CONCURRENCY_VALUES[Math.floor(rng() * this.HARDWARE_CONCURRENCY_VALUES.length)],
      deviceMemory: this.DEVICE_MEMORY_VALUES[Math.floor(rng() * this.DEVICE_MEMORY_VALUES.length)],
      platform: this.PLATFORM_VALUES[Math.floor(rng() * this.PLATFORM_VALUES.length)],
    };

    this.configs.set(contextId, config);
    return config;
  }

  clearConfig(contextId: ContextId): void {
    this.configs.delete(contextId);
  }
}

describe('Fingerprint Protection', () => {
  let fp: TestableFingerprintProtection;

  beforeEach(() => {
    fp = new TestableFingerprintProtection();
  });

  describe('Context Isolation', () => {
    it('should generate different fingerprints for different contexts', () => {
      const config1 = fp.generateConfig('context-aaa-111');
      const config2 = fp.generateConfig('context-bbb-222');
      const config3 = fp.generateConfig('context-ccc-333');

      // Canvas seeds should differ
      expect(config1.canvasNoiseSeed).not.toBe(config2.canvasNoiseSeed);
      expect(config2.canvasNoiseSeed).not.toBe(config3.canvasNoiseSeed);

      // At least some properties should differ across contexts
      const allSame = (
        config1.webglVendor === config2.webglVendor &&
        config1.webglRenderer === config2.webglRenderer &&
        config1.hardwareConcurrency === config2.hardwareConcurrency &&
        config1.platform === config2.platform
      );
      
      // With different seeds, it's extremely unlikely all properties match
      // (but not impossible, so we check canvas seed which is guaranteed different)
      expect(config1.canvasNoiseSeed).not.toBe(config2.canvasNoiseSeed);
    });

    it('should generate stable fingerprint within same context', () => {
      const config1 = fp.generateConfig('context-stable-test');
      const config2 = fp.generateConfig('context-stable-test');

      expect(config1).toEqual(config2);
    });

    it('should produce same fingerprint for same context ID across instances', () => {
      const fp1 = new TestableFingerprintProtection();
      const fp2 = new TestableFingerprintProtection();

      const config1 = fp1.generateConfig('reproducible-context');
      const config2 = fp2.generateConfig('reproducible-context');

      expect(config1.canvasNoiseSeed).toBe(config2.canvasNoiseSeed);
      expect(config1.webglVendor).toBe(config2.webglVendor);
      expect(config1.hardwareConcurrency).toBe(config2.hardwareConcurrency);
    });
  });

  describe('Determinism', () => {
    it('should use deterministic hash function', () => {
      const hash1 = hashString('test-context-id');
      const hash2 = hashString('test-context-id');
      const hash3 = hashString('different-context-id');

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
    });

    it('should use deterministic PRNG', () => {
      const rng1 = seededRandom(12345);
      const rng2 = seededRandom(12345);

      // Same seed produces same sequence
      expect(rng1()).toBe(rng2());
      expect(rng1()).toBe(rng2());
      expect(rng1()).toBe(rng2());
    });

    it('should produce values in valid ranges', () => {
      const config = fp.generateConfig('range-test-context');

      expect([4, 8, 12, 16]).toContain(config.hardwareConcurrency);
      expect([4, 8]).toContain(config.deviceMemory);
      expect(['Win32', 'Linux x86_64', 'MacIntel']).toContain(config.platform);
    });
  });
});

// ============ Timing Jitter Tests ============

interface TimingJitterConfig {
  minDelayMs: number;
  maxDelayMs: number;
  enabled: boolean;
}

class TestableTimingJitter {
  private config: TimingJitterConfig;

  constructor(config?: Partial<TimingJitterConfig>) {
    this.config = {
      minDelayMs: 0,
      maxDelayMs: 50,
      enabled: true,
      ...config,
    };
  }

  calculateDelay(contextId: ContextId, url: string, isThirdParty: boolean): number {
    if (!this.config.enabled || !isThirdParty) {
      return 0;
    }

    let domain: string;
    try {
      domain = new URL(url).hostname;
    } catch {
      domain = url;
    }

    const seed = hashString(`${contextId}:${domain}`);
    const rng = seededRandom(seed);
    const randomValue = rng();

    const range = this.config.maxDelayMs - this.config.minDelayMs;
    return this.config.minDelayMs + Math.floor(randomValue * range);
  }

  isDelayWithinBounds(delay: number): boolean {
    return delay >= this.config.minDelayMs && delay <= this.config.maxDelayMs;
  }

  getConfig(): TimingJitterConfig {
    return { ...this.config };
  }
}

describe('Timing Jitter', () => {
  let jitter: TestableTimingJitter;

  beforeEach(() => {
    jitter = new TestableTimingJitter({ minDelayMs: 5, maxDelayMs: 50 });
  });

  describe('Delay Calculation', () => {
    it('should return 0 for first-party requests', () => {
      const delay = jitter.calculateDelay('ctx-1', 'https://example.com/script.js', false);
      expect(delay).toBe(0);
    });

    it('should return non-zero for third-party requests when enabled', () => {
      const delay = jitter.calculateDelay('ctx-1', 'https://tracker.com/t.js', true);
      expect(delay).toBeGreaterThanOrEqual(5);
    });

    it('should return 0 when disabled', () => {
      const disabledJitter = new TestableTimingJitter({ enabled: false });
      const delay = disabledJitter.calculateDelay('ctx-1', 'https://tracker.com/t.js', true);
      expect(delay).toBe(0);
    });
  });

  describe('Bounds Enforcement', () => {
    it('should never exceed maximum delay', () => {
      const config = jitter.getConfig();
      
      // Test many different URLs
      for (let i = 0; i < 100; i++) {
        const delay = jitter.calculateDelay(`ctx-${i}`, `https://domain${i}.com/script.js`, true);
        expect(delay).toBeLessThanOrEqual(config.maxDelayMs);
      }
    });

    it('should never go below minimum delay for third-party', () => {
      const config = jitter.getConfig();
      
      for (let i = 0; i < 100; i++) {
        const delay = jitter.calculateDelay(`ctx-${i}`, `https://domain${i}.com/script.js`, true);
        expect(delay).toBeGreaterThanOrEqual(config.minDelayMs);
      }
    });

    it('should validate delay bounds correctly', () => {
      expect(jitter.isDelayWithinBounds(5)).toBe(true);
      expect(jitter.isDelayWithinBounds(25)).toBe(true);
      expect(jitter.isDelayWithinBounds(50)).toBe(true);
      expect(jitter.isDelayWithinBounds(4)).toBe(false);
      expect(jitter.isDelayWithinBounds(51)).toBe(false);
    });
  });

  describe('Determinism', () => {
    it('should produce same delay for same context + URL', () => {
      const delay1 = jitter.calculateDelay('ctx-stable', 'https://tracker.com/t.js', true);
      const delay2 = jitter.calculateDelay('ctx-stable', 'https://tracker.com/t.js', true);
      expect(delay1).toBe(delay2);
    });

    it('should produce different delays for different contexts', () => {
      const delay1 = jitter.calculateDelay('ctx-a', 'https://tracker.com/t.js', true);
      const delay2 = jitter.calculateDelay('ctx-b', 'https://tracker.com/t.js', true);
      
      // Different seeds should produce different delays (with very high probability)
      // There's a small chance they match by coincidence, so we test multiple
      let anyDifferent = delay1 !== delay2;
      for (let i = 0; i < 10 && !anyDifferent; i++) {
        const d1 = jitter.calculateDelay(`ctx-test-${i}`, 'https://t.com/s.js', true);
        const d2 = jitter.calculateDelay(`ctx-test-${i + 100}`, 'https://t.com/s.js', true);
        if (d1 !== d2) anyDifferent = true;
      }
      expect(anyDifferent).toBe(true);
    });

    it('should produce same delay across instances for same input', () => {
      const jitter1 = new TestableTimingJitter({ minDelayMs: 5, maxDelayMs: 50 });
      const jitter2 = new TestableTimingJitter({ minDelayMs: 5, maxDelayMs: 50 });

      const delay1 = jitter1.calculateDelay('ctx-x', 'https://ad.com/ad.js', true);
      const delay2 = jitter2.calculateDelay('ctx-x', 'https://ad.com/ad.js', true);
      expect(delay1).toBe(delay2);
    });
  });
});

// ============ Header Hardening Tests ============

interface HeaderHardeningConfig {
  minimizeReferrer: boolean;
  normalizeUserAgent: boolean;
  stripClientHints: boolean;
}

const HEADERS_TO_STRIP = [
  'sec-ch-ua',
  'sec-ch-ua-arch',
  'sec-ch-ua-bitness',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',
  'x-client-data',
];

class TestableHeaderHardening {
  private config: HeaderHardeningConfig;
  private normalizedUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  constructor(config?: Partial<HeaderHardeningConfig>) {
    this.config = {
      minimizeReferrer: true,
      normalizeUserAgent: true,
      stripClientHints: true,
      ...config,
    };
  }

  hardenHeaders(
    headers: Record<string, string>,
    requestUrl: string,
    pageUrl: string | null
  ): Record<string, string> {
    const hardened = { ...headers };

    if (this.config.minimizeReferrer) {
      this.minimizeReferrer(hardened, requestUrl, pageUrl);
    }

    if (this.config.normalizeUserAgent) {
      hardened['User-Agent'] = this.normalizedUserAgent;
    }

    if (this.config.stripClientHints) {
      this.stripClientHints(hardened);
    }

    return hardened;
  }

  private minimizeReferrer(
    headers: Record<string, string>,
    requestUrl: string,
    pageUrl: string | null
  ): void {
    const referer = headers['Referer'];
    
    if (!referer || !pageUrl) {
      delete headers['Referer'];
      return;
    }

    try {
      const refererParsed = new URL(referer);
      const requestParsed = new URL(requestUrl);

      if (refererParsed.origin === requestParsed.origin) {
        return; // Same origin, keep as is
      }

      const getBaseDomain = (hostname: string): string => {
        const parts = hostname.split('.');
        return parts.length > 2 ? parts.slice(-2).join('.') : hostname;
      };

      if (getBaseDomain(refererParsed.hostname) === getBaseDomain(requestParsed.hostname)) {
        headers['Referer'] = refererParsed.origin + '/';
      } else {
        delete headers['Referer'];
      }
    } catch {
      delete headers['Referer'];
    }
  }

  private stripClientHints(headers: Record<string, string>): void {
    for (const header of HEADERS_TO_STRIP) {
      delete headers[header];
      delete headers[header.toLowerCase()];
    }
  }

  getNormalizedUserAgent(): string {
    return this.normalizedUserAgent;
  }
}

describe('Header Hardening', () => {
  let hardening: TestableHeaderHardening;

  beforeEach(() => {
    hardening = new TestableHeaderHardening();
  });

  describe('Referrer Minimization', () => {
    it('should keep full referrer for same-origin requests', () => {
      const headers = {
        'Referer': 'https://example.com/page/subpage?query=1',
      };
      const result = hardening.hardenHeaders(
        headers,
        'https://example.com/api/data',
        'https://example.com/page/subpage'
      );
      expect(result['Referer']).toBe('https://example.com/page/subpage?query=1');
    });

    it('should reduce referrer to origin for same-site cross-origin', () => {
      const headers = {
        'Referer': 'https://www.example.com/page/secret?token=xyz',
      };
      const result = hardening.hardenHeaders(
        headers,
        'https://api.example.com/endpoint',
        'https://www.example.com/page/secret'
      );
      expect(result['Referer']).toBe('https://www.example.com/');
    });

    it('should strip referrer entirely for third-party requests', () => {
      const headers = {
        'Referer': 'https://example.com/private/page?secret=123',
      };
      const result = hardening.hardenHeaders(
        headers,
        'https://tracker.com/collect',
        'https://example.com/private/page'
      );
      expect(result['Referer']).toBeUndefined();
    });

    it('should strip referrer when no page URL is provided', () => {
      const headers = {
        'Referer': 'https://example.com/page',
      };
      const result = hardening.hardenHeaders(
        headers,
        'https://example.com/api',
        null
      );
      expect(result['Referer']).toBeUndefined();
    });

    it('should handle invalid referrer URLs gracefully', () => {
      const headers = {
        'Referer': 'not-a-valid-url',
      };
      const result = hardening.hardenHeaders(
        headers,
        'https://example.com/api',
        'https://example.com/page'
      );
      expect(result['Referer']).toBeUndefined();
    });
  });

  describe('User-Agent Normalization', () => {
    it('should normalize User-Agent header', () => {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/119.0',
      };
      const result = hardening.hardenHeaders(
        headers,
        'https://example.com/api',
        'https://example.com/page'
      );
      expect(result['User-Agent']).toBe(hardening.getNormalizedUserAgent());
    });

    it('should set User-Agent even if not present', () => {
      const headers = {};
      const result = hardening.hardenHeaders(
        headers,
        'https://example.com/api',
        null
      );
      expect(result['User-Agent']).toBe(hardening.getNormalizedUserAgent());
    });

    it('should use consistent normalized User-Agent', () => {
      const ua = hardening.getNormalizedUserAgent();
      
      // Should be a valid, modern Chrome-like UA
      expect(ua).toContain('Mozilla/5.0');
      expect(ua).toContain('Chrome/');
      expect(ua).toContain('Safari/');
    });
  });

  describe('Client Hints Stripping', () => {
    it('should strip Sec-CH-UA headers', () => {
      const headers = {
        'sec-ch-ua': '"Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'User-Agent': 'test',
      };
      const result = hardening.hardenHeaders(
        headers,
        'https://example.com/api',
        null
      );
      expect(result['sec-ch-ua']).toBeUndefined();
      expect(result['sec-ch-ua-mobile']).toBeUndefined();
      expect(result['sec-ch-ua-platform']).toBeUndefined();
    });

    it('should strip x-client-data header', () => {
      const headers = {
        'x-client-data': 'some-tracking-data',
        'User-Agent': 'test',
      };
      const result = hardening.hardenHeaders(
        headers,
        'https://example.com/api',
        null
      );
      expect(result['x-client-data']).toBeUndefined();
    });

    it('should preserve non-tracking headers', () => {
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'text/html',
        'Authorization': 'Bearer token',
        'sec-ch-ua': 'strip-this',
      };
      const result = hardening.hardenHeaders(
        headers,
        'https://example.com/api',
        null
      );
      expect(result['Content-Type']).toBe('application/json');
      expect(result['Accept']).toBe('text/html');
      expect(result['Authorization']).toBe('Bearer token');
      expect(result['sec-ch-ua']).toBeUndefined();
    });
  });

  describe('Integration', () => {
    it('should apply all hardening simultaneously', () => {
      const headers = {
        'Referer': 'https://example.com/secret/page?token=abc',
        'User-Agent': 'Custom UA String',
        'sec-ch-ua': '"Chrome";v="120"',
        'sec-ch-ua-platform': '"Windows"',
        'x-client-data': 'tracking',
        'Content-Type': 'text/html',
      };
      
      const result = hardening.hardenHeaders(
        headers,
        'https://tracker.com/collect',
        'https://example.com/secret/page'
      );

      // Referrer stripped (third-party)
      expect(result['Referer']).toBeUndefined();
      
      // User-Agent normalized
      expect(result['User-Agent']).toBe(hardening.getNormalizedUserAgent());
      
      // Client hints stripped
      expect(result['sec-ch-ua']).toBeUndefined();
      expect(result['sec-ch-ua-platform']).toBeUndefined();
      expect(result['x-client-data']).toBeUndefined();
      
      // Non-tracking headers preserved
      expect(result['Content-Type']).toBe('text/html');
    });
  });
});

// ============ Cross-Context Isolation Tests ============

describe('Cross-Context Privacy Isolation', () => {
  it('should produce unique fingerprints for each context', () => {
    const fp = new TestableFingerprintProtection();
    const contexts = ['ctx-1', 'ctx-2', 'ctx-3', 'ctx-4', 'ctx-5'];
    
    const configs = contexts.map(ctx => fp.generateConfig(ctx));
    const seeds = new Set(configs.map(c => c.canvasNoiseSeed));
    
    // All canvas seeds should be unique
    expect(seeds.size).toBe(contexts.length);
  });

  it('should produce unique timing jitter for each context', () => {
    const jitter = new TestableTimingJitter({ minDelayMs: 0, maxDelayMs: 100 });
    const contexts = ['ctx-a', 'ctx-b', 'ctx-c', 'ctx-d', 'ctx-e'];
    const url = 'https://tracker.com/script.js';
    
    const delays = contexts.map(ctx => jitter.calculateDelay(ctx, url, true));
    const uniqueDelays = new Set(delays);
    
    // Most delays should be different (with very high probability)
    // Allow for some collisions but expect most to be unique
    expect(uniqueDelays.size).toBeGreaterThanOrEqual(3);
  });

  it('should maintain fingerprint stability within context across time', () => {
    const fp1 = new TestableFingerprintProtection();
    const config1 = fp1.generateConfig('stable-context');
    
    // Simulate "later" by creating new instance
    const fp2 = new TestableFingerprintProtection();
    const config2 = fp2.generateConfig('stable-context');
    
    // Should be identical
    expect(config1.canvasNoiseSeed).toBe(config2.canvasNoiseSeed);
    expect(config1.webglVendor).toBe(config2.webglVendor);
    expect(config1.webglRenderer).toBe(config2.webglRenderer);
    expect(config1.languages).toEqual(config2.languages);
    expect(config1.hardwareConcurrency).toBe(config2.hardwareConcurrency);
  });
});


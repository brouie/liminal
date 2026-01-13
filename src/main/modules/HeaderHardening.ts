/**
 * HeaderHardening - Request Header Privacy Hardening
 * 
 * Normalizes and minimizes headers to reduce fingerprinting surface:
 * - Referer: Origin-only for cross-origin, stripped for third-party
 * - User-Agent: Reduced entropy, standardized format
 * - Sec-CH-UA: Client hints stripped
 * 
 * NO AI, NO Solana, NO wallets - pure deterministic privacy hardening.
 */

import { ContextId } from '../../shared/types';

/**
 * Header hardening configuration
 */
export interface HeaderHardeningConfig {
  /** Whether to minimize referrer */
  minimizeReferrer: boolean;
  /** Whether to normalize User-Agent */
  normalizeUserAgent: boolean;
  /** Whether to strip client hints */
  stripClientHints: boolean;
  /** Custom User-Agent (if set, overrides default) */
  customUserAgent?: string;
}

// Default configuration
const DEFAULT_CONFIG: HeaderHardeningConfig = {
  minimizeReferrer: true,
  normalizeUserAgent: true,
  stripClientHints: true,
};

// Normalized User-Agent strings (common, reduced entropy)
// These are generic enough to blend in but functional
const NORMALIZED_USER_AGENTS = {
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

// Headers to strip (client hints that leak information)
const HEADERS_TO_STRIP = [
  'sec-ch-ua',
  'sec-ch-ua-arch',
  'sec-ch-ua-bitness',
  'sec-ch-ua-full-version',
  'sec-ch-ua-full-version-list',
  'sec-ch-ua-mobile',
  'sec-ch-ua-model',
  'sec-ch-ua-platform',
  'sec-ch-ua-platform-version',
  'sec-ch-ua-wow64',
  'sec-ch-prefers-color-scheme',
  'sec-ch-prefers-reduced-motion',
  'x-client-data', // Google-specific tracking
  'x-requested-with',
];

export class HeaderHardening {
  private config: HeaderHardeningConfig;
  private normalizedUserAgent: string;

  constructor(config?: Partial<HeaderHardeningConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Detect platform and set normalized User-Agent
    this.normalizedUserAgent = this.detectNormalizedUserAgent();
  }

  /**
   * Detect platform and return appropriate normalized User-Agent
   */
  private detectNormalizedUserAgent(): string {
    if (this.config.customUserAgent) {
      return this.config.customUserAgent;
    }

    // Use process.platform to detect OS
    const platform = process.platform;
    
    if (platform === 'win32') {
      return NORMALIZED_USER_AGENTS.windows;
    } else if (platform === 'darwin') {
      return NORMALIZED_USER_AGENTS.mac;
    } else {
      return NORMALIZED_USER_AGENTS.linux;
    }
  }

  /**
   * Process and harden request headers
   * 
   * @param headers - Original request headers
   * @param requestUrl - The request URL
   * @param pageUrl - The page URL (for referrer calculation)
   * @returns Hardened headers
   */
  hardenHeaders(
    headers: Record<string, string>,
    requestUrl: string,
    pageUrl: string | null
  ): Record<string, string> {
    const hardened = { ...headers };

    // 1. Minimize referrer
    if (this.config.minimizeReferrer) {
      this.minimizeReferrer(hardened, requestUrl, pageUrl);
    }

    // 2. Normalize User-Agent
    if (this.config.normalizeUserAgent) {
      hardened['User-Agent'] = this.normalizedUserAgent;
    }

    // 3. Strip client hints and tracking headers
    if (this.config.stripClientHints) {
      this.stripClientHints(hardened);
    }

    return hardened;
  }

  /**
   * Minimize referrer header
   * - Same-origin: Keep full path (for functionality)
   * - Cross-origin same-site: Origin only
   * - Third-party: Strip entirely
   */
  private minimizeReferrer(
    headers: Record<string, string>,
    requestUrl: string,
    pageUrl: string | null
  ): void {
    const referer = headers['Referer'] || headers['referer'];
    
    if (!referer || !pageUrl) {
      // No referrer or no page context - strip it
      delete headers['Referer'];
      delete headers['referer'];
      return;
    }

    try {
      const refererParsed = new URL(referer);
      const requestParsed = new URL(requestUrl);
      const pageParsed = new URL(pageUrl);

      // Check if same origin
      if (refererParsed.origin === requestParsed.origin) {
        // Same origin - keep as is (needed for functionality)
        return;
      }

      // Check if same site (same base domain)
      const getBaseDomain = (hostname: string): string => {
        const parts = hostname.split('.');
        if (parts.length > 2) {
          return parts.slice(-2).join('.');
        }
        return hostname;
      };

      const refererBase = getBaseDomain(refererParsed.hostname);
      const requestBase = getBaseDomain(requestParsed.hostname);

      if (refererBase === requestBase) {
        // Same site - send origin only
        headers['Referer'] = refererParsed.origin + '/';
      } else {
        // Third-party - strip entirely
        delete headers['Referer'];
        delete headers['referer'];
      }
    } catch {
      // Parse error - strip referrer for safety
      delete headers['Referer'];
      delete headers['referer'];
    }
  }

  /**
   * Strip client hints and tracking headers
   */
  private stripClientHints(headers: Record<string, string>): void {
    for (const header of HEADERS_TO_STRIP) {
      // Check both lowercase and original case
      delete headers[header];
      delete headers[header.toLowerCase()];
      
      // Also check capitalized versions
      const capitalized = header.split('-').map(
        part => part.charAt(0).toUpperCase() + part.slice(1)
      ).join('-');
      delete headers[capitalized];
    }
  }

  /**
   * Get the normalized User-Agent string
   */
  getNormalizedUserAgent(): string {
    return this.normalizedUserAgent;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HeaderHardeningConfig>): void {
    this.config = { ...this.config, ...config };
    this.normalizedUserAgent = this.detectNormalizedUserAgent();
  }

  /**
   * Get current configuration
   */
  getConfig(): HeaderHardeningConfig {
    return { ...this.config };
  }

  /**
   * Check if a referrer is properly minimized
   * (for testing purposes)
   */
  isReferrerMinimized(
    originalReferrer: string,
    hardenedReferrer: string | undefined,
    requestUrl: string
  ): boolean {
    // If stripped entirely, it's minimized
    if (!hardenedReferrer) {
      return true;
    }

    try {
      const original = new URL(originalReferrer);
      const hardened = new URL(hardenedReferrer);
      const request = new URL(requestUrl);

      // Same origin - full path is OK
      if (original.origin === request.origin) {
        return true;
      }

      // Cross-origin - should be origin only or stripped
      return hardenedReferrer === original.origin + '/' || 
             hardenedReferrer === original.origin;
    } catch {
      return hardenedReferrer === undefined;
    }
  }
}

// Singleton instance
let instance: HeaderHardening | null = null;

export function getHeaderHardening(): HeaderHardening {
  if (!instance) {
    instance = new HeaderHardening();
  }
  return instance;
}

export function resetHeaderHardening(): void {
  instance = null;
}


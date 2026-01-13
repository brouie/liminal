/**
 * TimingJitter - Deterministic Timing Jitter
 * 
 * Adds bounded, context-seeded delays to network requests.
 * Jitter is stable per Context ID + request URL combination,
 * not global randomness.
 * 
 * NO AI, NO Solana, NO wallets - pure deterministic privacy hardening.
 */

import { ContextId } from '../../shared/types';

/**
 * Timing jitter configuration
 */
export interface TimingJitterConfig {
  /** Minimum delay in milliseconds */
  minDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Whether jitter is enabled */
  enabled: boolean;
}

// Default configuration (bounded, reasonable delays)
const DEFAULT_CONFIG: TimingJitterConfig = {
  minDelayMs: 0,
  maxDelayMs: 50, // Maximum 50ms jitter
  enabled: true,
};

/**
 * Simple deterministic hash function (djb2)
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
 * Seeded pseudo-random number generator (Mulberry32)
 */
function seededRandom(seed: number): number {
  let t = seed + 0x6D2B79F5;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

export class TimingJitter {
  private config: TimingJitterConfig;

  constructor(config?: Partial<TimingJitterConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Calculate deterministic jitter delay for a request
   * 
   * @param contextId - The context making the request
   * @param url - The request URL
   * @param isThirdParty - Whether this is a third-party request
   * @returns Delay in milliseconds (0 if jitter disabled or first-party)
   */
  calculateDelay(contextId: ContextId, url: string, isThirdParty: boolean): number {
    // Only apply jitter to third-party requests
    if (!this.config.enabled || !isThirdParty) {
      return 0;
    }

    // Extract domain for more stable hashing (ignore query params)
    let domain: string;
    try {
      const parsed = new URL(url);
      domain = parsed.hostname;
    } catch {
      domain = url;
    }

    // Create deterministic seed from context ID + domain
    const seed = hashString(`${contextId}:${domain}`);
    
    // Generate deterministic random value [0, 1)
    const randomValue = seededRandom(seed);
    
    // Calculate delay within bounds
    const range = this.config.maxDelayMs - this.config.minDelayMs;
    const delay = this.config.minDelayMs + Math.floor(randomValue * range);

    return delay;
  }

  /**
   * Apply jitter delay (returns a promise that resolves after the delay)
   */
  async applyDelay(contextId: ContextId, url: string, isThirdParty: boolean): Promise<number> {
    const delay = this.calculateDelay(contextId, url, isThirdParty);
    
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    return delay;
  }

  /**
   * Get current configuration
   */
  getConfig(): TimingJitterConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TimingJitterConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Validate bounds
    if (this.config.minDelayMs < 0) {
      this.config.minDelayMs = 0;
    }
    if (this.config.maxDelayMs < this.config.minDelayMs) {
      this.config.maxDelayMs = this.config.minDelayMs;
    }
    // Enforce maximum bound (100ms) to prevent DoS
    if (this.config.maxDelayMs > 100) {
      this.config.maxDelayMs = 100;
    }
  }

  /**
   * Enable/disable jitter
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * Check if a delay is within configured bounds
   */
  isDelayWithinBounds(delay: number): boolean {
    return delay >= this.config.minDelayMs && delay <= this.config.maxDelayMs;
  }
}

// Singleton instance
let instance: TimingJitter | null = null;

export function getTimingJitter(): TimingJitter {
  if (!instance) {
    instance = new TimingJitter();
  }
  return instance;
}

export function resetTimingJitter(): void {
  instance = null;
}

// Export for testing
export { hashString as jitterHashString, seededRandom as jitterSeededRandom };


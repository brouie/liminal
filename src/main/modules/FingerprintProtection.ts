/**
 * FingerprintProtection - Deterministic Fingerprint Protection
 * 
 * Generates context-specific, deterministic values for browser fingerprinting APIs.
 * All values are seeded by the Context ID for stability within a context
 * while differing across contexts.
 * 
 * NO AI, NO Solana, NO wallets - pure deterministic privacy hardening.
 */

import { ContextId } from '../../shared/types';

/**
 * Simple deterministic hash function (djb2)
 * Produces a stable numeric hash from a string
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash >>> 0; // Convert to unsigned 32-bit
  }
  return hash;
}

/**
 * Seeded pseudo-random number generator (Mulberry32)
 * Produces deterministic sequence based on seed
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
 * Fingerprint configuration for a context
 */
export interface FingerprintConfig {
  contextId: ContextId;
  
  // Canvas fingerprint noise
  canvasNoiseSeed: number;
  canvasNoiseIntensity: number;
  
  // WebGL normalized values
  webglVendor: string;
  webglRenderer: string;
  
  // AudioContext noise
  audioNoiseSeed: number;
  audioNoiseIntensity: number;
  
  // Navigator overrides
  languages: string[];
  plugins: { name: string; filename: string }[];
  hardwareConcurrency: number;
  deviceMemory: number;
  platform: string;
}

// Normalized WebGL vendor/renderer options (reduced entropy)
const WEBGL_VENDORS = [
  'Google Inc.',
  'Intel Inc.',
  'Mesa',
];

const WEBGL_RENDERERS = [
  'ANGLE (Intel, Mesa Intel(R) Graphics, OpenGL 4.6)',
  'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060, OpenGL 4.5)',
  'ANGLE (AMD, AMD Radeon Graphics, OpenGL 4.6)',
  'Mesa Intel(R) UHD Graphics 620',
];

// Normalized language sets (common combinations)
const LANGUAGE_SETS = [
  ['en-US', 'en'],
  ['en-GB', 'en'],
  ['en-US'],
];

// Normalized plugin sets (minimal, common)
const PLUGIN_SETS = [
  [], // No plugins (most common in modern browsers)
  [{ name: 'PDF Viewer', filename: 'internal-pdf-viewer' }],
];

// Normalized hardware concurrency values
const HARDWARE_CONCURRENCY_VALUES = [4, 8, 12, 16];

// Normalized device memory values
const DEVICE_MEMORY_VALUES = [4, 8];

// Normalized platform values
const PLATFORM_VALUES = ['Win32', 'Linux x86_64', 'MacIntel'];

export class FingerprintProtection {
  private configs: Map<ContextId, FingerprintConfig> = new Map();

  /**
   * Generate deterministic fingerprint configuration for a context
   */
  generateConfig(contextId: ContextId): FingerprintConfig {
    // Check cache first
    const existing = this.configs.get(contextId);
    if (existing) {
      return existing;
    }

    // Seed everything from context ID
    const baseSeed = hashString(contextId);
    const rng = seededRandom(baseSeed);

    // Generate deterministic values
    const config: FingerprintConfig = {
      contextId,
      
      // Canvas noise parameters
      canvasNoiseSeed: Math.floor(rng() * 0xFFFFFFFF),
      canvasNoiseIntensity: 0.01 + (rng() * 0.02), // 1-3% noise
      
      // WebGL (select from normalized sets)
      webglVendor: WEBGL_VENDORS[Math.floor(rng() * WEBGL_VENDORS.length)],
      webglRenderer: WEBGL_RENDERERS[Math.floor(rng() * WEBGL_RENDERERS.length)],
      
      // AudioContext noise
      audioNoiseSeed: Math.floor(rng() * 0xFFFFFFFF),
      audioNoiseIntensity: 0.0001 + (rng() * 0.0001), // Very small noise
      
      // Navigator overrides
      languages: LANGUAGE_SETS[Math.floor(rng() * LANGUAGE_SETS.length)],
      plugins: PLUGIN_SETS[Math.floor(rng() * PLUGIN_SETS.length)],
      hardwareConcurrency: HARDWARE_CONCURRENCY_VALUES[Math.floor(rng() * HARDWARE_CONCURRENCY_VALUES.length)],
      deviceMemory: DEVICE_MEMORY_VALUES[Math.floor(rng() * DEVICE_MEMORY_VALUES.length)],
      platform: PLATFORM_VALUES[Math.floor(rng() * PLATFORM_VALUES.length)],
    };

    this.configs.set(contextId, config);
    return config;
  }

  /**
   * Get existing config for a context
   */
  getConfig(contextId: ContextId): FingerprintConfig | undefined {
    return this.configs.get(contextId);
  }

  /**
   * Clear config when context is destroyed
   */
  clearConfig(contextId: ContextId): void {
    this.configs.delete(contextId);
  }

  /**
   * Generate the injection script for a context
   * This script will be injected into the page to override fingerprinting APIs
   */
  generateInjectionScript(contextId: ContextId): string {
    const config = this.generateConfig(contextId);
    
    return `
(function() {
  'use strict';
  
  // Fingerprint protection configuration (context-specific)
  const __LIMINAL_FP_CONFIG__ = ${JSON.stringify(config)};
  
  // Seeded PRNG for deterministic noise
  function seededRandom(seed) {
    return function() {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  
  // ========== Canvas Fingerprint Protection ==========
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  
  function addCanvasNoise(imageData) {
    const rng = seededRandom(__LIMINAL_FP_CONFIG__.canvasNoiseSeed);
    const intensity = __LIMINAL_FP_CONFIG__.canvasNoiseIntensity;
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      // Add deterministic noise to RGB channels (not alpha)
      const noise = Math.floor((rng() - 0.5) * 255 * intensity);
      data[i] = Math.max(0, Math.min(255, data[i] + noise));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
    }
    
    return imageData;
  }
  
  HTMLCanvasElement.prototype.toDataURL = function(...args) {
    const ctx = this.getContext('2d');
    if (ctx) {
      try {
        const imageData = ctx.getImageData(0, 0, this.width, this.height);
        addCanvasNoise(imageData);
        ctx.putImageData(imageData, 0, 0);
      } catch (e) {
        // Canvas might be tainted, proceed without noise
      }
    }
    return originalToDataURL.apply(this, args);
  };
  
  CanvasRenderingContext2D.prototype.getImageData = function(...args) {
    const imageData = originalGetImageData.apply(this, args);
    return addCanvasNoise(imageData);
  };
  
  // ========== WebGL Fingerprint Protection ==========
  const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
  const originalGetParameter2 = WebGL2RenderingContext.prototype.getParameter;
  
  function patchGetParameter(original) {
    return function(param) {
      // UNMASKED_VENDOR_WEBGL
      if (param === 37445) {
        return __LIMINAL_FP_CONFIG__.webglVendor;
      }
      // UNMASKED_RENDERER_WEBGL
      if (param === 37446) {
        return __LIMINAL_FP_CONFIG__.webglRenderer;
      }
      return original.call(this, param);
    };
  }
  
  WebGLRenderingContext.prototype.getParameter = patchGetParameter(originalGetParameter);
  WebGL2RenderingContext.prototype.getParameter = patchGetParameter(originalGetParameter2);
  
  // ========== AudioContext Fingerprint Protection ==========
  const originalCreateAnalyser = AudioContext.prototype.createAnalyser;
  const originalGetFloatFrequencyData = AnalyserNode.prototype.getFloatFrequencyData;
  
  AnalyserNode.prototype.getFloatFrequencyData = function(array) {
    originalGetFloatFrequencyData.call(this, array);
    
    // Add deterministic noise
    const rng = seededRandom(__LIMINAL_FP_CONFIG__.audioNoiseSeed);
    const intensity = __LIMINAL_FP_CONFIG__.audioNoiseIntensity;
    
    for (let i = 0; i < array.length; i++) {
      array[i] += (rng() - 0.5) * intensity;
    }
  };
  
  // ========== Navigator Property Overrides ==========
  
  // Languages
  Object.defineProperty(navigator, 'languages', {
    get: function() {
      return Object.freeze([...__LIMINAL_FP_CONFIG__.languages]);
    }
  });
  
  Object.defineProperty(navigator, 'language', {
    get: function() {
      return __LIMINAL_FP_CONFIG__.languages[0];
    }
  });
  
  // Plugins (return context-specific minimal set)
  const fakePlugins = __LIMINAL_FP_CONFIG__.plugins.map(p => ({
    name: p.name,
    filename: p.filename,
    description: '',
    length: 0,
    item: () => null,
    namedItem: () => null,
    [Symbol.iterator]: function*() {}
  }));
  
  Object.defineProperty(navigator, 'plugins', {
    get: function() {
      return Object.freeze(fakePlugins);
    }
  });
  
  // Hardware concurrency
  Object.defineProperty(navigator, 'hardwareConcurrency', {
    get: function() {
      return __LIMINAL_FP_CONFIG__.hardwareConcurrency;
    }
  });
  
  // Device memory
  Object.defineProperty(navigator, 'deviceMemory', {
    get: function() {
      return __LIMINAL_FP_CONFIG__.deviceMemory;
    }
  });
  
  // Platform
  Object.defineProperty(navigator, 'platform', {
    get: function() {
      return __LIMINAL_FP_CONFIG__.platform;
    }
  });
  
  // Mark as protected (for testing)
  window.__LIMINAL_FINGERPRINT_PROTECTED__ = true;
  window.__LIMINAL_CONTEXT_ID__ = __LIMINAL_FP_CONFIG__.contextId;
  
})();
`;
  }
}

// Singleton instance
let instance: FingerprintProtection | null = null;

export function getFingerprintProtection(): FingerprintProtection {
  if (!instance) {
    instance = new FingerprintProtection();
  }
  return instance;
}

export function resetFingerprintProtection(): void {
  instance = null;
}

// Export utility functions for testing
export { hashString, seededRandom };


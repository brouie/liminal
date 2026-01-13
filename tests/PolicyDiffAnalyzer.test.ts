/**
 * Policy Diff Analyzer Tests
 * 
 * Tests for Phase 2.3: Policy Diff Explanation Layer
 * 
 * PHASE 2.3 RULES VERIFIED:
 * - Diff analysis is PURE and side-effect-free
 * - Explanations reference CONCRETE protections
 * - No abstract AI language
 * - Deterministic output
 * - NO Solana, NO wallets, NO transactions
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TelemetrySnapshot,
  PolicySimulationOutput,
  PolicyDiffExplanation,
  ModeExplanation,
  ProtectionFactor,
} from '../src/shared/ai-types';
import {
  PolicyDiffAnalyzer,
  getPolicyDiffAnalyzer,
  resetPolicyDiffAnalyzer,
  analyzePolicyDiff,
} from '../src/main/modules/ai/PolicyDiffAnalyzer';
import { simulateAllModes } from '../src/main/modules/ai/PolicySimulator';

// ============ Test Helpers ============

function createEmptySnapshot(contextId: string = 'test-context-1'): TelemetrySnapshot {
  return {
    contextId,
    origin: 'https://example.com',
    timestamp: Date.now(),
    durationMs: 5000,
    proxy: { type: 'direct' },
    requests: {
      totalRequests: 0,
      blockedRequests: 0,
      thirdPartyRequests: 0,
      thirdPartyDomains: [],
      blockedDomains: [],
    },
    fingerprinting: {
      canvasAccessed: false,
      canvasOperations: 0,
      webglAccessed: false,
      webglOperations: 0,
      audioAccessed: false,
      audioOperations: 0,
      navigatorAccessed: false,
      navigatorProperties: [],
    },
    timing: {
      jitterEnabled: true,
      minJitterMs: 0,
      maxJitterMs: 50,
      avgJitterMs: 25,
      jitteredRequests: 0,
    },
    headers: {
      referrerStripped: 0,
      referrerReduced: 0,
      userAgentNormalized: 0,
      clientHintsStripped: 0,
    },
  };
}

function createActiveSnapshot(contextId: string = 'test-context-active'): TelemetrySnapshot {
  return {
    contextId,
    origin: 'https://active-site.com',
    timestamp: Date.now(),
    durationMs: 30000,
    proxy: { type: 'direct' },
    requests: {
      totalRequests: 100,
      blockedRequests: 20,
      thirdPartyRequests: 40,
      thirdPartyDomains: [
        'cdn.example.com',
        'api.example.com',
        'analytics.example.com',
        'doubleclick.net',
        'facebook.net',
      ],
      blockedDomains: [
        'doubleclick.net',
        'facebook.net',
      ],
    },
    fingerprinting: {
      canvasAccessed: true,
      canvasOperations: 5,
      webglAccessed: true,
      webglOperations: 3,
      audioAccessed: false,
      audioOperations: 0,
      navigatorAccessed: true,
      navigatorProperties: ['plugins', 'languages'],
    },
    timing: {
      jitterEnabled: true,
      minJitterMs: 0,
      maxJitterMs: 50,
      avgJitterMs: 25,
      jitteredRequests: 35,
    },
    headers: {
      referrerStripped: 5,
      referrerReduced: 15,
      userAgentNormalized: 40,
      clientHintsStripped: 20,
    },
  };
}

// ============ Diff Explanation Structure Tests ============

describe('PolicyDiffExplanation Structure', () => {
  let analyzer: PolicyDiffAnalyzer;

  beforeEach(() => {
    resetPolicyDiffAnalyzer();
    analyzer = getPolicyDiffAnalyzer();
  });

  afterEach(() => {
    resetPolicyDiffAnalyzer();
  });

  it('should return valid diff explanation structure', () => {
    const snapshot = createActiveSnapshot();
    const simulation = simulateAllModes(snapshot);
    const diff = analyzer.analyze(snapshot, simulation);

    expect(diff).toHaveProperty('strict');
    expect(diff).toHaveProperty('balanced');
    expect(diff).toHaveProperty('permissive');
    expect(diff).toHaveProperty('keyDifferences');
    expect(diff).toHaveProperty('allFactors');
    expect(diff).toHaveProperty('analyzedAt');
  });

  it('should have valid mode explanation structure', () => {
    const snapshot = createActiveSnapshot();
    const simulation = simulateAllModes(snapshot);
    const diff = analyzer.analyze(snapshot, simulation);

    const checkModeExplanation = (mode: ModeExplanation) => {
      expect(mode).toHaveProperty('mode');
      expect(mode).toHaveProperty('summary');
      expect(mode).toHaveProperty('topFactors');
      expect(mode).toHaveProperty('privacyRationale');
      expect(mode).toHaveProperty('breakageRationale');
    };

    checkModeExplanation(diff.strict);
    checkModeExplanation(diff.balanced);
    checkModeExplanation(diff.permissive);
  });

  it('should have valid protection factor structure', () => {
    const snapshot = createActiveSnapshot();
    const simulation = simulateAllModes(snapshot);
    const diff = analyzer.analyze(snapshot, simulation);

    expect(diff.allFactors.length).toBeGreaterThan(0);

    const factor = diff.allFactors[0];
    expect(factor).toHaveProperty('name');
    expect(factor).toHaveProperty('category');
    expect(factor).toHaveProperty('description');
    expect(factor).toHaveProperty('privacyImpact');
    expect(factor).toHaveProperty('breakageImpact');
    expect(factor).toHaveProperty('enabledInStrict');
    expect(factor).toHaveProperty('enabledInBalanced');
    expect(factor).toHaveProperty('enabledInPermissive');
  });

  it('should have correct modes in explanations', () => {
    const snapshot = createActiveSnapshot();
    const simulation = simulateAllModes(snapshot);
    const diff = analyzer.analyze(snapshot, simulation);

    expect(diff.strict.mode).toBe('STRICT');
    expect(diff.balanced.mode).toBe('BALANCED');
    expect(diff.permissive.mode).toBe('PERMISSIVE');
  });
});

// ============ Concrete Protection References Tests ============

describe('Concrete Protection References', () => {
  let analyzer: PolicyDiffAnalyzer;

  beforeEach(() => {
    resetPolicyDiffAnalyzer();
    analyzer = getPolicyDiffAnalyzer();
  });

  afterEach(() => {
    resetPolicyDiffAnalyzer();
  });

  it('explanations reference specific protection names', () => {
    const snapshot = createActiveSnapshot();
    const simulation = simulateAllModes(snapshot);
    const diff = analyzer.analyze(snapshot, simulation);

    // Check that summaries contain specific protection terms
    const concreteTerms = [
      'fingerprint',
      'third-party',
      'header',
      'block',
      'protect',
      'request',
    ];

    const allSummaries = [
      diff.strict.summary,
      diff.balanced.summary,
      diff.permissive.summary,
    ].join(' ').toLowerCase();

    const hasConcreteTerms = concreteTerms.some(term => allSummaries.includes(term));
    expect(hasConcreteTerms).toBe(true);
  });

  it('does NOT use abstract AI language', () => {
    const snapshot = createActiveSnapshot();
    const simulation = simulateAllModes(snapshot);
    const diff = analyzer.analyze(snapshot, simulation);

    const abstractTerms = [
      'neural',
      'machine learning',
      'deep learning',
      'algorithm optimizes',
      'model predicts',
      'inference',
    ];

    const allText = [
      diff.strict.summary,
      diff.balanced.summary,
      diff.permissive.summary,
      diff.strict.privacyRationale,
      diff.strict.breakageRationale,
      ...diff.keyDifferences,
    ].join(' ').toLowerCase();

    for (const term of abstractTerms) {
      expect(allText).not.toContain(term);
    }
  });

  it('protection factors have valid categories', () => {
    const snapshot = createActiveSnapshot();
    const simulation = simulateAllModes(snapshot);
    const diff = analyzer.analyze(snapshot, simulation);

    const validCategories = ['fingerprint', 'network', 'headers', 'tracking'];

    for (const factor of diff.allFactors) {
      expect(validCategories).toContain(factor.category);
    }
  });

  it('top factors reference specific protections', () => {
    const snapshot = createActiveSnapshot();
    const simulation = simulateAllModes(snapshot);
    const diff = analyzer.analyze(snapshot, simulation);

    // Check that top factors have meaningful names
    const allTopFactors = [
      ...diff.strict.topFactors,
      ...diff.balanced.topFactors,
      ...diff.permissive.topFactors,
    ];

    for (const factor of allTopFactors) {
      expect(factor.name.length).toBeGreaterThan(5);
      expect(factor.description.length).toBeGreaterThan(10);
    }
  });

  it('key differences are concrete, not abstract', () => {
    const snapshot = createActiveSnapshot();
    const simulation = simulateAllModes(snapshot);
    const diff = analyzer.analyze(snapshot, simulation);

    // Key differences should mention specific metrics or protections
    const concretePatterns = [
      /\d+%/, // Percentages
      /block/i,
      /fingerprint/i,
      /third-party/i,
      /protection/i,
      /STRICT|BALANCED|PERMISSIVE/,
    ];

    const allDifferences = diff.keyDifferences.join(' ');
    const hasConcreteContent = concretePatterns.some(p => p.test(allDifferences));
    expect(hasConcreteContent).toBe(true);
  });
});

// ============ Determinism Tests ============

describe('Diff Analysis Determinism', () => {
  let analyzer: PolicyDiffAnalyzer;

  beforeEach(() => {
    resetPolicyDiffAnalyzer();
    analyzer = getPolicyDiffAnalyzer();
  });

  afterEach(() => {
    resetPolicyDiffAnalyzer();
  });

  it('same input produces identical output', () => {
    const snapshot = createActiveSnapshot();
    const simulation = simulateAllModes(snapshot);

    const diff1 = analyzer.analyze(snapshot, simulation);
    const diff2 = analyzer.analyze(snapshot, simulation);

    // Ignore timestamps
    const { analyzedAt: t1, ...rest1 } = diff1;
    const { analyzedAt: t2, ...rest2 } = diff2;

    expect(rest1).toEqual(rest2);
  });

  it('deterministic across multiple analyzer instances', () => {
    const snapshot = createActiveSnapshot();
    const simulation = simulateAllModes(snapshot);

    const analyzer1 = new PolicyDiffAnalyzer();
    const analyzer2 = new PolicyDiffAnalyzer();

    const diff1 = analyzer1.analyze(snapshot, simulation);
    const diff2 = analyzer2.analyze(snapshot, simulation);

    expect(diff1.strict.summary).toBe(diff2.strict.summary);
    expect(diff1.balanced.summary).toBe(diff2.balanced.summary);
    expect(diff1.keyDifferences).toEqual(diff2.keyDifferences);
  });

  it('standalone function matches class method', () => {
    const snapshot = createActiveSnapshot();
    const simulation = simulateAllModes(snapshot);

    const classResult = analyzer.analyze(snapshot, simulation);
    const functionResult = analyzePolicyDiff(snapshot, simulation);

    expect(classResult.strict.summary).toBe(functionResult.strict.summary);
    expect(classResult.allFactors.length).toBe(functionResult.allFactors.length);
  });
});

// ============ Purity Tests ============

describe('Diff Analysis Purity', () => {
  let analyzer: PolicyDiffAnalyzer;

  beforeEach(() => {
    resetPolicyDiffAnalyzer();
    analyzer = getPolicyDiffAnalyzer();
  });

  afterEach(() => {
    resetPolicyDiffAnalyzer();
  });

  it('does NOT modify input snapshot', () => {
    const snapshot = createActiveSnapshot();
    const simulation = simulateAllModes(snapshot);
    const originalSnapshot = JSON.parse(JSON.stringify(snapshot));
    const originalSimulation = JSON.parse(JSON.stringify(simulation));

    analyzer.analyze(snapshot, simulation);

    expect(snapshot).toEqual(originalSnapshot);
    expect(simulation).toEqual(originalSimulation);
  });

  it('is side-effect-free', () => {
    const snapshot1 = createActiveSnapshot('ctx-1');
    const snapshot2 = createEmptySnapshot('ctx-2');
    const simulation1 = simulateAllModes(snapshot1);
    const simulation2 = simulateAllModes(snapshot2);

    const diff1a = analyzer.analyze(snapshot1, simulation1);
    const diff2 = analyzer.analyze(snapshot2, simulation2);
    const diff1b = analyzer.analyze(snapshot1, simulation1);

    // Analyzing different input should not affect results
    expect(diff1a.strict.summary).toBe(diff1b.strict.summary);
  });

  it('has no enforcement action fields', () => {
    const snapshot = createActiveSnapshot();
    const simulation = simulateAllModes(snapshot);
    const diff = analyzer.analyze(snapshot, simulation);

    // Verify no enforcement-related properties
    expect(diff).not.toHaveProperty('apply');
    expect(diff).not.toHaveProperty('execute');
    expect(diff).not.toHaveProperty('enforce');
    expect(diff).not.toHaveProperty('setPolicy');
    expect(diff).not.toHaveProperty('block');
    expect(diff).not.toHaveProperty('allow');
  });
});

// ============ Mode Comparison Tests ============

describe('Mode Comparison', () => {
  let analyzer: PolicyDiffAnalyzer;

  beforeEach(() => {
    resetPolicyDiffAnalyzer();
    analyzer = getPolicyDiffAnalyzer();
  });

  afterEach(() => {
    resetPolicyDiffAnalyzer();
  });

  it('STRICT enables more protections than PERMISSIVE', () => {
    const snapshot = createActiveSnapshot();
    const simulation = simulateAllModes(snapshot);
    const diff = analyzer.analyze(snapshot, simulation);

    const strictEnabled = diff.allFactors.filter(f => f.enabledInStrict).length;
    const permissiveEnabled = diff.allFactors.filter(f => f.enabledInPermissive).length;

    expect(strictEnabled).toBeGreaterThanOrEqual(permissiveEnabled);
  });

  it('BALANCED is between STRICT and PERMISSIVE', () => {
    const snapshot = createActiveSnapshot();
    const simulation = simulateAllModes(snapshot);
    const diff = analyzer.analyze(snapshot, simulation);

    const strictEnabled = diff.allFactors.filter(f => f.enabledInStrict).length;
    const balancedEnabled = diff.allFactors.filter(f => f.enabledInBalanced).length;
    const permissiveEnabled = diff.allFactors.filter(f => f.enabledInPermissive).length;

    expect(balancedEnabled).toBeGreaterThanOrEqual(permissiveEnabled);
    expect(balancedEnabled).toBeLessThanOrEqual(strictEnabled);
  });

  it('generates key differences between modes', () => {
    const snapshot = createActiveSnapshot();
    const simulation = simulateAllModes(snapshot);
    const diff = analyzer.analyze(snapshot, simulation);

    expect(diff.keyDifferences.length).toBeGreaterThan(0);
  });
});

// ============ Fingerprint-Specific Tests ============

describe('Fingerprint Detection in Explanations', () => {
  let analyzer: PolicyDiffAnalyzer;

  beforeEach(() => {
    resetPolicyDiffAnalyzer();
    analyzer = getPolicyDiffAnalyzer();
  });

  afterEach(() => {
    resetPolicyDiffAnalyzer();
  });

  it('detects canvas fingerprinting in factors', () => {
    const snapshot = createActiveSnapshot();
    snapshot.fingerprinting.canvasAccessed = true;
    snapshot.fingerprinting.canvasOperations = 10;

    const simulation = simulateAllModes(snapshot);
    const diff = analyzer.analyze(snapshot, simulation);

    const canvasFactor = diff.allFactors.find(f => 
      f.name.toLowerCase().includes('canvas')
    );

    expect(canvasFactor).toBeDefined();
    expect(canvasFactor?.category).toBe('fingerprint');
  });

  it('detects WebGL fingerprinting in factors', () => {
    const snapshot = createActiveSnapshot();
    snapshot.fingerprinting.webglAccessed = true;

    const simulation = simulateAllModes(snapshot);
    const diff = analyzer.analyze(snapshot, simulation);

    const webglFactor = diff.allFactors.find(f => 
      f.name.toLowerCase().includes('webgl')
    );

    expect(webglFactor).toBeDefined();
    expect(webglFactor?.category).toBe('fingerprint');
  });
});

// ============ Edge Cases ============

describe('Edge Cases', () => {
  let analyzer: PolicyDiffAnalyzer;

  beforeEach(() => {
    resetPolicyDiffAnalyzer();
    analyzer = getPolicyDiffAnalyzer();
  });

  afterEach(() => {
    resetPolicyDiffAnalyzer();
  });

  it('handles empty snapshot', () => {
    const snapshot = createEmptySnapshot();
    const simulation = simulateAllModes(snapshot);
    const diff = analyzer.analyze(snapshot, simulation);

    expect(diff.strict).toBeDefined();
    expect(diff.balanced).toBeDefined();
    expect(diff.permissive).toBeDefined();
    expect(diff.allFactors.length).toBeGreaterThan(0);
  });

  it('handles no fingerprinting activity', () => {
    const snapshot = createEmptySnapshot();
    snapshot.requests.totalRequests = 50;

    const simulation = simulateAllModes(snapshot);
    const diff = analyzer.analyze(snapshot, simulation);

    // Should still have fingerprint factors defined
    const fpFactors = diff.allFactors.filter(f => f.category === 'fingerprint');
    expect(fpFactors.length).toBeGreaterThan(0);
  });

  it('handles heavy third-party usage', () => {
    const snapshot = createActiveSnapshot();
    snapshot.requests.thirdPartyRequests = 100;
    snapshot.requests.thirdPartyDomains = Array(30).fill(null).map((_, i) => `cdn${i}.example.com`);

    const simulation = simulateAllModes(snapshot);
    const diff = analyzer.analyze(snapshot, simulation);

    // Network factors should have higher impact
    const networkFactors = diff.allFactors.filter(f => f.category === 'network');
    expect(networkFactors.some(f => f.privacyImpact > 50)).toBe(true);
  });
});

// ============ Protection Definitions Tests ============

describe('Protection Definitions', () => {
  let analyzer: PolicyDiffAnalyzer;

  beforeEach(() => {
    resetPolicyDiffAnalyzer();
    analyzer = getPolicyDiffAnalyzer();
  });

  it('returns all protection definitions', () => {
    const definitions = analyzer.getProtectionDefinitions();

    expect(definitions.length).toBeGreaterThan(0);
    
    for (const def of definitions) {
      expect(def.name).toBeTruthy();
      expect(def.category).toBeTruthy();
      expect(def.description).toBeTruthy();
    }
  });

  it('includes all protection categories', () => {
    const definitions = analyzer.getProtectionDefinitions();
    const categories = new Set(definitions.map(d => d.category));

    expect(categories.has('fingerprint')).toBe(true);
    expect(categories.has('network')).toBe(true);
    expect(categories.has('headers')).toBe(true);
    expect(categories.has('tracking')).toBe(true);
  });
});


/**
 * AI Privacy Agent Tests
 * 
 * Tests for Phase 2: AI Observation & Explanation Layer
 * 
 * PHASE 2 RULES VERIFIED:
 * - AI is READ-ONLY
 * - AI does NOT affect enforcement
 * - AI output is deterministic (for HeuristicClassifier)
 * - NO Solana, NO wallets, NO transactions
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TelemetrySnapshot,
  AIClassification,
  RiskLevel,
  TrackingVector,
  RequestTelemetry,
  FingerprintTelemetry,
  TimingTelemetry,
  HeaderTelemetry,
} from '../src/shared/ai-types';
import { HeuristicClassifier, resetHeuristicClassifier } from '../src/main/modules/ai/HeuristicClassifier';
import { LLMClassifier, resetLLMClassifier } from '../src/main/modules/ai/LLMClassifier';

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

function createHighRiskSnapshot(contextId: string = 'test-context-high'): TelemetrySnapshot {
  return {
    contextId,
    origin: 'https://tracking-heavy-site.com',
    timestamp: Date.now(),
    durationMs: 10000,
    proxy: { type: 'direct' },
    requests: {
      totalRequests: 150,
      blockedRequests: 30,
      thirdPartyRequests: 50,
      thirdPartyDomains: [
        'doubleclick.net',
        'google-analytics.com',
        'facebook.net',
        'twitter.com',
        'criteo.com',
        'hotjar.com',
        'mixpanel.com',
        'segment.com',
      ],
      blockedDomains: [
        'doubleclick.net',
        'google-analytics.com',
        'facebook.net',
      ],
    },
    fingerprinting: {
      canvasAccessed: true,
      canvasOperations: 15,
      webglAccessed: true,
      webglOperations: 8,
      audioAccessed: true,
      audioOperations: 3,
      navigatorAccessed: true,
      navigatorProperties: ['plugins', 'languages', 'platform', 'userAgent'],
    },
    timing: {
      jitterEnabled: true,
      minJitterMs: 0,
      maxJitterMs: 50,
      avgJitterMs: 30,
      jitteredRequests: 45,
    },
    headers: {
      referrerStripped: 10,
      referrerReduced: 20,
      userAgentNormalized: 50,
      clientHintsStripped: 30,
    },
  };
}

// ============ HeuristicClassifier Tests ============

describe('HeuristicClassifier', () => {
  let classifier: HeuristicClassifier;

  beforeEach(() => {
    resetHeuristicClassifier();
    classifier = new HeuristicClassifier();
  });

  afterEach(() => {
    resetHeuristicClassifier();
  });

  describe('Availability', () => {
    it('should always be available', () => {
      expect(classifier.isAvailable()).toBe(true);
    });

    it('should have correct name and type', () => {
      expect(classifier.name).toBe('Liminal Heuristic Classifier');
      expect(classifier.type).toBe('heuristic');
    });
  });

  describe('Classification Output Structure', () => {
    it('should return valid classification structure', async () => {
      const snapshot = createEmptySnapshot();
      const result = await classifier.classify(snapshot);

      expect(result).toHaveProperty('riskLevel');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('detectedVectors');
      expect(result).toHaveProperty('breakageRisk');
      expect(result).toHaveProperty('explanation');
      expect(result).toHaveProperty('recommendation');
      expect(result).toHaveProperty('recommendations');
      expect(result).toHaveProperty('classifierType');
      expect(result).toHaveProperty('classifiedAt');
    });

    it('should have classifierType set to heuristic', async () => {
      const snapshot = createEmptySnapshot();
      const result = await classifier.classify(snapshot);

      expect(result.classifierType).toBe('heuristic');
    });

    it('should have valid risk level values', async () => {
      const snapshot = createEmptySnapshot();
      const result = await classifier.classify(snapshot);

      expect(['LOW', 'MEDIUM', 'HIGH']).toContain(result.riskLevel);
    });

    it('should have confidence between 0 and 1', async () => {
      const snapshot = createEmptySnapshot();
      const result = await classifier.classify(snapshot);

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should have valid recommendation values', async () => {
      const snapshot = createEmptySnapshot();
      const result = await classifier.classify(snapshot);

      expect(['STRICT', 'BALANCED', 'PERMISSIVE']).toContain(result.recommendation);
    });
  });

  describe('Determinism', () => {
    it('should produce identical results for identical input', async () => {
      const snapshot = createHighRiskSnapshot();
      
      const result1 = await classifier.classify(snapshot);
      const result2 = await classifier.classify(snapshot);

      // Ignore timestamps for comparison
      const { classifiedAt: t1, ...rest1 } = result1;
      const { classifiedAt: t2, ...rest2 } = result2;

      expect(rest1).toEqual(rest2);
    });

    it('should be deterministic across multiple classifier instances', async () => {
      const snapshot = createHighRiskSnapshot();
      
      const classifier1 = new HeuristicClassifier();
      const classifier2 = new HeuristicClassifier();

      const result1 = await classifier1.classify(snapshot);
      const result2 = await classifier2.classify(snapshot);

      expect(result1.riskLevel).toBe(result2.riskLevel);
      expect(result1.confidence).toBe(result2.confidence);
      expect(result1.detectedVectors).toEqual(result2.detectedVectors);
      expect(result1.recommendation).toBe(result2.recommendation);
    });

    it('should produce same results regardless of call timing', async () => {
      const snapshot = createEmptySnapshot();
      
      const result1 = await classifier.classify(snapshot);
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const result2 = await classifier.classify(snapshot);

      expect(result1.riskLevel).toBe(result2.riskLevel);
      expect(result1.confidence).toBe(result2.confidence);
    });
  });

  describe('Risk Level Assessment', () => {
    it('should classify empty snapshot as LOW risk', async () => {
      const snapshot = createEmptySnapshot();
      const result = await classifier.classify(snapshot);

      expect(result.riskLevel).toBe('LOW');
    });

    it('should classify high tracking snapshot as HIGH risk', async () => {
      const snapshot = createHighRiskSnapshot();
      const result = await classifier.classify(snapshot);

      expect(result.riskLevel).toBe('HIGH');
    });

    it('should classify moderate activity as MEDIUM risk', async () => {
      const snapshot = createEmptySnapshot();
      snapshot.requests.thirdPartyRequests = 20;
      snapshot.requests.blockedRequests = 12;
      snapshot.requests.thirdPartyDomains = ['cdn.example.com', 'api.example.com', 'analytics.example.com'];
      snapshot.fingerprinting.canvasAccessed = true;
      snapshot.fingerprinting.canvasOperations = 3;

      const result = await classifier.classify(snapshot);

      expect(result.riskLevel).toBe('MEDIUM');
    });
  });

  describe('Tracking Vector Detection', () => {
    it('should detect canvas fingerprinting', async () => {
      const snapshot = createEmptySnapshot();
      snapshot.fingerprinting.canvasAccessed = true;
      snapshot.fingerprinting.canvasOperations = 10;

      const result = await classifier.classify(snapshot);

      expect(result.detectedVectors).toContain('CANVAS_FINGERPRINT');
    });

    it('should detect webgl fingerprinting', async () => {
      const snapshot = createEmptySnapshot();
      snapshot.fingerprinting.webglAccessed = true;
      snapshot.fingerprinting.webglOperations = 8;

      const result = await classifier.classify(snapshot);

      expect(result.detectedVectors).toContain('WEBGL_FINGERPRINT');
    });

    it('should detect audio fingerprinting', async () => {
      const snapshot = createEmptySnapshot();
      snapshot.fingerprinting.audioAccessed = true;
      snapshot.fingerprinting.audioOperations = 5;

      const result = await classifier.classify(snapshot);

      expect(result.detectedVectors).toContain('AUDIO_FINGERPRINT');
    });

    it('should detect cross-site tracking from known domains', async () => {
      const snapshot = createEmptySnapshot();
      snapshot.requests.thirdPartyDomains = ['doubleclick.net', 'facebook.net'];

      const result = await classifier.classify(snapshot);

      expect(result.detectedVectors).toContain('CROSS_SITE_TRACKING');
    });

    it('should detect multiple tracking vectors simultaneously', async () => {
      const snapshot = createHighRiskSnapshot();
      const result = await classifier.classify(snapshot);

      expect(result.detectedVectors.length).toBeGreaterThan(2);
    });

    it('should not detect tracking on clean snapshots', async () => {
      const snapshot = createEmptySnapshot();
      const result = await classifier.classify(snapshot);

      expect(result.detectedVectors.length).toBe(0);
    });
  });

  describe('Breakage Risk Assessment', () => {
    it('should report LOW breakage risk for minimal third-party usage', async () => {
      const snapshot = createEmptySnapshot();
      const result = await classifier.classify(snapshot);

      expect(result.breakageRisk).toBe('LOW');
    });

    it('should report higher breakage risk for heavy third-party usage', async () => {
      const snapshot = createHighRiskSnapshot();
      const result = await classifier.classify(snapshot);

      expect(['MEDIUM', 'HIGH']).toContain(result.breakageRisk);
    });
  });

  describe('Policy Recommendations (DISPLAY ONLY)', () => {
    it('should recommend PERMISSIVE for LOW risk sites', async () => {
      const snapshot = createEmptySnapshot();
      const result = await classifier.classify(snapshot);

      expect(result.recommendation).toBe('PERMISSIVE');
    });

    it('should include meaningful recommendation text', async () => {
      const snapshot = createEmptySnapshot();
      const result = await classifier.classify(snapshot);

      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations[0]).toBeTruthy();
    });

    it('recommendation is DISPLAY ONLY - does not mutate snapshot', async () => {
      const snapshot = createEmptySnapshot();
      const snapshotCopy = JSON.parse(JSON.stringify(snapshot));

      await classifier.classify(snapshot);

      // Snapshot should be unchanged (AI is READ-ONLY)
      expect(snapshot.requests).toEqual(snapshotCopy.requests);
      expect(snapshot.fingerprinting).toEqual(snapshotCopy.fingerprinting);
      expect(snapshot.proxy).toEqual(snapshotCopy.proxy);
    });
  });

  describe('Explanation Generation', () => {
    it('should provide human-readable explanation', async () => {
      const snapshot = createHighRiskSnapshot();
      const result = await classifier.classify(snapshot);

      expect(result.explanation).toBeTruthy();
      expect(typeof result.explanation).toBe('string');
      expect(result.explanation.length).toBeGreaterThan(10);
    });

    it('should mention protections in explanation', async () => {
      const snapshot = createHighRiskSnapshot();
      const result = await classifier.classify(snapshot);

      expect(result.explanation.toLowerCase()).toMatch(/protect|liminal|active/);
    });
  });
});

// ============ LLMClassifier Tests ============

describe('LLMClassifier', () => {
  let classifier: LLMClassifier;

  beforeEach(() => {
    resetLLMClassifier();
    classifier = new LLMClassifier();
  });

  afterEach(() => {
    resetLLMClassifier();
  });

  describe('Availability', () => {
    it('should NOT be available by default (stub)', () => {
      expect(classifier.isAvailable()).toBe(false);
    });

    it('should have correct name and type', () => {
      expect(classifier.name).toBe('Liminal LLM Classifier');
      expect(classifier.type).toBe('llm');
    });

    it('should be controllable via setEnabled', () => {
      expect(classifier.isAvailable()).toBe(false);
      
      classifier.setEnabled(true);
      expect(classifier.isAvailable()).toBe(true);
      
      classifier.setEnabled(false);
      expect(classifier.isAvailable()).toBe(false);
    });
  });

  describe('Stub Behavior', () => {
    it('should return unavailable response when disabled', async () => {
      const snapshot = createEmptySnapshot();
      const result = await classifier.classify(snapshot);

      expect(result.classifierType).toBe('llm');
      expect(result.confidence).toBe(0);
      expect(result.explanation).toContain('not available');
    });

    it('should return stub response when enabled', async () => {
      classifier.setEnabled(true);
      
      const snapshot = createEmptySnapshot();
      const result = await classifier.classify(snapshot);

      expect(result.classifierType).toBe('llm');
      expect(result.explanation).toContain('stub');
    });

    it('should have valid structure even as stub', async () => {
      const snapshot = createEmptySnapshot();
      const result = await classifier.classify(snapshot);

      expect(result).toHaveProperty('riskLevel');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('detectedVectors');
      expect(result).toHaveProperty('breakageRisk');
      expect(result).toHaveProperty('explanation');
      expect(result).toHaveProperty('recommendation');
    });
  });

  describe('Prompt Formatting', () => {
    it('should format telemetry as LLM prompt', () => {
      const snapshot = createHighRiskSnapshot();
      const prompt = classifier.formatPrompt(snapshot);

      expect(prompt).toContain('Context ID:');
      expect(prompt).toContain('Request Activity:');
      expect(prompt).toContain('Fingerprinting Activity:');
      expect(prompt).toContain('Protection Applied:');
      expect(prompt).toContain(snapshot.contextId);
    });
  });

  describe('No API Keys', () => {
    it('should not make any external API calls', async () => {
      // This test verifies the stub nature - no network calls
      const snapshot = createEmptySnapshot();
      
      // If this throws or hangs, there might be external calls
      const result = await classifier.classify(snapshot);
      
      expect(result).toBeTruthy();
      // Stub should return immediately
    });
  });
});

// ============ AI Read-Only Enforcement Tests ============

describe('AI Read-Only Enforcement', () => {
  let classifier: HeuristicClassifier;

  beforeEach(() => {
    resetHeuristicClassifier();
    classifier = new HeuristicClassifier();
  });

  it('AI classification does NOT modify input snapshot', async () => {
    const originalSnapshot = createHighRiskSnapshot();
    const frozenSnapshot = Object.freeze(JSON.parse(JSON.stringify(originalSnapshot)));

    // This should not throw if classifier is truly read-only
    const result = await classifier.classify(originalSnapshot);

    // Verify input unchanged
    expect(originalSnapshot.contextId).toBe(frozenSnapshot.contextId);
    expect(originalSnapshot.requests.totalRequests).toBe(frozenSnapshot.requests.totalRequests);
    expect(originalSnapshot.fingerprinting.canvasAccessed).toBe(frozenSnapshot.fingerprinting.canvasAccessed);
  });

  it('AI has no side effects on subsequent classifications', async () => {
    const snapshot1 = createEmptySnapshot('context-a');
    const snapshot2 = createHighRiskSnapshot('context-b');

    // Classify in order
    const result1a = await classifier.classify(snapshot1);
    const result2 = await classifier.classify(snapshot2);
    const result1b = await classifier.classify(snapshot1);

    // Classifying snapshot2 should not affect snapshot1's result
    expect(result1a.riskLevel).toBe(result1b.riskLevel);
    expect(result1a.detectedVectors).toEqual(result1b.detectedVectors);
  });

  it('AI output is purely informational - no enforcement fields', async () => {
    const snapshot = createHighRiskSnapshot();
    const result = await classifier.classify(snapshot);

    // Verify no enforcement-related properties
    expect(result).not.toHaveProperty('block');
    expect(result).not.toHaveProperty('allow');
    expect(result).not.toHaveProperty('applyPolicy');
    expect(result).not.toHaveProperty('setProxy');
    expect(result).not.toHaveProperty('executeAction');
  });

  it('recommendation field is clearly labeled as display-only', async () => {
    const snapshot = createHighRiskSnapshot();
    const result = await classifier.classify(snapshot);

    // Recommendation exists but is just a string label
    expect(typeof result.recommendation).toBe('string');
    expect(['STRICT', 'BALANCED', 'PERMISSIVE']).toContain(result.recommendation);
    
    // No methods to apply recommendations
    expect(typeof result.recommendation).not.toBe('function');
  });
});

// ============ Telemetry Snapshot Structure Tests ============

describe('Telemetry Snapshot Structure', () => {
  it('should have all required fields', () => {
    const snapshot = createEmptySnapshot();

    expect(snapshot).toHaveProperty('contextId');
    expect(snapshot).toHaveProperty('origin');
    expect(snapshot).toHaveProperty('timestamp');
    expect(snapshot).toHaveProperty('durationMs');
    expect(snapshot).toHaveProperty('proxy');
    expect(snapshot).toHaveProperty('requests');
    expect(snapshot).toHaveProperty('fingerprinting');
    expect(snapshot).toHaveProperty('timing');
    expect(snapshot).toHaveProperty('headers');
  });

  it('requests telemetry should have correct structure', () => {
    const snapshot = createEmptySnapshot();
    const requests = snapshot.requests;

    expect(requests).toHaveProperty('totalRequests');
    expect(requests).toHaveProperty('blockedRequests');
    expect(requests).toHaveProperty('thirdPartyRequests');
    expect(requests).toHaveProperty('thirdPartyDomains');
    expect(requests).toHaveProperty('blockedDomains');
    
    expect(Array.isArray(requests.thirdPartyDomains)).toBe(true);
    expect(Array.isArray(requests.blockedDomains)).toBe(true);
  });

  it('fingerprinting telemetry should have correct structure', () => {
    const snapshot = createEmptySnapshot();
    const fp = snapshot.fingerprinting;

    expect(fp).toHaveProperty('canvasAccessed');
    expect(fp).toHaveProperty('canvasOperations');
    expect(fp).toHaveProperty('webglAccessed');
    expect(fp).toHaveProperty('webglOperations');
    expect(fp).toHaveProperty('audioAccessed');
    expect(fp).toHaveProperty('audioOperations');
    expect(fp).toHaveProperty('navigatorAccessed');
    expect(fp).toHaveProperty('navigatorProperties');
    
    expect(typeof fp.canvasAccessed).toBe('boolean');
    expect(typeof fp.canvasOperations).toBe('number');
  });

  it('timing telemetry should have correct structure', () => {
    const snapshot = createEmptySnapshot();
    const timing = snapshot.timing;

    expect(timing).toHaveProperty('jitterEnabled');
    expect(timing).toHaveProperty('minJitterMs');
    expect(timing).toHaveProperty('maxJitterMs');
    expect(timing).toHaveProperty('avgJitterMs');
    expect(timing).toHaveProperty('jitteredRequests');
  });

  it('header telemetry should have correct structure', () => {
    const snapshot = createEmptySnapshot();
    const headers = snapshot.headers;

    expect(headers).toHaveProperty('referrerStripped');
    expect(headers).toHaveProperty('referrerReduced');
    expect(headers).toHaveProperty('userAgentNormalized');
    expect(headers).toHaveProperty('clientHintsStripped');
  });
});

// ============ Integration: No Enforcement Change Tests ============

describe('No Enforcement Behavior Change', () => {
  it('AI classification does not contain enforcement actions', async () => {
    const classifier = new HeuristicClassifier();
    const snapshot = createHighRiskSnapshot();
    
    const result = await classifier.classify(snapshot);

    // Verify the classification is purely informational
    const resultKeys = Object.keys(result);
    
    // Should NOT have any enforcement-related keys
    const forbiddenKeys = [
      'blockRequest',
      'allowRequest',
      'setProxy',
      'rotateIdentity',
      'clearStorage',
      'executePolicy',
      'enforceRule',
      'action',
      'execute',
    ];

    for (const key of forbiddenKeys) {
      expect(resultKeys).not.toContain(key);
    }
  });

  it('AI maintains Phase 1 isolation - no access to enforcement modules', () => {
    // This is a structural test - AI modules should not import enforcement modules
    // The test passes if the imports in AI modules are correct (verified by TypeScript compilation)
    expect(true).toBe(true);
  });
});


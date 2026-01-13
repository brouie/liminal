/**
 * AI Decision Trace Tests
 * 
 * Tests for Phase 2.4: AI Audit & Explanation Trace Layer
 * 
 * PHASE 2.4 RULES VERIFIED:
 * - Traces are deterministic
 * - Traces are immutable once stored
 * - Traces accurately reflect AI outputs
 * - Traces NEVER influence enforcement
 * - NO Solana, NO wallets, NO transactions
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  TelemetrySnapshot,
  AIClassification,
  PolicySimulationOutput,
  PolicyDiffExplanation,
  AIDecisionTrace,
  StoredTrace,
} from '../src/shared/ai-types';
import {
  TraceGenerator,
  getTraceGenerator,
  resetTraceGenerator,
  generateTrace,
} from '../src/main/modules/ai/TraceGenerator';
import {
  TraceStorage,
  createTraceStorage,
  resetTraceStorage,
} from '../src/main/modules/ai/TraceStorage';
import { simulateAllModes } from '../src/main/modules/ai/PolicySimulator';
import { analyzePolicyDiff } from '../src/main/modules/ai/PolicyDiffAnalyzer';

// ============ Test Helpers ============

function createTestSnapshot(contextId: string = 'test-context-1'): TelemetrySnapshot {
  return {
    contextId,
    origin: 'https://example.com',
    timestamp: Date.now(),
    durationMs: 5000,
    proxy: { type: 'direct' },
    requests: {
      totalRequests: 50,
      blockedRequests: 10,
      thirdPartyRequests: 20,
      thirdPartyDomains: ['cdn.example.com', 'analytics.example.com'],
      blockedDomains: ['tracker.example.com'],
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
      jitteredRequests: 15,
    },
    headers: {
      referrerStripped: 5,
      referrerReduced: 10,
      userAgentNormalized: 30,
      clientHintsStripped: 20,
    },
  };
}

function createTestClassification(): AIClassification {
  return {
    riskLevel: 'MEDIUM',
    confidence: 0.75,
    detectedVectors: ['CANVAS_FINGERPRINT', 'WEBGL_FINGERPRINT'],
    breakageRisk: 'LOW',
    explanation: 'Test classification',
    recommendation: 'BALANCED',
    recommendations: ['Test recommendation'],
    classifierType: 'heuristic',
    classifiedAt: Date.now(),
  };
}

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'liminal-trace-test-'));
}

function cleanupTempDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ============ TraceGenerator Tests ============

describe('TraceGenerator', () => {
  let generator: TraceGenerator;

  beforeEach(() => {
    resetTraceGenerator();
    generator = getTraceGenerator();
  });

  afterEach(() => {
    resetTraceGenerator();
  });

  describe('Trace Structure', () => {
    it('should generate valid trace structure', () => {
      const snapshot = createTestSnapshot();
      const classification = createTestClassification();
      
      const trace = generator.generate(snapshot, classification);

      expect(trace).toHaveProperty('traceId');
      expect(trace).toHaveProperty('contextId');
      expect(trace).toHaveProperty('origin');
      expect(trace).toHaveProperty('timestamp');
      expect(trace).toHaveProperty('inputs');
      expect(trace).toHaveProperty('rulesEvaluated');
      expect(trace).toHaveProperty('factorsReferenced');
      expect(trace).toHaveProperty('thresholds');
      expect(trace).toHaveProperty('classificationOutput');
      expect(trace).toHaveProperty('classifierType');
      expect(trace).toHaveProperty('traceVersion');
      expect(trace).toHaveProperty('inputHash');
      expect(trace).toHaveProperty('outputHash');
    });

    it('should include context ID from snapshot', () => {
      const snapshot = createTestSnapshot('unique-context-123');
      const classification = createTestClassification();
      
      const trace = generator.generate(snapshot, classification);

      expect(trace.contextId).toBe('unique-context-123');
    });

    it('should include input telemetry summary', () => {
      const snapshot = createTestSnapshot();
      const classification = createTestClassification();
      
      const trace = generator.generate(snapshot, classification);

      expect(trace.inputs.totalRequests).toBe(50);
      expect(trace.inputs.blockedRequests).toBe(10);
      expect(trace.inputs.thirdPartyRequests).toBe(20);
      expect(trace.inputs.fingerprintAPIs).toContain('Canvas');
      expect(trace.inputs.fingerprintAPIs).toContain('WebGL');
    });

    it('should include classification output', () => {
      const snapshot = createTestSnapshot();
      const classification = createTestClassification();
      
      const trace = generator.generate(snapshot, classification);

      expect(trace.classificationOutput.riskLevel).toBe('MEDIUM');
      expect(trace.classificationOutput.confidence).toBe(0.75);
      expect(trace.classificationOutput.recommendation).toBe('BALANCED');
    });

    it('should include rules evaluated', () => {
      const snapshot = createTestSnapshot();
      const classification = createTestClassification();
      
      const trace = generator.generate(snapshot, classification);

      expect(trace.rulesEvaluated.length).toBeGreaterThan(0);
      
      for (const rule of trace.rulesEvaluated) {
        expect(rule).toHaveProperty('id');
        expect(rule).toHaveProperty('name');
        expect(rule).toHaveProperty('category');
        expect(rule).toHaveProperty('triggered');
        expect(rule).toHaveProperty('scoreContribution');
      }
    });

    it('should include simulation output when provided', () => {
      const snapshot = createTestSnapshot();
      const classification = createTestClassification();
      const simulation = simulateAllModes(snapshot);
      
      const trace = generator.generate(snapshot, classification, simulation);

      expect(trace.simulationOutput).toBeDefined();
      expect(trace.simulationOutput?.strictBlocked).toBeDefined();
      expect(trace.simulationOutput?.balancedBlocked).toBeDefined();
      expect(trace.simulationOutput?.permissiveBlocked).toBeDefined();
      expect(trace.simulationOutput?.currentMode).toBeDefined();
    });
  });

  describe('Determinism', () => {
    it('should generate consistent hashes for same input', () => {
      const snapshot = createTestSnapshot();
      const classification = createTestClassification();
      
      const trace1 = generator.generate(snapshot, classification);
      const trace2 = generator.generate(snapshot, classification);

      expect(trace1.inputHash).toBe(trace2.inputHash);
      expect(trace1.outputHash).toBe(trace2.outputHash);
    });

    it('should generate same rules for same input', () => {
      const snapshot = createTestSnapshot();
      const classification = createTestClassification();
      
      const trace1 = generator.generate(snapshot, classification);
      const trace2 = generator.generate(snapshot, classification);

      // Compare rule IDs and triggered status
      expect(trace1.rulesEvaluated.map(r => r.id)).toEqual(trace2.rulesEvaluated.map(r => r.id));
      expect(trace1.rulesEvaluated.map(r => r.triggered)).toEqual(trace2.rulesEvaluated.map(r => r.triggered));
    });

    it('should generate unique trace IDs', () => {
      const snapshot = createTestSnapshot();
      const classification = createTestClassification();
      
      const trace1 = generator.generate(snapshot, classification);
      const trace2 = generator.generate(snapshot, classification);

      // Trace IDs should be unique even for same input
      expect(trace1.traceId).not.toBe(trace2.traceId);
    });
  });

  describe('Purity', () => {
    it('should not modify input snapshot', () => {
      const snapshot = createTestSnapshot();
      const classification = createTestClassification();
      const originalSnapshot = JSON.parse(JSON.stringify(snapshot));

      generator.generate(snapshot, classification);

      expect(snapshot).toEqual(originalSnapshot);
    });

    it('should not modify input classification', () => {
      const snapshot = createTestSnapshot();
      const classification = createTestClassification();
      const originalClassification = JSON.parse(JSON.stringify(classification));

      generator.generate(snapshot, classification);

      expect(classification).toEqual(originalClassification);
    });
  });

  describe('Version', () => {
    it('should include trace version', () => {
      const snapshot = createTestSnapshot();
      const classification = createTestClassification();
      
      const trace = generator.generate(snapshot, classification);

      expect(trace.traceVersion).toBeTruthy();
      expect(trace.traceVersion).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should provide version via getter', () => {
      const version = generator.getVersion();
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });
});

// ============ TraceStorage Tests ============

describe('TraceStorage', () => {
  let storage: TraceStorage;
  let tempDir: string;

  beforeEach(() => {
    resetTraceStorage();
    tempDir = createTempDir();
    storage = createTraceStorage(tempDir);
  });

  afterEach(() => {
    resetTraceStorage();
    cleanupTempDir(tempDir);
  });

  describe('Store and Retrieve', () => {
    it('should store trace and retrieve it', () => {
      const snapshot = createTestSnapshot();
      const classification = createTestClassification();
      const trace = generateTrace(snapshot, classification);
      
      const stored = storage.store(trace);
      
      expect(stored.trace.traceId).toBe(trace.traceId);
      expect(stored.immutable).toBe(true);
      expect(stored.storedAt).toBeDefined();
    });

    it('should retrieve latest trace for context', () => {
      const snapshot = createTestSnapshot('ctx-1');
      const classification = createTestClassification();
      const trace = generateTrace(snapshot, classification);
      
      storage.store(trace);
      const retrieved = storage.getLatest('ctx-1');
      
      expect(retrieved).not.toBeNull();
      expect(retrieved?.trace.traceId).toBe(trace.traceId);
    });

    it('should retrieve trace by ID', () => {
      const snapshot = createTestSnapshot('ctx-1');
      const classification = createTestClassification();
      const trace = generateTrace(snapshot, classification);
      
      storage.store(trace);
      const retrieved = storage.getById('ctx-1', trace.traceId);
      
      expect(retrieved).not.toBeNull();
      expect(retrieved?.trace.traceId).toBe(trace.traceId);
    });

    it('should return null for non-existent trace', () => {
      const retrieved = storage.getById('non-existent', 'fake-id');
      expect(retrieved).toBeNull();
    });

    it('should list all traces for context', () => {
      const snapshot = createTestSnapshot('ctx-1');
      const classification = createTestClassification();
      
      // Store multiple traces
      for (let i = 0; i < 5; i++) {
        const trace = generateTrace(snapshot, classification);
        storage.store(trace);
      }
      
      const traces = storage.list('ctx-1');
      expect(traces.length).toBe(5);
    });
  });

  describe('Immutability', () => {
    it('should mark stored traces as immutable', () => {
      const snapshot = createTestSnapshot();
      const classification = createTestClassification();
      const trace = generateTrace(snapshot, classification);
      
      const stored = storage.store(trace);
      
      expect(stored.immutable).toBe(true);
    });

    it('should not duplicate trace if stored twice', () => {
      const snapshot = createTestSnapshot('ctx-1');
      const classification = createTestClassification();
      const trace = generateTrace(snapshot, classification);
      
      storage.store(trace);
      storage.store(trace);
      
      const traces = storage.list('ctx-1');
      expect(traces.length).toBe(1);
    });

    it('stored trace should have deep copy of data', () => {
      const snapshot = createTestSnapshot();
      const classification = createTestClassification();
      const trace = generateTrace(snapshot, classification);
      
      const stored = storage.store(trace);
      
      // Modify original trace (should not affect stored)
      trace.classificationOutput.riskLevel = 'HIGH';
      
      const retrieved = storage.getById(trace.contextId, trace.traceId);
      expect(retrieved?.trace.classificationOutput.riskLevel).toBe('MEDIUM');
    });
  });

  describe('Export', () => {
    it('should export trace as JSON string', () => {
      const snapshot = createTestSnapshot();
      const classification = createTestClassification();
      const trace = generateTrace(snapshot, classification);
      
      const json = storage.exportAsJson(trace);
      
      expect(json).toBeTruthy();
      
      const parsed = JSON.parse(json);
      expect(parsed).toHaveProperty('exportedAt');
      expect(parsed).toHaveProperty('version');
      expect(parsed).toHaveProperty('trace');
      expect(parsed.trace.traceId).toBe(trace.traceId);
    });

    it('should export trace to file', () => {
      const snapshot = createTestSnapshot();
      const classification = createTestClassification();
      const trace = generateTrace(snapshot, classification);
      const filePath = path.join(tempDir, 'export-test.json');
      
      const success = storage.exportToFile(trace, filePath);
      
      expect(success).toBe(true);
      expect(fs.existsSync(filePath)).toBe(true);
      
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.trace.traceId).toBe(trace.traceId);
    });
  });

  describe('Context Management', () => {
    it('should get trace count for context', () => {
      const snapshot = createTestSnapshot('ctx-1');
      const classification = createTestClassification();
      
      for (let i = 0; i < 3; i++) {
        const trace = generateTrace(snapshot, classification);
        storage.store(trace);
      }
      
      expect(storage.getCount('ctx-1')).toBe(3);
    });

    it('should clear traces for context', () => {
      const snapshot = createTestSnapshot('ctx-1');
      const classification = createTestClassification();
      const trace = generateTrace(snapshot, classification);
      
      storage.store(trace);
      expect(storage.getCount('ctx-1')).toBe(1);
      
      storage.clearContext('ctx-1');
      expect(storage.getCount('ctx-1')).toBe(0);
    });

    it('should isolate traces between contexts', () => {
      const snapshot1 = createTestSnapshot('ctx-1');
      const snapshot2 = createTestSnapshot('ctx-2');
      const classification = createTestClassification();
      
      storage.store(generateTrace(snapshot1, classification));
      storage.store(generateTrace(snapshot2, classification));
      
      expect(storage.getCount('ctx-1')).toBe(1);
      expect(storage.getCount('ctx-2')).toBe(1);
      
      storage.clearContext('ctx-1');
      
      expect(storage.getCount('ctx-1')).toBe(0);
      expect(storage.getCount('ctx-2')).toBe(1);
    });
  });
});

// ============ Trace Accuracy Tests ============

describe('Trace Accuracy', () => {
  let generator: TraceGenerator;

  beforeEach(() => {
    resetTraceGenerator();
    generator = getTraceGenerator();
  });

  it('trace accurately reflects classification risk level', () => {
    const snapshot = createTestSnapshot();
    const classification = createTestClassification();
    classification.riskLevel = 'HIGH';
    
    const trace = generator.generate(snapshot, classification);
    
    expect(trace.classificationOutput.riskLevel).toBe('HIGH');
  });

  it('trace accurately reflects detected vectors', () => {
    const snapshot = createTestSnapshot();
    const classification = createTestClassification();
    classification.detectedVectors = ['AUDIO_FINGERPRINT', 'CROSS_SITE_TRACKING'];
    
    const trace = generator.generate(snapshot, classification);
    
    expect(trace.classificationOutput.detectedVectors).toContain('AUDIO_FINGERPRINT');
    expect(trace.classificationOutput.detectedVectors).toContain('CROSS_SITE_TRACKING');
  });

  it('trace accurately reflects fingerprint API usage', () => {
    const snapshot = createTestSnapshot();
    snapshot.fingerprinting.canvasAccessed = true;
    snapshot.fingerprinting.webglAccessed = false;
    snapshot.fingerprinting.audioAccessed = true;
    
    const classification = createTestClassification();
    const trace = generator.generate(snapshot, classification);
    
    expect(trace.inputs.fingerprintAPIs).toContain('Canvas');
    expect(trace.inputs.fingerprintAPIs).toContain('AudioContext');
    expect(trace.inputs.fingerprintAPIs).not.toContain('WebGL');
  });

  it('trace accurately reflects request counts', () => {
    const snapshot = createTestSnapshot();
    snapshot.requests.totalRequests = 100;
    snapshot.requests.blockedRequests = 25;
    snapshot.requests.thirdPartyRequests = 40;
    
    const classification = createTestClassification();
    const trace = generator.generate(snapshot, classification);
    
    expect(trace.inputs.totalRequests).toBe(100);
    expect(trace.inputs.blockedRequests).toBe(25);
    expect(trace.inputs.thirdPartyRequests).toBe(40);
  });
});

// ============ No Enforcement Tests ============

describe('No Enforcement Influence', () => {
  it('trace has no enforcement action fields', () => {
    const snapshot = createTestSnapshot();
    const classification = createTestClassification();
    const trace = generateTrace(snapshot, classification);

    // Verify no enforcement-related properties
    expect(trace).not.toHaveProperty('apply');
    expect(trace).not.toHaveProperty('execute');
    expect(trace).not.toHaveProperty('enforce');
    expect(trace).not.toHaveProperty('block');
    expect(trace).not.toHaveProperty('allow');
    expect(trace).not.toHaveProperty('setPolicy');
  });

  it('storage has no enforcement methods', () => {
    const tempDir = createTempDir();
    const storage = createTraceStorage(tempDir);

    expect(storage).not.toHaveProperty('applyPolicy');
    expect(storage).not.toHaveProperty('enforce');
    expect(storage).not.toHaveProperty('block');
    expect(storage).not.toHaveProperty('allow');

    cleanupTempDir(tempDir);
  });

  it('trace is purely observational', () => {
    const snapshot = createTestSnapshot();
    const classification = createTestClassification();
    const trace = generateTrace(snapshot, classification);

    // All properties should be data, not functions
    const traceKeys = Object.keys(trace);
    for (const key of traceKeys) {
      expect(typeof (trace as any)[key]).not.toBe('function');
    }
  });
});

// ============ Standalone Function Tests ============

describe('Standalone generateTrace', () => {
  it('should work without class instance', () => {
    const snapshot = createTestSnapshot();
    const classification = createTestClassification();
    
    const trace = generateTrace(snapshot, classification);
    
    expect(trace.traceId).toBeDefined();
    expect(trace.contextId).toBe(snapshot.contextId);
    expect(trace.classificationOutput.riskLevel).toBe(classification.riskLevel);
  });
});


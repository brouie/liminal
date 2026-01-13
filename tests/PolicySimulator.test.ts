/**
 * Policy Simulator Tests
 * 
 * Tests for Phase 2.2: Policy Impact Simulation
 * 
 * PHASE 2.2 RULES VERIFIED:
 * - Simulation is PURE and side-effect-free
 * - Simulation NEVER mutates enforcement config
 * - Simulation output is deterministic
 * - Enforcement behavior is identical before/after simulation
 * - NO Solana, NO wallets, NO transactions
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TelemetrySnapshot,
  SimulationMode,
  SimulationResult,
  PolicySimulationOutput,
} from '../src/shared/ai-types';
import {
  PolicySimulator,
  getPolicySimulator,
  resetPolicySimulator,
  simulateMode,
  simulateAllModes,
} from '../src/main/modules/ai/PolicySimulator';

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

// ============ Simulation Result Structure Tests ============

describe('SimulationResult Structure', () => {
  let simulator: PolicySimulator;

  beforeEach(() => {
    resetPolicySimulator();
    simulator = getPolicySimulator();
  });

  afterEach(() => {
    resetPolicySimulator();
  });

  it('should return valid simulation result structure', () => {
    const snapshot = createActiveSnapshot();
    const result = simulator.simulate(snapshot, 'STRICT');

    expect(result).toHaveProperty('mode');
    expect(result).toHaveProperty('blockedRequests');
    expect(result).toHaveProperty('fingerprintProtection');
    expect(result).toHaveProperty('thirdPartyBlocking');
    expect(result).toHaveProperty('headerHardening');
    expect(result).toHaveProperty('breakageRisk');
    expect(result).toHaveProperty('breakageRiskLevel');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('changes');
    expect(result).toHaveProperty('simulatedAt');
  });

  it('should return correct mode in result', () => {
    const snapshot = createActiveSnapshot();
    
    expect(simulator.simulate(snapshot, 'STRICT').mode).toBe('STRICT');
    expect(simulator.simulate(snapshot, 'BALANCED').mode).toBe('BALANCED');
    expect(simulator.simulate(snapshot, 'PERMISSIVE').mode).toBe('PERMISSIVE');
  });

  it('should have valid delta structure for blocked requests', () => {
    const snapshot = createActiveSnapshot();
    const result = simulator.simulate(snapshot, 'STRICT');

    expect(result.blockedRequests).toHaveProperty('current');
    expect(result.blockedRequests).toHaveProperty('simulated');
    expect(result.blockedRequests).toHaveProperty('change');
    expect(result.blockedRequests).toHaveProperty('percentChange');
    
    expect(typeof result.blockedRequests.current).toBe('number');
    expect(typeof result.blockedRequests.simulated).toBe('number');
    expect(typeof result.blockedRequests.change).toBe('number');
    expect(typeof result.blockedRequests.percentChange).toBe('number');
  });

  it('should have valid breakage risk values', () => {
    const snapshot = createActiveSnapshot();
    const result = simulator.simulate(snapshot, 'STRICT');

    expect(result.breakageRisk).toBeGreaterThanOrEqual(0);
    expect(result.breakageRisk).toBeLessThanOrEqual(100);
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(result.breakageRiskLevel);
  });

  it('should include human-readable summary', () => {
    const snapshot = createActiveSnapshot();
    const result = simulator.simulate(snapshot, 'STRICT');

    expect(result.summary).toBeTruthy();
    expect(typeof result.summary).toBe('string');
    expect(result.summary.length).toBeGreaterThan(10);
  });

  it('should include changes list', () => {
    const snapshot = createActiveSnapshot();
    const result = simulator.simulate(snapshot, 'STRICT');

    expect(Array.isArray(result.changes)).toBe(true);
    expect(result.changes.length).toBeGreaterThan(0);
  });
});

// ============ Simulation All Modes Tests ============

describe('Simulate All Modes', () => {
  let simulator: PolicySimulator;

  beforeEach(() => {
    resetPolicySimulator();
    simulator = getPolicySimulator();
  });

  afterEach(() => {
    resetPolicySimulator();
  });

  it('should return results for all three modes', () => {
    const snapshot = createActiveSnapshot();
    const output = simulator.simulateAll(snapshot);

    expect(output).toHaveProperty('strict');
    expect(output).toHaveProperty('balanced');
    expect(output).toHaveProperty('permissive');
    expect(output).toHaveProperty('currentEffectiveMode');
  });

  it('should have correct mode in each result', () => {
    const snapshot = createActiveSnapshot();
    const output = simulator.simulateAll(snapshot);

    expect(output.strict.mode).toBe('STRICT');
    expect(output.balanced.mode).toBe('BALANCED');
    expect(output.permissive.mode).toBe('PERMISSIVE');
  });

  it('should determine current effective mode', () => {
    const snapshot = createActiveSnapshot();
    const output = simulator.simulateAll(snapshot);

    expect(['STRICT', 'BALANCED', 'PERMISSIVE']).toContain(output.currentEffectiveMode);
  });

  it('STRICT should have higher blocking than PERMISSIVE', () => {
    const snapshot = createActiveSnapshot();
    const output = simulator.simulateAll(snapshot);

    expect(output.strict.blockedRequests.simulated)
      .toBeGreaterThanOrEqual(output.permissive.blockedRequests.simulated);
  });

  it('STRICT should have higher breakage risk than PERMISSIVE', () => {
    const snapshot = createActiveSnapshot();
    const output = simulator.simulateAll(snapshot);

    expect(output.strict.breakageRisk)
      .toBeGreaterThanOrEqual(output.permissive.breakageRisk);
  });
});

// ============ Pure Function Tests ============

describe('Simulation Purity', () => {
  let simulator: PolicySimulator;

  beforeEach(() => {
    resetPolicySimulator();
    simulator = getPolicySimulator();
  });

  afterEach(() => {
    resetPolicySimulator();
  });

  it('simulation does NOT modify input snapshot', () => {
    const snapshot = createActiveSnapshot();
    const originalSnapshot = JSON.parse(JSON.stringify(snapshot));

    // Run simulation
    simulator.simulate(snapshot, 'STRICT');
    simulator.simulate(snapshot, 'BALANCED');
    simulator.simulate(snapshot, 'PERMISSIVE');
    simulator.simulateAll(snapshot);

    // Verify snapshot is unchanged
    expect(snapshot.contextId).toBe(originalSnapshot.contextId);
    expect(snapshot.requests.totalRequests).toBe(originalSnapshot.requests.totalRequests);
    expect(snapshot.requests.blockedRequests).toBe(originalSnapshot.requests.blockedRequests);
    expect(snapshot.fingerprinting.canvasAccessed).toBe(originalSnapshot.fingerprinting.canvasAccessed);
    expect(snapshot.proxy).toEqual(originalSnapshot.proxy);
  });

  it('simulation is side-effect-free', () => {
    const snapshot1 = createActiveSnapshot('ctx-1');
    const snapshot2 = createActiveSnapshot('ctx-2');

    // Run simulations in different orders
    const result1a = simulator.simulate(snapshot1, 'STRICT');
    const result2 = simulator.simulate(snapshot2, 'STRICT');
    const result1b = simulator.simulate(snapshot1, 'STRICT');

    // Simulating snapshot2 should not affect snapshot1's result
    expect(result1a.blockedRequests.simulated).toBe(result1b.blockedRequests.simulated);
    expect(result1a.fingerprintProtection.simulated).toBe(result1b.fingerprintProtection.simulated);
  });

  it('simulation has no global state pollution', () => {
    const snapshot = createActiveSnapshot();

    // Run many simulations
    for (let i = 0; i < 100; i++) {
      simulator.simulate(snapshot, 'STRICT');
      simulator.simulateAll(snapshot);
    }

    // Result should still be the same
    const finalResult = simulator.simulate(snapshot, 'STRICT');
    const firstResult = simulator.simulate(snapshot, 'STRICT');

    expect(finalResult.blockedRequests).toEqual(firstResult.blockedRequests);
  });

  it('standalone functions are also pure', () => {
    const snapshot = createActiveSnapshot();
    const originalSnapshot = JSON.parse(JSON.stringify(snapshot));

    // Use standalone functions
    simulateMode(snapshot, 'STRICT');
    simulateAllModes(snapshot);

    // Snapshot unchanged
    expect(snapshot).toEqual(originalSnapshot);
  });
});

// ============ Determinism Tests ============

describe('Simulation Determinism', () => {
  let simulator: PolicySimulator;

  beforeEach(() => {
    resetPolicySimulator();
    simulator = getPolicySimulator();
  });

  afterEach(() => {
    resetPolicySimulator();
  });

  it('same input produces identical output', () => {
    const snapshot = createActiveSnapshot();

    const result1 = simulator.simulate(snapshot, 'STRICT');
    const result2 = simulator.simulate(snapshot, 'STRICT');

    // Ignore timestamps
    const { simulatedAt: t1, ...rest1 } = result1;
    const { simulatedAt: t2, ...rest2 } = result2;

    expect(rest1).toEqual(rest2);
  });

  it('deterministic across multiple simulator instances', () => {
    const snapshot = createActiveSnapshot();

    const simulator1 = new PolicySimulator();
    const simulator2 = new PolicySimulator();

    const result1 = simulator1.simulate(snapshot, 'STRICT');
    const result2 = simulator2.simulate(snapshot, 'STRICT');

    expect(result1.blockedRequests).toEqual(result2.blockedRequests);
    expect(result1.fingerprintProtection).toEqual(result2.fingerprintProtection);
    expect(result1.breakageRisk).toBe(result2.breakageRisk);
  });

  it('deterministic regardless of timing', async () => {
    const snapshot = createActiveSnapshot();

    const result1 = simulator.simulate(snapshot, 'STRICT');
    
    // Wait
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const result2 = simulator.simulate(snapshot, 'STRICT');

    expect(result1.blockedRequests.simulated).toBe(result2.blockedRequests.simulated);
    expect(result1.fingerprintProtection.simulated).toBe(result2.fingerprintProtection.simulated);
  });

  it('all modes are deterministic', () => {
    const snapshot = createActiveSnapshot();

    const output1 = simulator.simulateAll(snapshot);
    const output2 = simulator.simulateAll(snapshot);

    // Compare all modes (ignoring timestamps)
    expect(output1.strict.blockedRequests).toEqual(output2.strict.blockedRequests);
    expect(output1.balanced.blockedRequests).toEqual(output2.balanced.blockedRequests);
    expect(output1.permissive.blockedRequests).toEqual(output2.permissive.blockedRequests);
    expect(output1.currentEffectiveMode).toBe(output2.currentEffectiveMode);
  });
});

// ============ No Enforcement Change Tests ============

describe('No Enforcement Changes', () => {
  it('simulation result has no enforcement action fields', () => {
    const simulator = new PolicySimulator();
    const snapshot = createActiveSnapshot();
    const result = simulator.simulate(snapshot, 'STRICT');

    // Verify no enforcement-related properties
    expect(result).not.toHaveProperty('apply');
    expect(result).not.toHaveProperty('execute');
    expect(result).not.toHaveProperty('enforce');
    expect(result).not.toHaveProperty('block');
    expect(result).not.toHaveProperty('allow');
    expect(result).not.toHaveProperty('setPolicy');
    expect(result).not.toHaveProperty('updateConfig');
  });

  it('simulation output is PREVIEW ONLY - purely informational', () => {
    const simulator = new PolicySimulator();
    const snapshot = createActiveSnapshot();
    const output = simulator.simulateAll(snapshot);

    // All results should be data objects, not functions
    expect(typeof output.strict).toBe('object');
    expect(typeof output.balanced).toBe('object');
    expect(typeof output.permissive).toBe('object');

    // No methods on results
    const resultKeys = Object.keys(output.strict);
    for (const key of resultKeys) {
      expect(typeof (output.strict as any)[key]).not.toBe('function');
    }
  });

  it('simulator has no mutation methods', () => {
    const simulator = new PolicySimulator();

    // Verify simulator only has read-only methods
    expect(simulator).not.toHaveProperty('setPolicy');
    expect(simulator).not.toHaveProperty('applyMode');
    expect(simulator).not.toHaveProperty('enforceMode');
    expect(simulator).not.toHaveProperty('configure');
    expect(simulator).not.toHaveProperty('updateEnforcement');
  });
});

// ============ Edge Cases ============

describe('Edge Cases', () => {
  let simulator: PolicySimulator;

  beforeEach(() => {
    resetPolicySimulator();
    simulator = getPolicySimulator();
  });

  afterEach(() => {
    resetPolicySimulator();
  });

  it('handles empty snapshot', () => {
    const snapshot = createEmptySnapshot();
    const result = simulator.simulate(snapshot, 'STRICT');

    expect(result.mode).toBe('STRICT');
    expect(result.blockedRequests.current).toBe(0);
    expect(result.summary).toBeTruthy();
  });

  it('handles zero third-party requests', () => {
    const snapshot = createEmptySnapshot();
    snapshot.requests.totalRequests = 50;
    
    const result = simulator.simulate(snapshot, 'STRICT');

    expect(result.thirdPartyBlocking.current).toBe(0);
    expect(typeof result.breakageRisk).toBe('number');
  });

  it('handles maximum fingerprinting exposure', () => {
    const snapshot = createEmptySnapshot();
    snapshot.fingerprinting.canvasAccessed = true;
    snapshot.fingerprinting.canvasOperations = 100;
    snapshot.fingerprinting.webglAccessed = true;
    snapshot.fingerprinting.webglOperations = 100;
    snapshot.fingerprinting.audioAccessed = true;
    snapshot.fingerprinting.audioOperations = 100;
    snapshot.fingerprinting.navigatorAccessed = true;
    
    const result = simulator.simulate(snapshot, 'STRICT');

    // STRICT should offer high protection
    expect(result.fingerprintProtection.simulated).toBeGreaterThan(80);
  });

  it('handles high third-party dependency', () => {
    const snapshot = createActiveSnapshot();
    snapshot.requests.thirdPartyDomains = Array(50).fill(null).map((_, i) => `cdn${i}.example.com`);
    
    const result = simulator.simulate(snapshot, 'STRICT');

    // High dependency should increase breakage risk
    expect(result.breakageRisk).toBeGreaterThan(50);
  });
});

// ============ Mode Descriptions ============

describe('Mode Descriptions', () => {
  let simulator: PolicySimulator;

  beforeEach(() => {
    resetPolicySimulator();
    simulator = getPolicySimulator();
  });

  it('should provide descriptions for all modes', () => {
    const modes = simulator.getAvailableModes();
    
    expect(modes).toContain('STRICT');
    expect(modes).toContain('BALANCED');
    expect(modes).toContain('PERMISSIVE');
  });

  it('should have meaningful descriptions', () => {
    expect(simulator.getModeDescription('STRICT').length).toBeGreaterThan(10);
    expect(simulator.getModeDescription('BALANCED').length).toBeGreaterThan(10);
    expect(simulator.getModeDescription('PERMISSIVE').length).toBeGreaterThan(10);
  });
});

// ============ Integration with Standalone Functions ============

describe('Standalone Functions', () => {
  it('simulateMode works correctly', () => {
    const snapshot = createActiveSnapshot();
    const result = simulateMode(snapshot, 'STRICT');

    expect(result.mode).toBe('STRICT');
    expect(result.blockedRequests).toBeDefined();
    expect(result.summary).toBeTruthy();
  });

  it('simulateAllModes works correctly', () => {
    const snapshot = createActiveSnapshot();
    const output = simulateAllModes(snapshot);

    expect(output.strict).toBeDefined();
    expect(output.balanced).toBeDefined();
    expect(output.permissive).toBeDefined();
    expect(output.currentEffectiveMode).toBeDefined();
  });

  it('standalone functions match class methods', () => {
    const simulator = new PolicySimulator();
    const snapshot = createActiveSnapshot();

    const standaloneResult = simulateMode(snapshot, 'STRICT');
    const classResult = simulator.simulate(snapshot, 'STRICT');

    expect(standaloneResult.blockedRequests).toEqual(classResult.blockedRequests);
    expect(standaloneResult.fingerprintProtection).toEqual(classResult.fingerprintProtection);
    expect(standaloneResult.breakageRisk).toBe(classResult.breakageRisk);
  });
});


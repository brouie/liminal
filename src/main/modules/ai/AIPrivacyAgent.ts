/**
 * AIPrivacyAgent - AI Observation and Explanation Layer
 * 
 * The main AI module that coordinates telemetry collection and classification.
 * 
 * PHASE 2 RULES:
 * - This agent is READ-ONLY
 * - It does NOT block, allow, route, or enforce anything
 * - It ONLY observes, classifies, explains, and recommends
 * - Recommendations are DISPLAY ONLY
 * 
 * PHASE 2.2 ADDITION:
 * - Policy simulation is PREVIEW ONLY
 * - Simulation does NOT affect enforcement
 * 
 * NO Solana, NO wallets, NO transactions.
 */

import { ContextId } from '../../../shared/types';
import {
  TelemetrySnapshot,
  AIClassification,
  AIClassificationWithSimulation,
  IAIClassifier,
  PolicySimulationOutput,
  PolicyDiffExplanation,
  AIDecisionTrace,
  StoredTrace,
  SimulationMode,
  SimulationResult,
} from '../../../shared/ai-types';
import { getTelemetryCollector, TelemetryCollector } from './TelemetryCollector';
import { getHeuristicClassifier, HeuristicClassifier } from './HeuristicClassifier';
import { getLLMClassifier, LLMClassifier } from './LLMClassifier';
import { getPolicySimulator, PolicySimulator } from './PolicySimulator';
import { getPolicyDiffAnalyzer, PolicyDiffAnalyzer } from './PolicyDiffAnalyzer';
import { getTraceGenerator, TraceGenerator } from './TraceGenerator';
import { getTraceStorage, TraceStorage } from './TraceStorage';

/**
 * Classification cache entry
 */
interface CachedClassification {
  classification: AIClassification;
  snapshotHash: string;
  cachedAt: number;
}

/**
 * Cache TTL in milliseconds (30 seconds)
 */
const CACHE_TTL_MS = 30000;

export class AIPrivacyAgent {
  private telemetryCollector: TelemetryCollector;
  private heuristicClassifier: HeuristicClassifier;
  private llmClassifier: LLMClassifier;
  private policySimulator: PolicySimulator;
  private policyDiffAnalyzer: PolicyDiffAnalyzer;
  private traceGenerator: TraceGenerator;
  private traceStorage: TraceStorage;
  
  /** Classification cache per context */
  private cache: Map<ContextId, CachedClassification> = new Map();
  
  /** Subscribers for classification updates */
  private subscribers: Map<ContextId, Set<(classification: AIClassification) => void>> = new Map();

  constructor() {
    this.telemetryCollector = getTelemetryCollector();
    this.heuristicClassifier = getHeuristicClassifier();
    this.llmClassifier = getLLMClassifier();
    this.policySimulator = getPolicySimulator();
    this.policyDiffAnalyzer = getPolicyDiffAnalyzer();
    this.traceGenerator = getTraceGenerator();
    this.traceStorage = getTraceStorage();
  }

  /**
   * Get telemetry snapshot for a context (READ-ONLY)
   */
  getTelemetry(contextId: ContextId): TelemetrySnapshot | null {
    return this.telemetryCollector.generateSnapshot(contextId);
  }

  /**
   * Classify a context's privacy status (READ-ONLY)
   * Uses caching to avoid redundant classifications
   */
  async classify(contextId: ContextId, forceRefresh: boolean = false): Promise<AIClassification | null> {
    // Get telemetry snapshot
    const snapshot = this.telemetryCollector.generateSnapshot(contextId);
    if (!snapshot) {
      return null;
    }

    // Check cache
    const snapshotHash = this.hashSnapshot(snapshot);
    const cached = this.cache.get(contextId);
    
    if (!forceRefresh && cached) {
      const age = Date.now() - cached.cachedAt;
      if (age < CACHE_TTL_MS && cached.snapshotHash === snapshotHash) {
        return cached.classification;
      }
    }

    // Select classifier
    const classifier = this.selectClassifier();
    
    // Perform classification (READ-ONLY operation)
    const classification = await classifier.classify(snapshot);

    // Cache result
    this.cache.set(contextId, {
      classification,
      snapshotHash,
      cachedAt: Date.now(),
    });

    // Notify subscribers
    this.notifySubscribers(contextId, classification);

    return classification;
  }

  /**
   * Select the best available classifier
   */
  private selectClassifier(): IAIClassifier {
    // Prefer LLM if available, fall back to heuristic
    if (this.llmClassifier.isAvailable()) {
      return this.llmClassifier;
    }
    return this.heuristicClassifier;
  }

  /**
   * Get list of available classifiers
   */
  getAvailableClassifiers(): { name: string; type: string; available: boolean }[] {
    return [
      {
        name: this.heuristicClassifier.name,
        type: this.heuristicClassifier.type,
        available: this.heuristicClassifier.isAvailable(),
      },
      {
        name: this.llmClassifier.name,
        type: this.llmClassifier.type,
        available: this.llmClassifier.isAvailable(),
      },
    ];
  }

  /**
   * Subscribe to classification updates for a context
   */
  subscribe(contextId: ContextId, callback: (classification: AIClassification) => void): () => void {
    if (!this.subscribers.has(contextId)) {
      this.subscribers.set(contextId, new Set());
    }
    this.subscribers.get(contextId)!.add(callback);

    // Return unsubscribe function
    return () => {
      const subs = this.subscribers.get(contextId);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this.subscribers.delete(contextId);
        }
      }
    };
  }

  /**
   * Notify subscribers of classification update
   */
  private notifySubscribers(contextId: ContextId, classification: AIClassification): void {
    const subs = this.subscribers.get(contextId);
    if (subs) {
      for (const callback of subs) {
        try {
          callback(classification);
        } catch (error) {
          console.error('AI classification subscriber error:', error);
        }
      }
    }
  }

  /**
   * Create a simple hash of snapshot for cache invalidation
   */
  private hashSnapshot(snapshot: TelemetrySnapshot): string {
    // Simple hash based on key metrics
    return [
      snapshot.requests.totalRequests,
      snapshot.requests.blockedRequests,
      snapshot.fingerprinting.canvasOperations,
      snapshot.fingerprinting.webglOperations,
      snapshot.headers.referrerStripped,
      Math.floor(snapshot.durationMs / 10000), // Bucket by 10s intervals
    ].join(':');
  }

  /**
   * Clear cache for a context
   */
  clearCache(contextId: ContextId): void {
    this.cache.delete(contextId);
  }

  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    this.cache.clear();
  }

  /**
   * Record fingerprint event (delegated to telemetry collector)
   */
  recordFingerprintEvent(
    contextId: ContextId,
    type: 'canvas' | 'webgl' | 'audio' | 'navigator',
    property?: string
  ): void {
    this.telemetryCollector.recordFingerprintEvent(contextId, {
      type,
      property,
      timestamp: Date.now(),
    });
  }

  /**
   * Record header modification (delegated to telemetry collector)
   */
  recordHeaderModification(
    contextId: ContextId,
    modification: 'referrerStripped' | 'referrerReduced' | 'userAgentNormalized' | 'clientHintsStripped'
  ): void {
    this.telemetryCollector.recordHeaderModification(contextId, modification);
  }

  /**
   * Record jitter applied (delegated to telemetry collector)
   */
  recordJitterApplied(contextId: ContextId, delayMs: number): void {
    this.telemetryCollector.recordJitterApplied(contextId, delayMs);
  }

  /**
   * Clean up when context is destroyed
   */
  cleanupContext(contextId: ContextId): void {
    this.telemetryCollector.clearContext(contextId);
    this.cache.delete(contextId);
    this.subscribers.delete(contextId);
    // Note: Traces are NOT cleared by default for audit purposes
    // Use clearTraces() explicitly if needed
  }

  // ========== Phase 2.2: Policy Simulation (PREVIEW ONLY) ==========

  /**
   * Classify with policy simulation preview and diff explanation
   * 
   * This is READ-ONLY - simulation does NOT affect enforcement
   * Output is PREVIEW ONLY
   */
  async classifyWithSimulation(
    contextId: ContextId,
    forceRefresh: boolean = false
  ): Promise<AIClassificationWithSimulation | null> {
    // Get base classification
    const classification = await this.classify(contextId, forceRefresh);
    if (!classification) {
      return null;
    }

    // Get telemetry for simulation
    const snapshot = this.telemetryCollector.generateSnapshot(contextId);
    if (!snapshot) {
      return {
        ...classification,
        simulation: undefined,
        diffExplanation: undefined,
      };
    }

    // Run simulation (PURE FUNCTION - no side effects)
    const simulation = this.policySimulator.simulateAll(snapshot);

    // Generate diff explanation (PURE FUNCTION - no side effects)
    const diffExplanation = this.policyDiffAnalyzer.analyze(snapshot, simulation);

    // Generate and store trace (Phase 2.4 - AUDIT ONLY)
    try {
      const trace = this.traceGenerator.generate(
        snapshot,
        classification,
        simulation,
        diffExplanation
      );
      this.traceStorage.store(trace);
    } catch (error) {
      // Trace storage failure should not affect classification
      console.error('Failed to store trace:', error);
    }

    return {
      ...classification,
      simulation,
      diffExplanation,
    };
  }

  /**
   * Simulate a single policy mode for a context
   * 
   * PURE FUNCTION - no side effects
   * Output is PREVIEW ONLY - does NOT affect enforcement
   */
  simulateMode(contextId: ContextId, mode: SimulationMode): SimulationResult | null {
    const snapshot = this.telemetryCollector.generateSnapshot(contextId);
    if (!snapshot) {
      return null;
    }

    return this.policySimulator.simulate(snapshot, mode);
  }

  /**
   * Simulate all policy modes for a context
   * 
   * PURE FUNCTION - no side effects
   * Output is PREVIEW ONLY - does NOT affect enforcement
   */
  simulateAllModes(contextId: ContextId): PolicySimulationOutput | null {
    const snapshot = this.telemetryCollector.generateSnapshot(contextId);
    if (!snapshot) {
      return null;
    }

    return this.policySimulator.simulateAll(snapshot);
  }

  /**
   * Get available simulation modes
   */
  getSimulationModes(): SimulationMode[] {
    return this.policySimulator.getAvailableModes();
  }

  /**
   * Get description for a simulation mode
   */
  getSimulationModeDescription(mode: SimulationMode): string {
    return this.policySimulator.getModeDescription(mode);
  }

  // ========== Phase 2.3: Policy Diff Explanation (DISPLAY ONLY) ==========

  /**
   * Analyze policy differences for a context
   * 
   * PURE FUNCTION - no side effects
   * Output is DISPLAY ONLY - does NOT affect enforcement
   */
  analyzeDiff(contextId: ContextId): PolicyDiffExplanation | null {
    const snapshot = this.telemetryCollector.generateSnapshot(contextId);
    if (!snapshot) {
      return null;
    }

    const simulation = this.policySimulator.simulateAll(snapshot);
    return this.policyDiffAnalyzer.analyze(snapshot, simulation);
  }

  /**
   * Get all protection definitions
   */
  getProtectionDefinitions(): { name: string; category: string; description: string }[] {
    return this.policyDiffAnalyzer.getProtectionDefinitions();
  }

  // ========== Phase 2.4: AI Audit & Trace (READ-ONLY) ==========

  /**
   * Get the most recent trace for a context
   * READ-ONLY - does not affect enforcement
   */
  getLatestTrace(contextId: ContextId): StoredTrace | null {
    return this.traceStorage.getLatest(contextId);
  }

  /**
   * Get trace by ID
   */
  getTraceById(contextId: ContextId, traceId: string): StoredTrace | null {
    return this.traceStorage.getById(contextId, traceId);
  }

  /**
   * List all traces for a context
   */
  listTraces(contextId: ContextId): StoredTrace[] {
    return this.traceStorage.list(contextId);
  }

  /**
   * Export trace as JSON string
   */
  exportTrace(trace: AIDecisionTrace): string {
    return this.traceStorage.exportAsJson(trace);
  }

  /**
   * Export trace to file
   */
  exportTraceToFile(trace: AIDecisionTrace, filePath: string): boolean {
    return this.traceStorage.exportToFile(trace, filePath);
  }

  /**
   * Get trace count for a context
   */
  getTraceCount(contextId: ContextId): number {
    return this.traceStorage.getCount(contextId);
  }

  /**
   * Clear traces for a context (called during cleanup)
   */
  clearTraces(contextId: ContextId): void {
    this.traceStorage.clearContext(contextId);
  }
}

// Singleton instance
let instance: AIPrivacyAgent | null = null;

export function getAIPrivacyAgent(): AIPrivacyAgent {
  if (!instance) {
    instance = new AIPrivacyAgent();
  }
  return instance;
}

export function resetAIPrivacyAgent(): void {
  instance = null;
}


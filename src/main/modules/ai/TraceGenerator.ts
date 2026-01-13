/**
 * TraceGenerator - AI Decision Trace Generation
 * 
 * Generates deterministic traces of AI classification decisions,
 * capturing inputs, rules, thresholds, and outputs for audit.
 * 
 * PHASE 2.4 RULES:
 * - PURE function - no side effects
 * - NEVER influences enforcement
 * - NEVER alters AI outputs
 * - Trace is READ-ONLY observation
 * 
 * NO Solana, NO wallets, NO transactions.
 */

import { createHash } from 'crypto';
import {
  TelemetrySnapshot,
  AIClassification,
  PolicySimulationOutput,
  PolicyDiffExplanation,
  AIDecisionTrace,
  TelemetryInputTrace,
  TriggeredRule,
  RiskLevel,
} from '../../../shared/ai-types';

/** Trace version for compatibility tracking */
const TRACE_VERSION = '1.0.0';

/**
 * Rule thresholds used in heuristic classification
 * These are READ-ONLY references for trace documentation
 */
const HEURISTIC_THRESHOLDS = {
  thirdPartyLow: 5,
  thirdPartyMedium: 15,
  thirdPartyHigh: 30,
  blockedLow: 3,
  blockedMedium: 10,
  blockedHigh: 25,
  fingerprintLow: 2,
  fingerprintMedium: 5,
  fingerprintHigh: 10,
  riskScoreMedium: 25,
  riskScoreHigh: 60,
};

/**
 * Generate a unique trace ID
 */
function generateTraceId(contextId: string, timestamp: number): string {
  const input = `${contextId}:${timestamp}:${Math.random().toString(36).slice(2)}`;
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

/**
 * Generate a hash of inputs for verification
 */
function hashInputs(snapshot: TelemetrySnapshot): string {
  const inputData = JSON.stringify({
    contextId: snapshot.contextId,
    requests: snapshot.requests,
    fingerprinting: snapshot.fingerprinting,
    headers: snapshot.headers,
    timestamp: snapshot.timestamp,
  });
  return createHash('sha256').update(inputData).digest('hex').slice(0, 16);
}

/**
 * Generate a hash of outputs for verification
 */
function hashOutputs(classification: AIClassification): string {
  const outputData = JSON.stringify({
    riskLevel: classification.riskLevel,
    confidence: classification.confidence,
    detectedVectors: classification.detectedVectors,
    recommendation: classification.recommendation,
  });
  return createHash('sha256').update(outputData).digest('hex').slice(0, 16);
}

/**
 * Extract telemetry input trace from snapshot
 */
function extractInputTrace(snapshot: TelemetrySnapshot): TelemetryInputTrace {
  const fingerprintAPIs: string[] = [];
  
  if (snapshot.fingerprinting.canvasAccessed) fingerprintAPIs.push('Canvas');
  if (snapshot.fingerprinting.webglAccessed) fingerprintAPIs.push('WebGL');
  if (snapshot.fingerprinting.audioAccessed) fingerprintAPIs.push('AudioContext');
  if (snapshot.fingerprinting.navigatorAccessed) fingerprintAPIs.push('Navigator');

  return {
    contextId: snapshot.contextId,
    origin: snapshot.origin,
    totalRequests: snapshot.requests.totalRequests,
    blockedRequests: snapshot.requests.blockedRequests,
    thirdPartyRequests: snapshot.requests.thirdPartyRequests,
    fingerprintAPIs,
    headersModified: 
      snapshot.headers.referrerStripped +
      snapshot.headers.referrerReduced +
      snapshot.headers.userAgentNormalized +
      snapshot.headers.clientHintsStripped,
    snapshotTimestamp: snapshot.timestamp,
  };
}

/**
 * Determine which rules were triggered based on telemetry
 */
function evaluateRules(snapshot: TelemetrySnapshot, classification: AIClassification): TriggeredRule[] {
  const rules: TriggeredRule[] = [];
  
  // Third-party request rules
  const thirdPartyCount = snapshot.requests.thirdPartyRequests;
  rules.push({
    id: 'TP_HIGH',
    name: 'High Third-Party Activity',
    category: 'network',
    threshold: HEURISTIC_THRESHOLDS.thirdPartyHigh,
    actualValue: thirdPartyCount,
    triggered: thirdPartyCount > HEURISTIC_THRESHOLDS.thirdPartyHigh,
    scoreContribution: thirdPartyCount > HEURISTIC_THRESHOLDS.thirdPartyHigh ? 30 : 0,
  });
  
  rules.push({
    id: 'TP_MEDIUM',
    name: 'Moderate Third-Party Activity',
    category: 'network',
    threshold: HEURISTIC_THRESHOLDS.thirdPartyMedium,
    actualValue: thirdPartyCount,
    triggered: thirdPartyCount > HEURISTIC_THRESHOLDS.thirdPartyMedium && thirdPartyCount <= HEURISTIC_THRESHOLDS.thirdPartyHigh,
    scoreContribution: thirdPartyCount > HEURISTIC_THRESHOLDS.thirdPartyMedium && thirdPartyCount <= HEURISTIC_THRESHOLDS.thirdPartyHigh ? 15 : 0,
  });

  // Blocked request rules
  const blockedCount = snapshot.requests.blockedRequests;
  rules.push({
    id: 'BLK_HIGH',
    name: 'High Blocked Requests',
    category: 'blocking',
    threshold: HEURISTIC_THRESHOLDS.blockedHigh,
    actualValue: blockedCount,
    triggered: blockedCount > HEURISTIC_THRESHOLDS.blockedHigh,
    scoreContribution: blockedCount > HEURISTIC_THRESHOLDS.blockedHigh ? 25 : 0,
  });

  // Canvas fingerprinting
  if (snapshot.fingerprinting.canvasAccessed) {
    const canvasOps = snapshot.fingerprinting.canvasOperations;
    rules.push({
      id: 'FP_CANVAS',
      name: 'Canvas Fingerprinting Detected',
      category: 'fingerprint',
      threshold: 1,
      actualValue: canvasOps,
      triggered: true,
      scoreContribution: canvasOps > HEURISTIC_THRESHOLDS.fingerprintMedium ? 20 : 10,
    });
  }

  // WebGL fingerprinting
  if (snapshot.fingerprinting.webglAccessed) {
    const webglOps = snapshot.fingerprinting.webglOperations;
    rules.push({
      id: 'FP_WEBGL',
      name: 'WebGL Fingerprinting Detected',
      category: 'fingerprint',
      threshold: 1,
      actualValue: webglOps,
      triggered: true,
      scoreContribution: webglOps > HEURISTIC_THRESHOLDS.fingerprintMedium ? 20 : 10,
    });
  }

  // Audio fingerprinting
  if (snapshot.fingerprinting.audioAccessed) {
    rules.push({
      id: 'FP_AUDIO',
      name: 'Audio Fingerprinting Detected',
      category: 'fingerprint',
      threshold: 1,
      actualValue: snapshot.fingerprinting.audioOperations,
      triggered: true,
      scoreContribution: 10,
    });
  }

  // Navigator fingerprinting
  if (snapshot.fingerprinting.navigatorAccessed && snapshot.fingerprinting.navigatorProperties.length > 2) {
    rules.push({
      id: 'FP_NAV',
      name: 'Navigator Property Enumeration',
      category: 'fingerprint',
      threshold: 3,
      actualValue: snapshot.fingerprinting.navigatorProperties.length,
      triggered: true,
      scoreContribution: 5,
    });
  }

  // Risk level rules
  const riskScore = rules.reduce((sum, r) => sum + r.scoreContribution, 0);
  rules.push({
    id: 'RISK_LEVEL',
    name: 'Final Risk Level Determination',
    category: 'classification',
    threshold: HEURISTIC_THRESHOLDS.riskScoreHigh,
    actualValue: riskScore,
    triggered: true,
    scoreContribution: 0,
  });

  return rules;
}

/**
 * Extract factor names from diff explanation
 */
function extractFactorNames(diffExplanation?: PolicyDiffExplanation): string[] {
  if (!diffExplanation) return [];
  
  const names = new Set<string>();
  
  for (const factor of diffExplanation.allFactors) {
    names.add(factor.name);
  }
  
  return Array.from(names);
}

/**
 * Generate a complete AI decision trace
 * 
 * PURE FUNCTION - no side effects
 * Trace is READ-ONLY - does not affect enforcement
 */
export function generateTrace(
  snapshot: TelemetrySnapshot,
  classification: AIClassification,
  simulation?: PolicySimulationOutput,
  diffExplanation?: PolicyDiffExplanation
): AIDecisionTrace {
  const timestamp = Date.now();
  const traceId = generateTraceId(snapshot.contextId, timestamp);
  
  const trace: AIDecisionTrace = {
    traceId,
    contextId: snapshot.contextId,
    origin: snapshot.origin,
    timestamp,
    
    inputs: extractInputTrace(snapshot),
    rulesEvaluated: evaluateRules(snapshot, classification),
    factorsReferenced: extractFactorNames(diffExplanation),
    thresholds: { ...HEURISTIC_THRESHOLDS },
    
    classificationOutput: {
      riskLevel: classification.riskLevel,
      confidence: classification.confidence,
      detectedVectors: [...classification.detectedVectors],
      recommendation: classification.recommendation,
    },
    
    classifierType: classification.classifierType,
    traceVersion: TRACE_VERSION,
    inputHash: hashInputs(snapshot),
    outputHash: hashOutputs(classification),
  };

  // Add simulation output if available
  if (simulation) {
    trace.simulationOutput = {
      strictBlocked: simulation.strict.blockedRequests.simulated,
      balancedBlocked: simulation.balanced.blockedRequests.simulated,
      permissiveBlocked: simulation.permissive.blockedRequests.simulated,
      currentMode: simulation.currentEffectiveMode,
    };
  }

  return trace;
}

/**
 * TraceGenerator class for stateless trace generation
 */
export class TraceGenerator {
  /**
   * Generate a trace from classification results
   * PURE FUNCTION - no side effects
   */
  generate(
    snapshot: TelemetrySnapshot,
    classification: AIClassification,
    simulation?: PolicySimulationOutput,
    diffExplanation?: PolicyDiffExplanation
  ): AIDecisionTrace {
    return generateTrace(snapshot, classification, simulation, diffExplanation);
  }

  /**
   * Get trace version
   */
  getVersion(): string {
    return TRACE_VERSION;
  }

  /**
   * Get thresholds used for classification
   */
  getThresholds(): Record<string, number> {
    return { ...HEURISTIC_THRESHOLDS };
  }
}

// Singleton instance
let instance: TraceGenerator | null = null;

export function getTraceGenerator(): TraceGenerator {
  if (!instance) {
    instance = new TraceGenerator();
  }
  return instance;
}

export function resetTraceGenerator(): void {
  instance = null;
}


/**
 * Liminal - AI Privacy Agent Types
 * 
 * Type definitions for the AI observation and explanation layer.
 * 
 * PHASE 2 RULES:
 * - AI is READ-ONLY
 * - AI does NOT block, allow, route, or enforce anything
 * - AI ONLY observes, classifies, explains, and recommends
 * - NO Solana, NO wallets, NO transactions
 */

import { ContextId, ProxyConfig } from './types';

// ============ Risk Levels ============

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type PolicyRecommendation = 'STRICT' | 'BALANCED' | 'PERMISSIVE';

// ============ Tracking Vectors ============

export type TrackingVector = 
  | 'CANVAS_FINGERPRINT'
  | 'WEBGL_FINGERPRINT'
  | 'AUDIO_FINGERPRINT'
  | 'NAVIGATOR_FINGERPRINT'
  | 'THIRD_PARTY_COOKIES'
  | 'THIRD_PARTY_SCRIPTS'
  | 'TRACKING_PIXELS'
  | 'SESSION_REPLAY'
  | 'BEHAVIORAL_TRACKING'
  | 'CROSS_SITE_TRACKING'
  | 'DEVICE_FINGERPRINT'
  | 'UNKNOWN';

// ============ Telemetry Snapshot ============

/**
 * Fingerprint API usage telemetry
 */
export interface FingerprintTelemetry {
  /** Canvas API accessed */
  canvasAccessed: boolean;
  /** Number of canvas operations */
  canvasOperations: number;
  
  /** WebGL API accessed */
  webglAccessed: boolean;
  /** Number of WebGL operations */
  webglOperations: number;
  
  /** AudioContext API accessed */
  audioAccessed: boolean;
  /** Number of audio operations */
  audioOperations: number;
  
  /** Navigator properties accessed */
  navigatorAccessed: boolean;
  /** Which navigator properties were accessed */
  navigatorProperties: string[];
}

/**
 * Request telemetry for a context
 */
export interface RequestTelemetry {
  /** Total number of requests */
  totalRequests: number;
  /** Number of blocked requests */
  blockedRequests: number;
  /** Number of third-party requests */
  thirdPartyRequests: number;
  /** Unique third-party domains */
  thirdPartyDomains: string[];
  /** Unique blocked domains */
  blockedDomains: string[];
}

/**
 * Timing jitter telemetry
 */
export interface TimingTelemetry {
  /** Whether jitter is enabled */
  jitterEnabled: boolean;
  /** Minimum jitter applied (ms) */
  minJitterMs: number;
  /** Maximum jitter applied (ms) */
  maxJitterMs: number;
  /** Average jitter applied (ms) */
  avgJitterMs: number;
  /** Number of requests with jitter */
  jitteredRequests: number;
}

/**
 * Header modification telemetry
 */
export interface HeaderTelemetry {
  /** Number of requests with referrer stripped */
  referrerStripped: number;
  /** Number of requests with referrer reduced to origin */
  referrerReduced: number;
  /** Number of requests with User-Agent normalized */
  userAgentNormalized: number;
  /** Number of client hints stripped */
  clientHintsStripped: number;
}

/**
 * Complete telemetry snapshot for a context
 * This is READ-ONLY data collected from observations
 */
export interface TelemetrySnapshot {
  /** Context ID this snapshot belongs to */
  contextId: ContextId;
  
  /** Origin of the page (if known) */
  origin: string | null;
  
  /** Snapshot timestamp */
  timestamp: number;
  
  /** Snapshot duration (how long context has been active) */
  durationMs: number;
  
  /** Proxy configuration (for display only) */
  proxy: ProxyConfig;
  
  /** Request telemetry */
  requests: RequestTelemetry;
  
  /** Fingerprint API telemetry */
  fingerprinting: FingerprintTelemetry;
  
  /** Timing jitter telemetry */
  timing: TimingTelemetry;
  
  /** Header modification telemetry */
  headers: HeaderTelemetry;
}

// ============ AI Classifier Output ============

/**
 * AI classification result
 * This is DISPLAY ONLY - does not affect enforcement
 */
export interface AIClassification {
  /** Overall privacy risk level */
  riskLevel: RiskLevel;
  
  /** Confidence score (0-1) */
  confidence: number;
  
  /** Detected tracking techniques */
  detectedVectors: TrackingVector[];
  
  /** Risk of site breakage if protections are increased */
  breakageRisk: RiskLevel;
  
  /** Human-readable explanation */
  explanation: string;
  
  /** Policy recommendation (DISPLAY ONLY, NOT APPLIED) */
  recommendation: PolicyRecommendation;
  
  /** Detailed recommendations (DISPLAY ONLY) */
  recommendations: string[];
  
  /** Classifier that produced this result */
  classifierType: 'heuristic' | 'llm';
  
  /** Timestamp of classification */
  classifiedAt: number;
}

// ============ AI Classifier Interface ============

/**
 * Generic AI classifier interface
 * Implementations MUST be read-only and NOT affect enforcement
 */
export interface IAIClassifier {
  /** Classifier name */
  readonly name: string;
  
  /** Classifier type */
  readonly type: 'heuristic' | 'llm';
  
  /** Whether this classifier is available/enabled */
  isAvailable(): boolean;
  
  /**
   * Classify telemetry snapshot
   * MUST be read-only - no side effects
   */
  classify(snapshot: TelemetrySnapshot): Promise<AIClassification>;
}

// ============ Policy Simulation (Phase 2.2) ============

/**
 * Hypothetical policy mode for simulation
 * This is for PREVIEW ONLY - does not affect enforcement
 */
export type SimulationMode = 'STRICT' | 'BALANCED' | 'PERMISSIVE';

/**
 * Delta indicator for simulation results
 */
export interface SimulationDelta {
  /** Current value */
  current: number;
  /** Simulated value */
  simulated: number;
  /** Change (+/-) */
  change: number;
  /** Percentage change */
  percentChange: number;
}

/**
 * Policy simulation result
 * This is PREVIEW ONLY - does NOT affect real enforcement
 */
export interface SimulationResult {
  /** The mode being simulated */
  mode: SimulationMode;
  
  /** Estimated blocked requests change */
  blockedRequests: SimulationDelta;
  
  /** Estimated fingerprint API blocking change */
  fingerprintProtection: SimulationDelta;
  
  /** Estimated third-party request blocking change */
  thirdPartyBlocking: SimulationDelta;
  
  /** Estimated header modifications change */
  headerHardening: SimulationDelta;
  
  /** Estimated breakage risk (0-100) */
  breakageRisk: number;
  
  /** Breakage risk level */
  breakageRiskLevel: RiskLevel;
  
  /** Human-readable summary of what would change */
  summary: string;
  
  /** Detailed changes list */
  changes: string[];
  
  /** Timestamp of simulation */
  simulatedAt: number;
}

/**
 * Complete simulation output for all modes
 */
export interface PolicySimulationOutput {
  /** Simulation for STRICT mode */
  strict: SimulationResult;
  
  /** Simulation for BALANCED mode */
  balanced: SimulationResult;
  
  /** Simulation for PERMISSIVE mode */
  permissive: SimulationResult;
  
  /** Current effective mode (based on telemetry) */
  currentEffectiveMode: SimulationMode;
}

// ============ Policy Diff Explanation (Phase 2.3) ============

/**
 * A specific protection that contributes to mode differences
 */
export interface ProtectionFactor {
  /** Protection name */
  name: string;
  
  /** Protection category */
  category: 'fingerprint' | 'network' | 'headers' | 'tracking';
  
  /** How this protection differs between modes */
  description: string;
  
  /** Impact on privacy (0-100, higher = more privacy) */
  privacyImpact: number;
  
  /** Impact on breakage risk (0-100, higher = more breakage) */
  breakageImpact: number;
  
  /** Whether this is enabled in STRICT mode */
  enabledInStrict: boolean;
  
  /** Whether this is enabled in BALANCED mode */
  enabledInBalanced: boolean;
  
  /** Whether this is enabled in PERMISSIVE mode */
  enabledInPermissive: boolean;
}

/**
 * Explanation for a single mode's behavior
 */
export interface ModeExplanation {
  /** The mode being explained */
  mode: SimulationMode;
  
  /** Short summary paragraph */
  summary: string;
  
  /** Top contributing factors for this mode */
  topFactors: ProtectionFactor[];
  
  /** Why this mode provides its level of privacy */
  privacyRationale: string;
  
  /** Why this mode has its breakage risk */
  breakageRationale: string;
}

/**
 * Complete diff explanation comparing all modes
 */
export interface PolicyDiffExplanation {
  /** Explanation of STRICT mode */
  strict: ModeExplanation;
  
  /** Explanation of BALANCED mode */
  balanced: ModeExplanation;
  
  /** Explanation of PERMISSIVE mode */
  permissive: ModeExplanation;
  
  /** Key differences summary */
  keyDifferences: string[];
  
  /** All protection factors analyzed */
  allFactors: ProtectionFactor[];
  
  /** Timestamp of analysis */
  analyzedAt: number;
}

// ============ Extended AI Classification with Simulation ============

/**
 * AI classification result with optional simulation preview
 * Simulation is DISPLAY ONLY - does not affect enforcement
 */
export interface AIClassificationWithSimulation extends AIClassification {
  /** Optional policy simulation results (PREVIEW ONLY) */
  simulation?: PolicySimulationOutput;
  
  /** Optional diff explanation (DISPLAY ONLY) */
  diffExplanation?: PolicyDiffExplanation;
}

// ============ AI Decision Trace (Phase 2.4) ============

/**
 * A rule that was triggered during classification
 */
export interface TriggeredRule {
  /** Rule identifier */
  id: string;
  /** Rule name */
  name: string;
  /** Rule category */
  category: string;
  /** Threshold that was crossed (if applicable) */
  threshold?: number;
  /** Actual value that triggered the rule */
  actualValue?: number;
  /** Whether the rule was satisfied */
  triggered: boolean;
  /** Contribution to final score */
  scoreContribution: number;
}

/**
 * Trace of telemetry inputs used
 */
export interface TelemetryInputTrace {
  /** Context ID */
  contextId: string;
  /** Origin URL */
  origin: string | null;
  /** Total requests observed */
  totalRequests: number;
  /** Blocked requests */
  blockedRequests: number;
  /** Third-party requests */
  thirdPartyRequests: number;
  /** Fingerprint APIs accessed */
  fingerprintAPIs: string[];
  /** Headers modified count */
  headersModified: number;
  /** Snapshot timestamp */
  snapshotTimestamp: number;
}

/**
 * Complete AI decision trace
 * READ-ONLY - does not affect enforcement
 */
export interface AIDecisionTrace {
  /** Unique trace ID */
  traceId: string;
  
  /** Context this trace belongs to */
  contextId: string;
  
  /** Origin of the page */
  origin: string | null;
  
  /** Timestamp when trace was created */
  timestamp: number;
  
  /** Telemetry inputs used */
  inputs: TelemetryInputTrace;
  
  /** Rules that were evaluated */
  rulesEvaluated: TriggeredRule[];
  
  /** Protection factors referenced */
  factorsReferenced: string[];
  
  /** Thresholds configuration used */
  thresholds: Record<string, number>;
  
  /** Classification output */
  classificationOutput: {
    riskLevel: RiskLevel;
    confidence: number;
    detectedVectors: TrackingVector[];
    recommendation: PolicyRecommendation;
  };
  
  /** Simulation outputs (if generated) */
  simulationOutput?: {
    strictBlocked: number;
    balancedBlocked: number;
    permissiveBlocked: number;
    currentMode: SimulationMode;
  };
  
  /** Classifier type used */
  classifierType: 'heuristic' | 'llm';
  
  /** Trace version for compatibility */
  traceVersion: string;
  
  /** Hash of inputs for verification */
  inputHash: string;
  
  /** Hash of outputs for verification */
  outputHash: string;
}

/**
 * Stored trace with metadata
 */
export interface StoredTrace {
  /** The trace data */
  trace: AIDecisionTrace;
  
  /** When the trace was stored */
  storedAt: number;
  
  /** Whether the trace is immutable (always true once stored) */
  immutable: boolean;
}

// ============ IPC Channels for AI ============

export const AI_IPC_CHANNELS = {
  /** Get telemetry snapshot for a context */
  TELEMETRY_GET: 'ai:telemetry:get',
  
  /** Get AI classification for a context */
  CLASSIFY: 'ai:classify',
  
  /** Get AI classification with simulation preview */
  CLASSIFY_WITH_SIMULATION: 'ai:classify:withSimulation',
  
  /** Run policy simulation only (no classification) */
  SIMULATE: 'ai:simulate',
  
  /** Subscribe to classification updates */
  CLASSIFICATION_SUBSCRIBE: 'ai:classification:subscribe',
  
  /** Classification update event */
  CLASSIFICATION_UPDATE: 'ai:classification:update',
  
  /** Get available classifiers */
  CLASSIFIERS_LIST: 'ai:classifiers:list',
  
  // ========== Phase 2.4: Trace Channels ==========
  
  /** Get trace for a context */
  TRACE_GET: 'ai:trace:get',
  
  /** Get all traces for a context */
  TRACE_LIST: 'ai:trace:list',
  
  /** Export trace as JSON */
  TRACE_EXPORT: 'ai:trace:export',
} as const;


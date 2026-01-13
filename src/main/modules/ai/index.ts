/**
 * AI Module Exports
 * 
 * PHASE 2: AI Privacy Agent - READ-ONLY observation layer
 * PHASE 2.2: Policy Impact Simulation - PREVIEW ONLY
 * PHASE 2.3: Policy Diff Explanation - DISPLAY ONLY
 * PHASE 2.4: AI Audit & Trace - IMMUTABLE AUDIT TRAIL
 * 
 * NO Solana, NO wallets, NO transactions.
 */

export { TelemetryCollector, getTelemetryCollector, resetTelemetryCollector } from './TelemetryCollector';
export { HeuristicClassifier, getHeuristicClassifier, resetHeuristicClassifier } from './HeuristicClassifier';
export { LLMClassifier, getLLMClassifier, resetLLMClassifier } from './LLMClassifier';
export { AIPrivacyAgent, getAIPrivacyAgent, resetAIPrivacyAgent } from './AIPrivacyAgent';
export { PolicySimulator, getPolicySimulator, resetPolicySimulator, simulateMode, simulateAllModes } from './PolicySimulator';
export { PolicyDiffAnalyzer, getPolicyDiffAnalyzer, resetPolicyDiffAnalyzer, analyzePolicyDiff } from './PolicyDiffAnalyzer';
export { TraceGenerator, getTraceGenerator, resetTraceGenerator, generateTrace } from './TraceGenerator';
export { TraceStorage, getTraceStorage, resetTraceStorage, createTraceStorage } from './TraceStorage';


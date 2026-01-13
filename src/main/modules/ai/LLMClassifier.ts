/**
 * LLMClassifier - LLM-Based AI Classifier (STUB)
 * 
 * A placeholder for future LLM-based classification.
 * Currently returns a stub response indicating the feature is not available.
 * 
 * PHASE 2 RULES:
 * - This is a STUB ONLY - no actual API calls
 * - Behind a feature flag
 * - Does NOT modify any state
 * - Does NOT affect enforcement
 * - NO API keys stored or used
 * 
 * NO Solana, NO wallets, NO transactions.
 */

import {
  TelemetrySnapshot,
  AIClassification,
  IAIClassifier,
} from '../../../shared/ai-types';

/**
 * Feature flag for LLM classifier
 * In future phases, this could be read from config
 */
const LLM_CLASSIFIER_ENABLED = false;

export class LLMClassifier implements IAIClassifier {
  readonly name = 'Liminal LLM Classifier';
  readonly type = 'llm' as const;

  private enabled: boolean;

  constructor(enabled: boolean = LLM_CLASSIFIER_ENABLED) {
    this.enabled = enabled;
  }

  /**
   * Check if LLM classifier is available
   * Currently always returns false (stub)
   */
  isAvailable(): boolean {
    return this.enabled;
  }

  /**
   * Enable/disable the LLM classifier
   * For testing purposes only
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Classify telemetry snapshot using LLM (STUB)
   * 
   * In future phases, this would:
   * 1. Format telemetry as a prompt
   * 2. Call an LLM API (local or remote)
   * 3. Parse the response into AIClassification
   * 
   * Currently returns a stub response.
   */
  async classify(snapshot: TelemetrySnapshot): Promise<AIClassification> {
    if (!this.enabled) {
      return this.createUnavailableResponse(snapshot);
    }

    // STUB: In future phases, this would make an actual LLM call
    // For now, return a placeholder indicating the feature is not implemented
    return this.createStubResponse(snapshot);
  }

  /**
   * Create response when LLM is not available
   */
  private createUnavailableResponse(snapshot: TelemetrySnapshot): AIClassification {
    return {
      riskLevel: 'LOW',
      confidence: 0,
      detectedVectors: [],
      breakageRisk: 'LOW',
      explanation: 'LLM classifier is not available. Using heuristic classifier instead.',
      recommendation: 'BALANCED',
      recommendations: ['LLM classification requires additional configuration'],
      classifierType: 'llm',
      classifiedAt: Date.now(),
    };
  }

  /**
   * Create stub response (for future implementation)
   */
  private createStubResponse(snapshot: TelemetrySnapshot): AIClassification {
    // This is a placeholder that demonstrates the expected output format
    // In a real implementation, this would be parsed from LLM output
    
    return {
      riskLevel: 'MEDIUM',
      confidence: 0.5,
      detectedVectors: [],
      breakageRisk: 'LOW',
      explanation: 'LLM classification is a stub. Full implementation pending in future phase.',
      recommendation: 'BALANCED',
      recommendations: [
        'This is a stub response',
        'LLM integration will be implemented in a future phase',
        'No API keys are configured',
      ],
      classifierType: 'llm',
      classifiedAt: Date.now(),
    };
  }

  /**
   * Format telemetry snapshot as LLM prompt (for future use)
   * This shows how telemetry would be formatted for an LLM
   */
  formatPrompt(snapshot: TelemetrySnapshot): string {
    return `
Analyze the following privacy telemetry snapshot and provide a risk assessment:

Context ID: ${snapshot.contextId}
Origin: ${snapshot.origin || 'Unknown'}
Duration: ${Math.round(snapshot.durationMs / 1000)}s

Request Activity:
- Total requests: ${snapshot.requests.totalRequests}
- Third-party requests: ${snapshot.requests.thirdPartyRequests}
- Blocked requests: ${snapshot.requests.blockedRequests}
- Third-party domains: ${snapshot.requests.thirdPartyDomains.slice(0, 10).join(', ')}

Fingerprinting Activity:
- Canvas: ${snapshot.fingerprinting.canvasAccessed ? `Yes (${snapshot.fingerprinting.canvasOperations} ops)` : 'No'}
- WebGL: ${snapshot.fingerprinting.webglAccessed ? `Yes (${snapshot.fingerprinting.webglOperations} ops)` : 'No'}
- Audio: ${snapshot.fingerprinting.audioAccessed ? `Yes (${snapshot.fingerprinting.audioOperations} ops)` : 'No'}
- Navigator: ${snapshot.fingerprinting.navigatorAccessed ? `Yes (${snapshot.fingerprinting.navigatorProperties.join(', ')})` : 'No'}

Protection Applied:
- Headers modified: ${snapshot.headers.referrerStripped + snapshot.headers.referrerReduced + snapshot.headers.clientHintsStripped}
- Timing jitter applied: ${snapshot.timing.jitteredRequests} requests
- Proxy: ${snapshot.proxy.type}

Provide assessment in JSON format with: riskLevel, confidence, detectedVectors, breakageRisk, explanation, recommendation.
`.trim();
  }
}

// Singleton instance
let instance: LLMClassifier | null = null;

export function getLLMClassifier(): LLMClassifier {
  if (!instance) {
    instance = new LLMClassifier();
  }
  return instance;
}

export function resetLLMClassifier(): void {
  instance = null;
}


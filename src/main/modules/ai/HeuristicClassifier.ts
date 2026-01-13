/**
 * HeuristicClassifier - Deterministic Rule-Based AI Classifier
 * 
 * A deterministic classifier that uses predefined rules to assess
 * privacy risk from telemetry snapshots.
 * 
 * PHASE 2 RULES:
 * - This classifier is READ-ONLY
 * - It does NOT modify any state
 * - It does NOT affect enforcement
 * - Output is DISPLAY ONLY
 * 
 * NO Solana, NO wallets, NO transactions.
 */

import {
  TelemetrySnapshot,
  AIClassification,
  IAIClassifier,
  RiskLevel,
  TrackingVector,
  PolicyRecommendation,
} from '../../../shared/ai-types';

/**
 * Thresholds for risk assessment
 */
const THRESHOLDS = {
  // Third-party request thresholds
  thirdPartyLow: 5,
  thirdPartyMedium: 15,
  thirdPartyHigh: 30,
  
  // Blocked request thresholds (indicates tracking attempts)
  blockedLow: 3,
  blockedMedium: 10,
  blockedHigh: 25,
  
  // Fingerprint operation thresholds
  fingerprintLow: 2,
  fingerprintMedium: 5,
  fingerprintHigh: 10,
};

/**
 * Known tracking domains (simplified list for heuristics)
 */
const KNOWN_TRACKING_DOMAINS = [
  'doubleclick.net',
  'google-analytics.com',
  'googletagmanager.com',
  'facebook.net',
  'facebook.com',
  'fbcdn.net',
  'twitter.com',
  'ads-twitter.com',
  'amazon-adsystem.com',
  'criteo.com',
  'hotjar.com',
  'mixpanel.com',
  'segment.com',
  'amplitude.com',
];

export class HeuristicClassifier implements IAIClassifier {
  readonly name = 'Liminal Heuristic Classifier';
  readonly type = 'heuristic' as const;

  isAvailable(): boolean {
    return true; // Always available
  }

  /**
   * Classify telemetry snapshot using deterministic rules
   * This is READ-ONLY - no side effects
   */
  async classify(snapshot: TelemetrySnapshot): Promise<AIClassification> {
    const detectedVectors: TrackingVector[] = [];
    let riskScore = 0;
    const explanationParts: string[] = [];
    const recommendations: string[] = [];

    // ========== Analyze Third-Party Requests ==========
    const thirdPartyCount = snapshot.requests.thirdPartyRequests;
    const blockedCount = snapshot.requests.blockedRequests;
    
    if (thirdPartyCount > THRESHOLDS.thirdPartyHigh) {
      riskScore += 30;
      detectedVectors.push('THIRD_PARTY_SCRIPTS');
      explanationParts.push(`High third-party activity detected (${thirdPartyCount} requests)`);
    } else if (thirdPartyCount > THRESHOLDS.thirdPartyMedium) {
      riskScore += 15;
      detectedVectors.push('THIRD_PARTY_SCRIPTS');
      explanationParts.push(`Moderate third-party activity (${thirdPartyCount} requests)`);
    } else if (thirdPartyCount > THRESHOLDS.thirdPartyLow) {
      riskScore += 5;
    }

    if (blockedCount > THRESHOLDS.blockedHigh) {
      riskScore += 25;
      explanationParts.push(`High number of tracking attempts blocked (${blockedCount})`);
    } else if (blockedCount > THRESHOLDS.blockedMedium) {
      riskScore += 12;
      explanationParts.push(`Multiple tracking attempts blocked (${blockedCount})`);
    }

    // ========== Analyze Known Tracking Domains ==========
    const knownTrackers = snapshot.requests.thirdPartyDomains.filter(domain =>
      KNOWN_TRACKING_DOMAINS.some(tracker => domain.includes(tracker))
    );
    
    if (knownTrackers.length > 0) {
      riskScore += knownTrackers.length * 5;
      detectedVectors.push('CROSS_SITE_TRACKING');
      explanationParts.push(`Known tracking services detected: ${knownTrackers.slice(0, 3).join(', ')}${knownTrackers.length > 3 ? '...' : ''}`);
    }

    // ========== Analyze Fingerprinting Attempts ==========
    const fpTotal = 
      snapshot.fingerprinting.canvasOperations +
      snapshot.fingerprinting.webglOperations +
      snapshot.fingerprinting.audioOperations;

    if (snapshot.fingerprinting.canvasAccessed) {
      riskScore += 10;
      detectedVectors.push('CANVAS_FINGERPRINT');
      if (snapshot.fingerprinting.canvasOperations > THRESHOLDS.fingerprintMedium) {
        riskScore += 10;
        explanationParts.push(`Canvas fingerprinting detected (${snapshot.fingerprinting.canvasOperations} operations)`);
      }
    }

    if (snapshot.fingerprinting.webglAccessed) {
      riskScore += 10;
      detectedVectors.push('WEBGL_FINGERPRINT');
      if (snapshot.fingerprinting.webglOperations > THRESHOLDS.fingerprintMedium) {
        riskScore += 10;
        explanationParts.push(`WebGL fingerprinting detected (${snapshot.fingerprinting.webglOperations} operations)`);
      }
    }

    if (snapshot.fingerprinting.audioAccessed) {
      riskScore += 10;
      detectedVectors.push('AUDIO_FINGERPRINT');
      explanationParts.push('Audio fingerprinting detected');
    }

    if (snapshot.fingerprinting.navigatorAccessed && 
        snapshot.fingerprinting.navigatorProperties.length > 2) {
      riskScore += 5;
      detectedVectors.push('NAVIGATOR_FINGERPRINT');
    }

    if (fpTotal > THRESHOLDS.fingerprintHigh) {
      detectedVectors.push('DEVICE_FINGERPRINT');
      riskScore += 15;
      explanationParts.push('Extensive device fingerprinting detected');
    }

    // ========== Analyze Protection Effectiveness ==========
    const headersModified = 
      snapshot.headers.referrerStripped +
      snapshot.headers.referrerReduced +
      snapshot.headers.clientHintsStripped;
    
    if (headersModified > 0) {
      recommendations.push(`${headersModified} privacy-leaking headers were modified`);
    }

    if (snapshot.timing.jitteredRequests > 0) {
      recommendations.push(`Timing jitter applied to ${snapshot.timing.jitteredRequests} requests`);
    }

    // ========== Calculate Risk Level ==========
    let riskLevel: RiskLevel;
    if (riskScore >= 60) {
      riskLevel = 'HIGH';
    } else if (riskScore >= 25) {
      riskLevel = 'MEDIUM';
    } else {
      riskLevel = 'LOW';
    }

    // ========== Calculate Breakage Risk ==========
    // High protection might break sites with lots of third-party dependencies
    let breakageRisk: RiskLevel;
    if (thirdPartyCount > THRESHOLDS.thirdPartyHigh && blockedCount > THRESHOLDS.blockedMedium) {
      breakageRisk = 'HIGH';
      recommendations.push('Strict blocking may affect site functionality');
    } else if (thirdPartyCount > THRESHOLDS.thirdPartyMedium) {
      breakageRisk = 'MEDIUM';
      recommendations.push('Some site features may depend on blocked resources');
    } else {
      breakageRisk = 'LOW';
    }

    // ========== Generate Policy Recommendation ==========
    // This is DISPLAY ONLY - does NOT affect enforcement
    let recommendation: PolicyRecommendation;
    if (riskLevel === 'HIGH' && breakageRisk !== 'HIGH') {
      recommendation = 'STRICT';
      recommendations.push('Consider strict privacy mode for this site');
    } else if (riskLevel === 'LOW') {
      recommendation = 'PERMISSIVE';
      recommendations.push('Current protections are adequate');
    } else {
      recommendation = 'BALANCED';
      recommendations.push('Balanced protections recommended');
    }

    // ========== Build Explanation ==========
    let explanation: string;
    if (explanationParts.length === 0) {
      if (riskLevel === 'LOW') {
        explanation = 'This site appears to have minimal tracking. Your privacy is well protected.';
      } else {
        explanation = 'Some tracking activity detected but protections are active.';
      }
    } else {
      explanation = explanationParts.join('. ') + '. Liminal protections are active.';
    }

    // ========== Calculate Confidence ==========
    // Higher confidence when we have more data
    const dataPoints = 
      (snapshot.requests.totalRequests > 0 ? 0.2 : 0) +
      (fpTotal > 0 ? 0.2 : 0) +
      (headersModified > 0 ? 0.1 : 0) +
      (snapshot.durationMs > 5000 ? 0.2 : 0.1) +
      (detectedVectors.length > 0 ? 0.2 : 0.1) +
      0.2; // Base confidence

    const confidence = Math.min(1, Math.round(dataPoints * 100) / 100);

    return {
      riskLevel,
      confidence,
      detectedVectors: [...new Set(detectedVectors)], // Deduplicate
      breakageRisk,
      explanation,
      recommendation,
      recommendations,
      classifierType: 'heuristic',
      classifiedAt: Date.now(),
    };
  }
}

// Singleton instance
let instance: HeuristicClassifier | null = null;

export function getHeuristicClassifier(): HeuristicClassifier {
  if (!instance) {
    instance = new HeuristicClassifier();
  }
  return instance;
}

export function resetHeuristicClassifier(): void {
  instance = null;
}


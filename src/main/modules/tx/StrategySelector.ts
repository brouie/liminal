/**
 * Liminal - Strategy Selector
 * 
 * Selects privacy strategy for transactions (PREVIEW ONLY).
 * 
 * PHASE 3.0 RULES:
 * - DRY-RUN ONLY
 * - NO real Solana RPC calls
 * - NO signing
 * - NO actual execution
 * - Preview and recommendation only
 * 
 * PHASE 3.6 ADDITIONS:
 * - References private rail adapter capabilities
 * - STILL never selects S3_PRIVACY_RAIL (stub only)
 * - Includes private rail availability in selection rationale
 */

import {
  TxType,
  TxRiskScore,
  TxStrategy,
  TxStrategySelection,
  SimulatedTxPayload,
  IPrivateRailAdapter,
  PrivateRailCapabilities,
  PrivateRailStatus,
} from '../../../shared/tx-types';
import type { RiskLevel } from '../../../shared/ai-types';
import { getPrivateRailAdapter } from '../rail';

// Strategy profiles
const STRATEGY_PROFILES: Record<TxStrategy, {
  privacyLevel: number;
  costImpact: TxStrategySelection['costImpact'];
  description: string;
}> = {
  [TxStrategy.S0_NORMAL]: {
    privacyLevel: 10,
    costImpact: 'NONE',
    description: 'Standard RPC execution with minimal privacy protection',
  },
  [TxStrategy.S1_RPC_PRIVACY]: {
    privacyLevel: 40,
    costImpact: 'LOW',
    description: 'Privacy-preserving RPC endpoint to hide IP and request patterns',
  },
  [TxStrategy.S2_EPHEMERAL_SENDER]: {
    privacyLevel: 70,
    costImpact: 'MEDIUM',
    description: 'Temporary wallet for sender anonymity (additional tx fees)',
  },
  [TxStrategy.S3_PRIVACY_RAIL]: {
    privacyLevel: 95,
    costImpact: 'HIGH',
    description: 'Full privacy pipeline with mixing and timing obfuscation (NOT IMPLEMENTED)',
  },
};

// Selection thresholds
const SELECTION_RULES = {
  // Force S0 for low-value transfers from trusted origins
  LOW_VALUE_TRUSTED: {
    maxAmount: 0.1,
    minOriginTrust: 70,
    maxRisk: 'LOW' as RiskLevel,
  },
  
  // Recommend S1 for moderate-risk transactions
  MODERATE_RISK: {
    riskLevels: ['MEDIUM' as RiskLevel],
    types: [TxType.TRANSFER, TxType.SWAP],
  },
  
  // Recommend S2 for high-value or approval transactions
  HIGH_VALUE_OR_APPROVAL: {
    minAmount: 5.0,
    types: [TxType.APPROVAL],
  },
  
  // S3 would be for maximum privacy (currently not implemented)
  MAXIMUM_PRIVACY: {
    minAmount: 50.0,
    riskLevels: ['HIGH' as RiskLevel],
  },
};

/**
 * Strategy Selector
 * 
 * Analyzes transaction context and recommends a privacy strategy.
 * This is PREVIEW ONLY - no actual execution occurs.
 * 
 * Phase 3.6: References private rail adapter capabilities but
 * NEVER selects S3_PRIVACY_RAIL (NullPrivateRailAdapter always returns unavailable).
 */
export class StrategySelector {
  private privateRailAdapter: IPrivateRailAdapter;
  
  constructor() {
    this.privateRailAdapter = getPrivateRailAdapter();
  }
  /**
   * Select a privacy strategy for a transaction
   * 
   * @param payload - Simulated transaction payload
   * @param riskScore - Risk score from TxRiskScorer
   * @param originTrust - Origin trust level (0-100)
   * @returns Strategy selection result (PREVIEW ONLY)
   */
  select(
    payload: SimulatedTxPayload,
    riskScore: TxRiskScore,
    originTrust: number
  ): TxStrategySelection {
    // Evaluate all strategies
    const evaluations = this.evaluateStrategies(payload, riskScore, originTrust);
    
    // Select best strategy
    const selected = this.selectBest(evaluations, riskScore);
    
    // Generate rationale
    const rationale = this.generateRationale(
      selected.strategy,
      payload,
      riskScore,
      originTrust
    );
    
    // Get alternatives
    const alternatives = this.getAlternatives(evaluations, selected.strategy);
    
    const profile = STRATEGY_PROFILES[selected.strategy];
    
    return {
      strategy: selected.strategy,
      confidence: selected.confidence,
      rationale,
      alternatives,
      privacyLevel: profile.privacyLevel,
      costImpact: profile.costImpact,
    };
  }
  
  /**
   * Evaluate all strategies for suitability
   */
  private evaluateStrategies(
    payload: SimulatedTxPayload,
    riskScore: TxRiskScore,
    originTrust: number
  ): Map<TxStrategy, { score: number; reason: string }> {
    const evaluations = new Map<TxStrategy, { score: number; reason: string }>();
    
    // S0_NORMAL evaluation
    const s0Score = this.evaluateS0(payload, riskScore, originTrust);
    evaluations.set(TxStrategy.S0_NORMAL, s0Score);
    
    // S1_RPC_PRIVACY evaluation
    const s1Score = this.evaluateS1(payload, riskScore, originTrust);
    evaluations.set(TxStrategy.S1_RPC_PRIVACY, s1Score);
    
    // S2_EPHEMERAL_SENDER evaluation
    const s2Score = this.evaluateS2(payload, riskScore, originTrust);
    evaluations.set(TxStrategy.S2_EPHEMERAL_SENDER, s2Score);
    
    // S3_PRIVACY_RAIL evaluation - check adapter capabilities
    const s3Evaluation = this.evaluateS3PrivacyRail(payload, riskScore);
    evaluations.set(TxStrategy.S3_PRIVACY_RAIL, s3Evaluation);
    
    return evaluations;
  }
  
  /**
   * Evaluate S0_NORMAL strategy
   */
  private evaluateS0(
    payload: SimulatedTxPayload,
    riskScore: TxRiskScore,
    originTrust: number
  ): { score: number; reason: string } {
    let score = 50; // Base score
    let reasons: string[] = [];
    
    // Low value + trusted origin favors S0
    if (
      payload.estimatedAmount <= SELECTION_RULES.LOW_VALUE_TRUSTED.maxAmount &&
      originTrust >= SELECTION_RULES.LOW_VALUE_TRUSTED.minOriginTrust &&
      riskScore.level === 'LOW'
    ) {
      score += 40;
      reasons.push('low-value transaction from trusted origin');
    }
    
    // Low risk favors S0
    if (riskScore.level === 'LOW') {
      score += 20;
      reasons.push('low risk score');
    }
    
    // High risk penalizes S0
    if (riskScore.level === 'HIGH') {
      score -= 40;
      reasons.push('high risk discourages normal execution');
    }
    
    // Large amounts penalize S0
    if (payload.estimatedAmount > 1.0) {
      score -= 20;
      reasons.push('moderate amount suggests more privacy');
    }
    
    return {
      score: Math.max(0, Math.min(100, score)),
      reason: reasons.length > 0 ? reasons.join('; ') : 'default evaluation',
    };
  }
  
  /**
   * Evaluate S1_RPC_PRIVACY strategy
   */
  private evaluateS1(
    payload: SimulatedTxPayload,
    riskScore: TxRiskScore,
    originTrust: number
  ): { score: number; reason: string } {
    let score = 40; // Base score
    let reasons: string[] = [];
    
    // Medium risk favors S1
    if (riskScore.level === 'MEDIUM') {
      score += 30;
      reasons.push('moderate risk suggests RPC privacy');
    }
    
    // Unknown origin favors S1
    if (originTrust < 50) {
      score += 20;
      reasons.push('untrusted origin warrants IP protection');
    }
    
    // Moderate amounts favor S1
    if (payload.estimatedAmount > 0.5 && payload.estimatedAmount <= 5.0) {
      score += 15;
      reasons.push('moderate amount benefits from privacy');
    }
    
    // Simple transfers work well with S1
    if (payload.instructionCount <= 2) {
      score += 10;
      reasons.push('simple transaction suitable for RPC privacy');
    }
    
    return {
      score: Math.max(0, Math.min(100, score)),
      reason: reasons.length > 0 ? reasons.join('; ') : 'default evaluation',
    };
  }
  
  /**
   * Evaluate S3_PRIVACY_RAIL strategy
   * 
   * PHASE 3.6: References adapter capabilities but NEVER enables selection.
   * NullPrivateRailAdapter always returns unavailable.
   */
  private evaluateS3PrivacyRail(
    payload: SimulatedTxPayload,
    riskScore: TxRiskScore
  ): { score: number; reason: string } {
    // Check adapter status
    const status = this.privateRailAdapter.getStatus();
    const capabilities = this.privateRailAdapter.getCapabilities();
    
    // If rail is not available, return low score with reason
    if (status !== PrivateRailStatus.READY) {
      return {
        score: 0, // Never selected
        reason: this.getPrivateRailStatusReason(status),
      };
    }
    
    // Even if somehow available, check capabilities match transaction type
    if (!capabilities.supportsTransfers && !capabilities.supportsProgramCalls) {
      return {
        score: 0,
        reason: 'Private rail does not support required transaction type',
      };
    }
    
    // Would evaluate based on privacy features - but currently always unavailable
    let score = 80; // High base score when available
    let reasons: string[] = [];
    
    if (capabilities.hidesSender) {
      score += 5;
      reasons.push('hides sender');
    }
    if (capabilities.hidesAmount) {
      score += 5;
      reasons.push('hides amount');
    }
    if (capabilities.hidesRecipient) {
      score += 5;
      reasons.push('hides recipient');
    }
    
    // High risk favors privacy rail
    if (riskScore.level === 'HIGH') {
      score += 5;
      reasons.push('high risk benefits from maximum privacy');
    }
    
    return {
      score: Math.max(0, Math.min(100, score)),
      reason: reasons.length > 0 ? reasons.join('; ') : 'full privacy pipeline',
    };
  }
  
  /**
   * Get human-readable reason for private rail status
   */
  private getPrivateRailStatusReason(status: PrivateRailStatus): string {
    switch (status) {
      case PrivateRailStatus.NOT_AVAILABLE:
        return 'Private rail not available (no implementation)';
      case PrivateRailStatus.NOT_CONFIGURED:
        return 'Private rail not configured';
      case PrivateRailStatus.TEMPORARILY_UNAVAILABLE:
        return 'Private rail temporarily unavailable';
      case PrivateRailStatus.DISABLED_BY_POLICY:
        return 'Private rail disabled by policy';
      case PrivateRailStatus.READY:
        return 'Private rail ready';
      default:
        return 'Unknown private rail status';
    }
  }
  
  /**
   * Get private rail info for receipt/pipeline
   */
  getPrivateRailInfo(): {
    available: boolean;
    status: PrivateRailStatus;
    reason: string;
    capabilities: PrivateRailCapabilities;
  } {
    const status = this.privateRailAdapter.getStatus();
    const capabilities = this.privateRailAdapter.getCapabilities();
    const available = this.privateRailAdapter.isAvailable();
    
    return {
      available,
      status,
      reason: this.getPrivateRailStatusReason(status),
      capabilities,
    };
  }
  
  /**
   * Evaluate S2_EPHEMERAL_SENDER strategy
   */
  private evaluateS2(
    payload: SimulatedTxPayload,
    riskScore: TxRiskScore,
    originTrust: number
  ): { score: number; reason: string } {
    let score = 20; // Base score (lower - more expensive)
    let reasons: string[] = [];
    
    // High risk strongly favors S2
    if (riskScore.level === 'HIGH') {
      score += 50;
      reasons.push('high risk warrants sender anonymity');
    }
    
    // High value favors S2
    if (payload.estimatedAmount >= SELECTION_RULES.HIGH_VALUE_OR_APPROVAL.minAmount) {
      score += 30;
      reasons.push('high-value transaction needs protection');
    }
    
    // Approvals favor S2
    if (
      payload.instructionData.includes('approve') ||
      payload.instructionData.includes('delegate')
    ) {
      score += 25;
      reasons.push('approval transactions benefit from sender anonymity');
    }
    
    // Very low origin trust favors S2
    if (originTrust < 20) {
      score += 20;
      reasons.push('very low origin trust requires anonymity');
    }
    
    return {
      score: Math.max(0, Math.min(100, score)),
      reason: reasons.length > 0 ? reasons.join('; ') : 'higher cost option',
    };
  }
  
  /**
   * Select the best strategy from evaluations
   */
  private selectBest(
    evaluations: Map<TxStrategy, { score: number; reason: string }>,
    riskScore: TxRiskScore
  ): { strategy: TxStrategy; confidence: number } {
    let bestStrategy = TxStrategy.S0_NORMAL;
    let bestScore = 0;
    
    for (const [strategy, evaluation] of evaluations) {
      // Skip S3 for now - not implemented
      if (strategy === TxStrategy.S3_PRIVACY_RAIL) {
        continue;
      }
      
      if (evaluation.score > bestScore) {
        bestScore = evaluation.score;
        bestStrategy = strategy;
      }
    }
    
    // Calculate confidence based on score difference
    const scores = Array.from(evaluations.values())
      .filter((_, i) => 
        Array.from(evaluations.keys())[i] !== TxStrategy.S3_PRIVACY_RAIL
      )
      .map(e => e.score);
    
    const sortedScores = scores.sort((a, b) => b - a);
    const scoreDiff = sortedScores[0] - (sortedScores[1] || 0);
    const confidence = Math.min(0.95, 0.5 + (scoreDiff / 100));
    
    return { strategy: bestStrategy, confidence };
  }
  
  /**
   * Generate human-readable rationale
   */
  private generateRationale(
    strategy: TxStrategy,
    payload: SimulatedTxPayload,
    riskScore: TxRiskScore,
    originTrust: number
  ): string {
    const profile = STRATEGY_PROFILES[strategy];
    
    let rationale = `Selected ${strategy}: ${profile.description}. `;
    
    // Add context
    rationale += `Transaction risk is ${riskScore.level.toLowerCase()} `;
    rationale += `(score: ${riskScore.score}). `;
    
    if (originTrust >= 70) {
      rationale += 'Origin is trusted. ';
    } else if (originTrust < 30) {
      rationale += 'Origin trust is low. ';
    }
    
    if (payload.estimatedAmount > 0) {
      rationale += `Estimated amount: ${payload.estimatedAmount} SOL. `;
    }
    
    // Add privacy/cost tradeoff
    if (profile.costImpact !== 'NONE') {
      rationale += `This strategy has ${profile.costImpact.toLowerCase()} additional cost `;
      rationale += `for ${profile.privacyLevel}% privacy level.`;
    } else {
      rationale += `Minimal privacy protection (${profile.privacyLevel}%) with no additional cost.`;
    }
    
    return rationale;
  }
  
  /**
   * Get alternative strategies with reasons
   */
  private getAlternatives(
    evaluations: Map<TxStrategy, { score: number; reason: string }>,
    selectedStrategy: TxStrategy
  ): TxStrategySelection['alternatives'] {
    return Array.from(evaluations.entries())
      .filter(([strategy]) => strategy !== selectedStrategy)
      .sort(([, a], [, b]) => b.score - a.score)
      .map(([strategy, evaluation]) => ({
        strategy,
        reason: evaluation.reason,
      }));
  }
}

// Singleton instance
let strategySelector: StrategySelector | null = null;

/**
 * Get the StrategySelector singleton
 */
export function getStrategySelector(): StrategySelector {
  if (!strategySelector) {
    strategySelector = new StrategySelector();
  }
  return strategySelector;
}

/**
 * Reset the StrategySelector singleton (for testing)
 */
export function resetStrategySelector(): void {
  strategySelector = null;
}

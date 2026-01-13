/**
 * Liminal - Transaction Risk Scorer
 * 
 * Scores transaction risk based on deterministic rules.
 * 
 * PHASE 3.0 RULES:
 * - DRY-RUN ONLY
 * - NO real Solana RPC calls
 * - NO signing
 * - Deterministic scoring only
 */

import {
  TxType,
  TxRiskInputs,
  TxRiskScore,
  TxRiskFactor,
} from '../../../shared/tx-types';
import type { RiskLevel } from '../../../shared/ai-types';

// Risk level constants (matches RiskLevel type)
const RISK_LEVELS = {
  LOW: 'LOW' as RiskLevel,
  MEDIUM: 'MEDIUM' as RiskLevel,
  HIGH: 'HIGH' as RiskLevel,
};

// Risk thresholds
const THRESHOLDS = {
  // Amount thresholds (in SOL)
  AMOUNT_LOW: 0.1,
  AMOUNT_MEDIUM: 1.0,
  AMOUNT_HIGH: 10.0,
  
  // Origin trust thresholds (0-100)
  TRUST_LOW: 30,
  TRUST_HIGH: 70,
  
  // Instruction count thresholds
  INSTRUCTIONS_SIMPLE: 2,
  INSTRUCTIONS_COMPLEX: 5,
  
  // Score thresholds for risk level
  SCORE_LOW: 30,
  SCORE_HIGH: 60,
};

// Risk weights for different factors
const WEIGHTS = {
  ORIGIN_TRUST: 25,
  CONTEXT_RISK: 20,
  TX_TYPE: 15,
  AMOUNT: 20,
  DESTINATION: 10,
  COMPLEXITY: 10,
};

/**
 * Transaction Risk Scorer
 * 
 * Analyzes transactions and produces deterministic risk scores.
 * All scoring is based on configurable rules and thresholds.
 */
export class TxRiskScorer {
  /**
   * Score transaction risk
   * 
   * @param inputs - Risk scoring inputs
   * @returns Risk score result
   */
  score(inputs: TxRiskInputs): TxRiskScore {
    const factors: TxRiskFactor[] = [];
    
    // Calculate individual factors
    factors.push(this.scoreOriginTrust(inputs.originTrust));
    factors.push(this.scoreContextRisk(inputs.contextRisk));
    factors.push(this.scoreTxType(inputs.txType));
    factors.push(this.scoreAmount(inputs.estimatedAmount));
    factors.push(this.scoreDestination(inputs.knownDestination));
    factors.push(this.scoreComplexity(inputs.instructionCount));
    
    // Calculate total score
    const totalScore = factors.reduce((sum, f) => sum + f.contribution, 0);
    
    // Determine risk level
    const level = this.determineLevel(totalScore);
    
    // Generate summary
    const summary = this.generateSummary(level, factors, inputs);
    
    return {
      level,
      score: Math.round(totalScore),
      factors,
      summary,
    };
  }
  
  /**
   * Score origin trust factor
   */
  private scoreOriginTrust(trust: number): TxRiskFactor {
    // Lower trust = higher risk
    const invertedTrust = 100 - trust;
    const contribution = (invertedTrust / 100) * WEIGHTS.ORIGIN_TRUST;
    
    let description: string;
    if (trust >= THRESHOLDS.TRUST_HIGH) {
      description = 'Origin is highly trusted';
    } else if (trust >= THRESHOLDS.TRUST_LOW) {
      description = 'Origin has moderate trust';
    } else {
      description = 'Origin has low trust or is unknown';
    }
    
    return {
      name: 'Origin Trust',
      contribution: Math.round(contribution * 10) / 10,
      description,
    };
  }
  
  /**
   * Score context risk factor
   */
  private scoreContextRisk(contextRisk: RiskLevel): TxRiskFactor {
    let riskMultiplier: number;
    let description: string;
    
    switch (contextRisk) {
      case 'LOW':
        riskMultiplier = 0.2;
        description = 'Context has low privacy risk';
        break;
      case 'MEDIUM':
        riskMultiplier = 0.5;
        description = 'Context has moderate privacy risk';
        break;
      case 'HIGH':
        riskMultiplier = 1.0;
        description = 'Context has high privacy risk';
        break;
      default:
        riskMultiplier = 0.5;
        description = 'Context risk unknown';
    }
    
    const contribution = riskMultiplier * WEIGHTS.CONTEXT_RISK;
    
    return {
      name: 'Context Risk',
      contribution: Math.round(contribution * 10) / 10,
      description,
    };
  }
  
  /**
   * Score transaction type factor
   */
  private scoreTxType(txType: TxType): TxRiskFactor {
    let riskMultiplier: number;
    let description: string;
    
    switch (txType) {
      case TxType.TRANSFER:
        riskMultiplier = 0.3;
        description = 'Simple transfer - lower risk';
        break;
      case TxType.SWAP:
        riskMultiplier = 0.5;
        description = 'Token swap - moderate risk';
        break;
      case TxType.APPROVAL:
        riskMultiplier = 0.8;
        description = 'Token approval - higher risk (grants permissions)';
        break;
      case TxType.PROGRAM_INTERACTION:
        riskMultiplier = 0.6;
        description = 'Program interaction - moderate to high risk';
        break;
      case TxType.UNKNOWN:
      default:
        riskMultiplier = 1.0;
        description = 'Unknown transaction type - highest risk';
    }
    
    const contribution = riskMultiplier * WEIGHTS.TX_TYPE;
    
    return {
      name: 'Transaction Type',
      contribution: Math.round(contribution * 10) / 10,
      description,
    };
  }
  
  /**
   * Score amount factor
   */
  private scoreAmount(amount: number): TxRiskFactor {
    let riskMultiplier: number;
    let description: string;
    
    if (amount <= THRESHOLDS.AMOUNT_LOW) {
      riskMultiplier = 0.1;
      description = `Small amount (${amount} SOL)`;
    } else if (amount <= THRESHOLDS.AMOUNT_MEDIUM) {
      riskMultiplier = 0.4;
      description = `Moderate amount (${amount} SOL)`;
    } else if (amount <= THRESHOLDS.AMOUNT_HIGH) {
      riskMultiplier = 0.7;
      description = `Large amount (${amount} SOL)`;
    } else {
      riskMultiplier = 1.0;
      description = `Very large amount (${amount} SOL) - caution advised`;
    }
    
    const contribution = riskMultiplier * WEIGHTS.AMOUNT;
    
    return {
      name: 'Amount',
      contribution: Math.round(contribution * 10) / 10,
      description,
    };
  }
  
  /**
   * Score destination factor
   */
  private scoreDestination(isKnown: boolean): TxRiskFactor {
    const riskMultiplier = isKnown ? 0.2 : 0.8;
    const description = isKnown
      ? 'Destination is known/trusted'
      : 'Destination is unknown';
    
    const contribution = riskMultiplier * WEIGHTS.DESTINATION;
    
    return {
      name: 'Destination',
      contribution: Math.round(contribution * 10) / 10,
      description,
    };
  }
  
  /**
   * Score transaction complexity factor
   */
  private scoreComplexity(instructionCount: number): TxRiskFactor {
    let riskMultiplier: number;
    let description: string;
    
    if (instructionCount <= THRESHOLDS.INSTRUCTIONS_SIMPLE) {
      riskMultiplier = 0.2;
      description = `Simple transaction (${instructionCount} instruction${instructionCount !== 1 ? 's' : ''})`;
    } else if (instructionCount <= THRESHOLDS.INSTRUCTIONS_COMPLEX) {
      riskMultiplier = 0.5;
      description = `Moderately complex (${instructionCount} instructions)`;
    } else {
      riskMultiplier = 0.9;
      description = `Complex transaction (${instructionCount} instructions) - review carefully`;
    }
    
    const contribution = riskMultiplier * WEIGHTS.COMPLEXITY;
    
    return {
      name: 'Complexity',
      contribution: Math.round(contribution * 10) / 10,
      description,
    };
  }
  
  /**
   * Determine risk level from score
   */
  private determineLevel(score: number): RiskLevel {
    if (score < THRESHOLDS.SCORE_LOW) {
      return 'LOW';
    } else if (score < THRESHOLDS.SCORE_HIGH) {
      return 'MEDIUM';
    } else {
      return 'HIGH';
    }
  }
  
  /**
   * Generate human-readable summary
   */
  private generateSummary(
    level: RiskLevel,
    factors: TxRiskFactor[],
    inputs: TxRiskInputs
  ): string {
    // Find top contributing factors
    const sortedFactors = [...factors].sort(
      (a, b) => b.contribution - a.contribution
    );
    const topFactors = sortedFactors.slice(0, 2);
    
    let summary = `Risk level: ${level}. `;
    
    switch (level) {
      case 'LOW':
        summary += 'This transaction appears safe. ';
        break;
      case 'MEDIUM':
        summary += 'This transaction has some risk factors. ';
        break;
      case 'HIGH':
        summary += 'This transaction has significant risk factors. Review carefully. ';
        break;
    }
    
    summary += `Key factors: ${topFactors.map(f => f.name.toLowerCase()).join(', ')}.`;
    
    if (inputs.txType === TxType.UNKNOWN) {
      summary += ' Warning: Transaction type could not be determined.';
    }
    
    return summary;
  }
}

// Singleton instance
let txRiskScorer: TxRiskScorer | null = null;

/**
 * Get the TxRiskScorer singleton
 */
export function getTxRiskScorer(): TxRiskScorer {
  if (!txRiskScorer) {
    txRiskScorer = new TxRiskScorer();
  }
  return txRiskScorer;
}


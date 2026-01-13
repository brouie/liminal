/**
 * Liminal - Transaction Classifier
 * 
 * Classifies simulated transaction payloads into types.
 * 
 * PHASE 3.0 RULES:
 * - DRY-RUN ONLY
 * - NO real Solana RPC calls
 * - NO signing
 * - Deterministic classification only
 */

import {
  TxType,
  TxClassification,
  SimulatedTxPayload,
} from '../../../shared/tx-types';

// Well-known Solana program IDs (simulated)
const KNOWN_PROGRAMS = {
  // Token program
  TOKEN_PROGRAM: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  TOKEN_2022_PROGRAM: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
  
  // DEX programs (simulated - not real calls)
  RAYDIUM: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  ORCA: '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP',
  JUPITER: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  
  // System program
  SYSTEM_PROGRAM: '11111111111111111111111111111111',
  
  // Associated token program
  ASSOCIATED_TOKEN_PROGRAM: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
};

// Instruction patterns for classification (simulated)
const INSTRUCTION_PATTERNS = {
  TRANSFER: ['transfer', '03', '0c'], // Common transfer instruction discriminators
  SWAP: ['swap', 'route', 'amm'],
  APPROVAL: ['approve', 'delegate', 'revoke'],
};

/**
 * Transaction Classifier
 * 
 * Analyzes simulated transaction payloads and classifies their intent.
 * All classification is deterministic and based on heuristics.
 */
export class TxClassifier {
  /**
   * Classify a simulated transaction payload
   * 
   * @param payload - Simulated transaction payload
   * @returns Classification result
   */
  classify(payload: SimulatedTxPayload): TxClassification {
    // Determine type based on program ID and instruction data
    const type = this.determineType(payload);
    const confidence = this.calculateConfidence(payload, type);
    const metadata = this.extractMetadata(payload, type);
    const description = this.generateDescription(type, metadata);
    
    return {
      type,
      confidence,
      description,
      metadata,
    };
  }
  
  /**
   * Determine transaction type from payload
   */
  private determineType(payload: SimulatedTxPayload): TxType {
    const programId = payload.programId;
    const instructionData = payload.instructionData.toLowerCase();
    
    // Check for swap programs
    if (this.isSwapProgram(programId)) {
      return TxType.SWAP;
    }
    
    // Check instruction data patterns
    if (this.matchesPattern(instructionData, INSTRUCTION_PATTERNS.SWAP)) {
      return TxType.SWAP;
    }
    
    if (this.matchesPattern(instructionData, INSTRUCTION_PATTERNS.APPROVAL)) {
      return TxType.APPROVAL;
    }
    
    // Check for token program transfers
    if (this.isTokenProgram(programId)) {
      if (this.matchesPattern(instructionData, INSTRUCTION_PATTERNS.TRANSFER)) {
        return TxType.TRANSFER;
      }
      return TxType.PROGRAM_INTERACTION;
    }
    
    // Check for system program transfers
    if (programId === KNOWN_PROGRAMS.SYSTEM_PROGRAM) {
      if (payload.estimatedAmount > 0) {
        return TxType.TRANSFER;
      }
    }
    
    // Check for simple transfer patterns
    if (
      payload.accounts.length === 2 &&
      payload.estimatedAmount > 0 &&
      payload.instructionCount === 1
    ) {
      return TxType.TRANSFER;
    }
    
    // Default to program interaction
    if (payload.instructionCount > 0) {
      return TxType.PROGRAM_INTERACTION;
    }
    
    return TxType.UNKNOWN;
  }
  
  /**
   * Check if program is a swap/DEX program
   */
  private isSwapProgram(programId: string): boolean {
    return [
      KNOWN_PROGRAMS.RAYDIUM,
      KNOWN_PROGRAMS.ORCA,
      KNOWN_PROGRAMS.JUPITER,
    ].includes(programId);
  }
  
  /**
   * Check if program is a token program
   */
  private isTokenProgram(programId: string): boolean {
    return [
      KNOWN_PROGRAMS.TOKEN_PROGRAM,
      KNOWN_PROGRAMS.TOKEN_2022_PROGRAM,
    ].includes(programId);
  }
  
  /**
   * Check if instruction data matches any pattern
   */
  private matchesPattern(data: string, patterns: string[]): boolean {
    return patterns.some(pattern => data.includes(pattern.toLowerCase()));
  }
  
  /**
   * Calculate classification confidence
   */
  private calculateConfidence(
    payload: SimulatedTxPayload,
    type: TxType
  ): number {
    let confidence = 0.5; // Base confidence
    
    // Higher confidence for known programs
    if (Object.values(KNOWN_PROGRAMS).includes(payload.programId)) {
      confidence += 0.2;
    }
    
    // Higher confidence for simple transactions
    if (payload.instructionCount === 1) {
      confidence += 0.1;
    }
    
    // Adjust based on type
    switch (type) {
      case TxType.TRANSFER:
        // Simple transfers have higher confidence
        if (payload.accounts.length <= 3) {
          confidence += 0.1;
        }
        break;
        
      case TxType.SWAP:
        // Swap programs have high confidence
        if (this.isSwapProgram(payload.programId)) {
          confidence += 0.15;
        }
        break;
        
      case TxType.UNKNOWN:
        // Unknown has lower confidence
        confidence = 0.3;
        break;
    }
    
    return Math.min(1, Math.max(0, confidence));
  }
  
  /**
   * Extract metadata from payload
   */
  private extractMetadata(
    payload: SimulatedTxPayload,
    type: TxType
  ): TxClassification['metadata'] {
    const metadata: TxClassification['metadata'] = {
      instructionCount: payload.instructionCount,
      programId: payload.programId,
    };
    
    // Set estimated amount
    if (payload.estimatedAmount > 0) {
      metadata.estimatedAmount = payload.estimatedAmount;
    }
    
    // Extract destination (simplified - last account for transfers)
    if (type === TxType.TRANSFER && payload.accounts.length >= 2) {
      metadata.destination = payload.accounts[payload.accounts.length - 1];
    }
    
    // Extract token mint if present (would be in accounts for token transfers)
    if (this.isTokenProgram(payload.programId) && payload.accounts.length >= 3) {
      // Typically the mint is one of the first accounts
      const potentialMint = payload.accounts[0];
      if (potentialMint.length === 44) {
        metadata.tokenMint = potentialMint;
      }
    }
    
    return metadata;
  }
  
  /**
   * Generate human-readable description
   */
  private generateDescription(
    type: TxType,
    metadata: TxClassification['metadata']
  ): string {
    switch (type) {
      case TxType.TRANSFER:
        if (metadata.estimatedAmount) {
          return `Transfer of ${metadata.estimatedAmount} SOL${
            metadata.destination ? ` to ${metadata.destination.slice(0, 8)}...` : ''
          }`;
        }
        return 'Token transfer';
        
      case TxType.SWAP:
        return `Token swap via ${metadata.programId?.slice(0, 8) || 'DEX'}...`;
        
      case TxType.APPROVAL:
        return 'Token approval or delegation';
        
      case TxType.PROGRAM_INTERACTION:
        return `Interaction with ${metadata.programId?.slice(0, 8) || 'unknown'}... (${metadata.instructionCount} instruction${metadata.instructionCount !== 1 ? 's' : ''})`;
        
      case TxType.UNKNOWN:
      default:
        return 'Unknown transaction type';
    }
  }
}

// Singleton instance
let txClassifier: TxClassifier | null = null;

/**
 * Get the TxClassifier singleton
 */
export function getTxClassifier(): TxClassifier {
  if (!txClassifier) {
    txClassifier = new TxClassifier();
  }
  return txClassifier;
}


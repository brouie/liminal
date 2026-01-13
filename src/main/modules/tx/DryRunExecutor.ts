/**
 * Liminal - Dry-Run Executor
 * 
 * Simulates transaction execution without any real network calls.
 * 
 * PHASE 3.0 RULES:
 * - DRY-RUN ONLY
 * - NO real Solana RPC calls
 * - NO signing
 * - NO actual execution
 * - NO funds movement
 * - SIMULATION ONLY
 */

import { v4 as uuidv4 } from 'uuid';
import {
  TxStrategy,
  TxStrategySelection,
  SimulatedTxPayload,
  DryRunResult,
  SimulatedRpc,
} from '../../../shared/tx-types';
import { createHash } from 'crypto';

// Simulated RPC endpoints (NOT REAL - for simulation only)
const SIMULATED_RPCS: Record<TxStrategy, SimulatedRpc[]> = {
  [TxStrategy.S0_NORMAL]: [
    { name: 'simulated-mainnet-1', isPrivate: false, simulatedLatencyMs: 100 },
    { name: 'simulated-mainnet-2', isPrivate: false, simulatedLatencyMs: 120 },
  ],
  [TxStrategy.S1_RPC_PRIVACY]: [
    { name: 'simulated-private-rpc-1', isPrivate: true, simulatedLatencyMs: 150 },
    { name: 'simulated-private-rpc-2', isPrivate: true, simulatedLatencyMs: 180 },
  ],
  [TxStrategy.S2_EPHEMERAL_SENDER]: [
    { name: 'simulated-ephemeral-rpc', isPrivate: true, simulatedLatencyMs: 200 },
  ],
  [TxStrategy.S3_PRIVACY_RAIL]: [
    { name: 'simulated-privacy-rail', isPrivate: true, simulatedLatencyMs: 500 },
  ],
};

// Simulated fee estimates (NOT REAL)
const SIMULATED_FEES: Record<TxStrategy, { base: number; perInstruction: number }> = {
  [TxStrategy.S0_NORMAL]: { base: 0.000005, perInstruction: 0.000001 },
  [TxStrategy.S1_RPC_PRIVACY]: { base: 0.000005, perInstruction: 0.000001 },
  [TxStrategy.S2_EPHEMERAL_SENDER]: { base: 0.00001, perInstruction: 0.000002 },
  [TxStrategy.S3_PRIVACY_RAIL]: { base: 0.0001, perInstruction: 0.00001 },
};

// Simulated routes
const SIMULATED_ROUTES: Record<TxStrategy, string[]> = {
  [TxStrategy.S0_NORMAL]: ['client', 'rpc', 'validator'],
  [TxStrategy.S1_RPC_PRIVACY]: ['client', 'proxy', 'private-rpc', 'validator'],
  [TxStrategy.S2_EPHEMERAL_SENDER]: [
    'client',
    'ephemeral-wallet-setup',
    'fund-transfer',
    'private-rpc',
    'validator',
  ],
  [TxStrategy.S3_PRIVACY_RAIL]: [
    'client',
    'mixer-input',
    'timing-delay',
    'mixer-output',
    'ephemeral-sender',
    'private-rpc',
    'validator',
  ],
};

/**
 * Dry-Run Executor
 * 
 * Simulates the entire transaction execution pipeline.
 * Returns simulated results - NEVER performs real execution.
 */
export class DryRunExecutor {
  /**
   * Execute a simulated dry-run
   * 
   * THIS IS A SIMULATION ONLY.
   * No real RPC calls, no signing, no funds movement.
   * 
   * @param payload - Simulated transaction payload
   * @param strategySelection - Selected strategy
   * @returns Simulated dry-run result
   */
  execute(
    payload: SimulatedTxPayload,
    strategySelection: TxStrategySelection
  ): DryRunResult {
    const dryRunId = `dryrun_${uuidv4()}`;
    const strategy = strategySelection.strategy;
    
    // Simulate RPC selection
    const simulatedRpc = this.selectRpc(strategy, payload);
    
    // Simulate route
    const route = this.getRoute(strategy);
    
    // Calculate simulated fee
    const estimatedFee = this.calculateFee(strategy, payload);
    
    // Calculate simulated execution time
    const simulatedExecutionMs = this.calculateExecutionTime(
      strategy,
      simulatedRpc,
      route
    );
    
    // Check for simulated warnings
    const warnings = this.checkWarnings(payload, strategy);
    
    // Simulate success/failure (deterministic based on payload)
    const { success, error } = this.simulateOutcome(payload, strategy);
    
    return {
      dryRunId,
      success,
      simulatedRpc,
      strategy,
      route,
      estimatedFee,
      simulatedExecutionMs,
      warnings,
      error,
      timestamp: Date.now(),
      isSimulation: true, // ALWAYS true - this is never real
    };
  }
  
  /**
   * Select a simulated RPC endpoint
   */
  private selectRpc(strategy: TxStrategy, payload: SimulatedTxPayload): SimulatedRpc {
    const rpcs = SIMULATED_RPCS[strategy];
    
    // Deterministic selection based on payload hash
    const hash = createHash('sha256')
      .update(payload.programId)
      .update(payload.instructionData)
      .digest();
    
    const index = hash[0] % rpcs.length;
    return { ...rpcs[index] };
  }
  
  /**
   * Get the simulated route for a strategy
   */
  private getRoute(strategy: TxStrategy): string[] {
    return [...SIMULATED_ROUTES[strategy]];
  }
  
  /**
   * Calculate simulated fee
   */
  private calculateFee(strategy: TxStrategy, payload: SimulatedTxPayload): number {
    const fees = SIMULATED_FEES[strategy];
    const fee = fees.base + fees.perInstruction * payload.instructionCount;
    return Math.round(fee * 1000000) / 1000000; // 6 decimal places
  }
  
  /**
   * Calculate simulated execution time
   */
  private calculateExecutionTime(
    strategy: TxStrategy,
    rpc: SimulatedRpc,
    route: string[]
  ): number {
    // Base latency from RPC
    let time = rpc.simulatedLatencyMs;
    
    // Add time for each route step
    time += route.length * 20;
    
    // Add overhead for more private strategies
    switch (strategy) {
      case TxStrategy.S1_RPC_PRIVACY:
        time += 50;
        break;
      case TxStrategy.S2_EPHEMERAL_SENDER:
        time += 200;
        break;
      case TxStrategy.S3_PRIVACY_RAIL:
        time += 1000;
        break;
    }
    
    return time;
  }
  
  /**
   * Check for simulated warnings
   */
  private checkWarnings(
    payload: SimulatedTxPayload,
    strategy: TxStrategy
  ): string[] {
    const warnings: string[] = [];
    
    // Large transaction warning
    if (payload.estimatedAmount > 10) {
      warnings.push('Large transaction amount - verify destination carefully');
    }
    
    // Complex transaction warning
    if (payload.instructionCount > 5) {
      warnings.push('Complex transaction with multiple instructions');
    }
    
    // S3 not implemented warning
    if (strategy === TxStrategy.S3_PRIVACY_RAIL) {
      warnings.push('Privacy rail is not yet implemented - simulation only');
    }
    
    // Unknown program warning
    if (payload.programId.length < 32) {
      warnings.push('Program ID may be invalid');
    }
    
    return warnings;
  }
  
  /**
   * Simulate transaction outcome (deterministic)
   * 
   * This is a SIMULATION - no real execution occurs.
   */
  private simulateOutcome(
    payload: SimulatedTxPayload,
    strategy: TxStrategy
  ): { success: boolean; error?: string } {
    // Deterministic failure conditions (for simulation)
    
    // Invalid instruction data
    if (payload.instructionData.length === 0) {
      return {
        success: false,
        error: 'Simulated failure: Empty instruction data',
      };
    }
    
    // No accounts
    if (payload.accounts.length === 0) {
      return {
        success: false,
        error: 'Simulated failure: No accounts specified',
      };
    }
    
    // S3 always "fails" - not implemented
    if (strategy === TxStrategy.S3_PRIVACY_RAIL) {
      return {
        success: false,
        error: 'Simulated failure: Privacy rail not yet implemented',
      };
    }
    
    // Hash-based deterministic failure for testing (1% failure rate)
    const hash = createHash('sha256')
      .update(payload.programId)
      .update(payload.instructionData)
      .update(String(payload.estimatedAmount))
      .digest();
    
    if (hash[0] === 0) {
      return {
        success: false,
        error: 'Simulated failure: Random network condition',
      };
    }
    
    // Success case
    return { success: true };
  }
  
  /**
   * Validate payload before dry-run
   */
  validatePayload(payload: SimulatedTxPayload): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    
    if (!payload.programId || payload.programId.length < 10) {
      errors.push('Invalid or missing program ID');
    }
    
    if (!payload.instructionData) {
      errors.push('Missing instruction data');
    }
    
    if (payload.instructionCount < 0) {
      errors.push('Invalid instruction count');
    }
    
    if (!Array.isArray(payload.accounts)) {
      errors.push('Accounts must be an array');
    }
    
    if (payload.estimatedAmount < 0) {
      errors.push('Estimated amount cannot be negative');
    }
    
    if (!payload.origin) {
      errors.push('Origin is required');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// Singleton instance
let dryRunExecutor: DryRunExecutor | null = null;

/**
 * Get the DryRunExecutor singleton
 */
export function getDryRunExecutor(): DryRunExecutor {
  if (!dryRunExecutor) {
    dryRunExecutor = new DryRunExecutor();
  }
  return dryRunExecutor;
}


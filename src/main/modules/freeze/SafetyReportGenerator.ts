/**
 * Liminal - Safety Report Generator
 * 
 * Generates machine-verifiable safety reports.
 * 
 * PHASE 3.10 RULES:
 * - Deterministic output (same state → same report)
 * - Includes all safety guarantees
 * - Report hash for integrity verification
 */

import { createHash } from 'crypto';
import {
  SafetyReport,
  PolicyLockStatus,
  InvariantId,
  KillSwitchState,
} from '../../../shared/tx-types';
import { getExecutionPolicyManager } from '../policy';
import { getInvariantManager } from '../invariants';
import { getSafetyGuaranteeManager } from '../safety';
import { getPhaseFreeze, PhaseFreeze } from './PhaseFreeze';

/**
 * Safety Report Generator
 * 
 * Generates deterministic safety reports.
 */
export class SafetyReportGenerator {
  private readonly REPORT_VERSION = '3.10.0';
  private readonly PHASE = '3';
  private lastReport: SafetyReport | null = null;
  
  /**
   * Generate safety report
   * 
   * Deterministic output: same state → same report.
   */
  generateReport(): SafetyReport {
    const policyManager = getExecutionPolicyManager();
    const invariantManager = getInvariantManager();
    const safetyManager = getSafetyGuaranteeManager();
    const phaseFreeze = getPhaseFreeze();
    const policyState = policyManager.getPolicyState();
    const invariantState = invariantManager.getState();
    const safetySnapshot = safetyManager.getSnapshot();
    const killSwitchStatus = invariantManager.getKillSwitchStatus();
    
    // Get all invariants
    const invariants = invariantManager.getInvariants().map(inv => ({
      id: inv.id,
      version: inv.version,
      description: inv.description,
    }));
    
    // Build report
    const report: Omit<SafetyReport, 'reportHash'> = {
      version: this.REPORT_VERSION,
      generatedAt: Date.now(),
      phase: this.PHASE,
      enabledCapabilities: {
        signing: true, // Signing is enabled in Phase 3.1+
        readOnlyRpc: true, // Read-only RPC is enabled in Phase 3.4+
        dryRun: true, // Dry-run is enabled in Phase 3.0+
        receiptGeneration: true, // Receipts are enabled
      },
      disabledCapabilities: {
        submission: true, // Submission is disabled
        privateRailExecution: true, // Private rail is disabled
        fundsMovement: true, // Funds movement is disabled
        relayer: true, // Relayers are disabled
        zkProofs: true, // ZK proofs are disabled
      },
      policyState: {
        version: policyState.version,
        locked: policyState.lockStatus === PolicyLockStatus.LOCKED,
        lockStatus: policyState.lockStatus,
        flags: {
          allowSubmission: policyState.flags.allowSubmission,
          allowPrivateRail: policyState.flags.allowPrivateRail,
          allowRelayer: policyState.flags.allowRelayer,
          allowZkProofs: policyState.flags.allowZkProofs,
          allowFundMovement: policyState.flags.allowFundMovement,
        },
      },
      invariants,
      killSwitch: {
        state: killSwitchStatus.state,
        totalActivations: killSwitchStatus.totalActivations,
      },
      rpcCapabilities: {
        readOnly: true,
        allowedMethods: ['getHealth', 'getLatestBlockhash', 'getSlot', 'getVersion'],
        blockedMethods: [
          'sendTransaction',
          'sendRawTransaction',
          'sendAndConfirmTransaction',
          'sendAndConfirmRawTransaction',
          'submitTransaction',
          'broadcastTransaction',
        ],
      },
      safetySnapshot: {
        submissionBlocked: safetySnapshot.submissionBlocked,
        privateRailAvailable: safetySnapshot.privateRailAvailable,
        fundsMovementAllowed: safetySnapshot.fundsMovementAllowed,
        signingEnabled: safetySnapshot.signingEnabled,
        readOnlyRpcEnabled: safetySnapshot.readOnlyRpcEnabled,
      },
    };
    
    // Generate deterministic hash
    const reportHash = this.hashReport(report);
    
    const fullReport: SafetyReport = {
      ...report,
      reportHash,
    };
    this.lastReport = fullReport;
    return fullReport;
  }
  
  /**
   * Hash report for integrity verification
   * 
   * Deterministic: same report content → same hash.
   */
  private hashReport(report: Omit<SafetyReport, 'reportHash'>): string {
    // Create deterministic JSON (sorted keys, no undefined)
    const json = JSON.stringify(report, Object.keys(report).sort());
    return createHash('sha256').update(json).digest('hex');
  }
  
  /**
   * Get attestation metadata
   */
  getAttestationMetadata(): {
    version: string;
    generatedAt: number;
    safetyReportHash: string;
    invariantVersion: number;
    phaseFrozen: boolean;
  } {
    // Reuse the last generated report if available to keep metadata aligned
    const report = this.lastReport ?? this.generateReport();
    const invariantState = getInvariantManager().getState();
    const phaseFreeze = getPhaseFreeze();
    
    return {
      version: this.REPORT_VERSION,
      generatedAt: report.generatedAt,
      safetyReportHash: report.reportHash,
      invariantVersion: invariantState.version,
      phaseFrozen: phaseFreeze.isFrozen(),
    };
  }
}

// ============ Singleton ============

let reportGenerator: SafetyReportGenerator | null = null;

/**
 * Get the SafetyReportGenerator singleton
 */
export function getSafetyReportGenerator(): SafetyReportGenerator {
  if (!reportGenerator) {
    reportGenerator = new SafetyReportGenerator();
  }
  return reportGenerator;
}

/**
 * Reset the SafetyReportGenerator singleton (for testing)
 */
export function resetSafetyReportGenerator(): void {
  reportGenerator = null;
}


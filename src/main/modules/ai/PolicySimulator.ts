/**
 * PolicySimulator - Pure Policy Impact Simulation Engine
 * 
 * Simulates what WOULD change under different privacy modes,
 * WITHOUT actually modifying any state, policy, or enforcement.
 * 
 * PHASE 2.2 RULES:
 * - This is a PURE function - no side effects
 * - NEVER modifies enforcement config
 * - NEVER modifies runtime behavior
 * - Output is PREVIEW ONLY
 * 
 * NO Solana, NO wallets, NO transactions.
 */

import {
  TelemetrySnapshot,
  SimulationMode,
  SimulationResult,
  SimulationDelta,
  PolicySimulationOutput,
  RiskLevel,
} from '../../../shared/ai-types';

/**
 * Policy profiles for simulation
 * These are HYPOTHETICAL - they do NOT affect real enforcement
 */
interface PolicyProfile {
  /** Percentage of third-party requests that would be blocked */
  thirdPartyBlockRate: number;
  /** Whether fingerprint APIs would be fully blocked */
  fingerprintBlockLevel: 'none' | 'partial' | 'full';
  /** Header hardening level */
  headerHardeningLevel: 'minimal' | 'standard' | 'aggressive';
  /** Description */
  description: string;
}

const POLICY_PROFILES: Record<SimulationMode, PolicyProfile> = {
  STRICT: {
    thirdPartyBlockRate: 0.85, // Block 85% of third-party requests
    fingerprintBlockLevel: 'full',
    headerHardeningLevel: 'aggressive',
    description: 'Maximum privacy protection with potential site breakage',
  },
  BALANCED: {
    thirdPartyBlockRate: 0.50, // Block 50% of third-party requests
    fingerprintBlockLevel: 'partial',
    headerHardeningLevel: 'standard',
    description: 'Balance between privacy and functionality',
  },
  PERMISSIVE: {
    thirdPartyBlockRate: 0.20, // Block 20% of third-party requests
    fingerprintBlockLevel: 'none',
    headerHardeningLevel: 'minimal',
    description: 'Minimal protection, maximum compatibility',
  },
};

/**
 * Create a simulation delta object
 */
function createDelta(current: number, simulated: number): SimulationDelta {
  const change = simulated - current;
  const percentChange = current > 0 
    ? Math.round((change / current) * 100) 
    : (simulated > 0 ? 100 : 0);
  
  return {
    current,
    simulated,
    change,
    percentChange,
  };
}

/**
 * Estimate blocked requests under a hypothetical mode
 * This is a PURE calculation - no side effects
 */
function estimateBlockedRequests(
  snapshot: TelemetrySnapshot,
  profile: PolicyProfile
): SimulationDelta {
  const currentBlocked = snapshot.requests.blockedRequests;
  const thirdPartyCount = snapshot.requests.thirdPartyRequests;
  
  // Estimate based on profile's block rate
  const estimatedBlocked = Math.round(thirdPartyCount * profile.thirdPartyBlockRate);
  
  return createDelta(currentBlocked, estimatedBlocked);
}

/**
 * Estimate fingerprint protection under a hypothetical mode
 * Returns a score 0-100 indicating protection level
 */
function estimateFingerprintProtection(
  snapshot: TelemetrySnapshot,
  profile: PolicyProfile
): SimulationDelta {
  // Calculate current fingerprint exposure (0-100)
  const fpTypes = [
    snapshot.fingerprinting.canvasAccessed,
    snapshot.fingerprinting.webglAccessed,
    snapshot.fingerprinting.audioAccessed,
    snapshot.fingerprinting.navigatorAccessed,
  ];
  
  const exposedCount = fpTypes.filter(Boolean).length;
  const currentExposure = (exposedCount / 4) * 100;
  const currentProtection = 100 - currentExposure;
  
  // Estimate protection under new profile
  let simulatedProtection: number;
  switch (profile.fingerprintBlockLevel) {
    case 'full':
      simulatedProtection = 95; // Near-complete protection
      break;
    case 'partial':
      simulatedProtection = 65; // Partial protection
      break;
    case 'none':
      simulatedProtection = 30; // Minimal protection
      break;
  }
  
  return createDelta(Math.round(currentProtection), simulatedProtection);
}

/**
 * Estimate third-party blocking under a hypothetical mode
 */
function estimateThirdPartyBlocking(
  snapshot: TelemetrySnapshot,
  profile: PolicyProfile
): SimulationDelta {
  const thirdPartyCount = snapshot.requests.thirdPartyRequests;
  const currentBlocked = snapshot.requests.blockedRequests;
  
  // Calculate current block rate
  const currentRate = thirdPartyCount > 0 
    ? Math.round((currentBlocked / thirdPartyCount) * 100)
    : 0;
  
  // Simulated rate
  const simulatedRate = Math.round(profile.thirdPartyBlockRate * 100);
  
  return createDelta(currentRate, simulatedRate);
}

/**
 * Estimate header hardening under a hypothetical mode
 */
function estimateHeaderHardening(
  snapshot: TelemetrySnapshot,
  profile: PolicyProfile
): SimulationDelta {
  const currentModifications = 
    snapshot.headers.referrerStripped +
    snapshot.headers.referrerReduced +
    snapshot.headers.userAgentNormalized +
    snapshot.headers.clientHintsStripped;
  
  const totalRequests = snapshot.requests.totalRequests;
  
  // Current hardening rate
  const currentRate = totalRequests > 0
    ? Math.round((currentModifications / (totalRequests * 4)) * 100)
    : 0;
  
  // Simulated rate based on profile
  let simulatedRate: number;
  switch (profile.headerHardeningLevel) {
    case 'aggressive':
      simulatedRate = 95;
      break;
    case 'standard':
      simulatedRate = 60;
      break;
    case 'minimal':
      simulatedRate = 25;
      break;
  }
  
  return createDelta(currentRate, simulatedRate);
}

/**
 * Estimate breakage risk under a hypothetical mode
 */
function estimateBreakageRisk(
  snapshot: TelemetrySnapshot,
  mode: SimulationMode
): { risk: number; level: RiskLevel } {
  const thirdPartyCount = snapshot.requests.thirdPartyRequests;
  const thirdPartyDomains = snapshot.requests.thirdPartyDomains.length;
  
  // Base breakage risk from third-party dependencies
  let baseRisk = Math.min(100, thirdPartyDomains * 5);
  
  // Adjust based on mode
  let modeMultiplier: number;
  switch (mode) {
    case 'STRICT':
      modeMultiplier = 1.5; // Higher breakage risk
      break;
    case 'BALANCED':
      modeMultiplier = 1.0; // Moderate risk
      break;
    case 'PERMISSIVE':
      modeMultiplier = 0.5; // Lower risk
      break;
  }
  
  const risk = Math.min(100, Math.round(baseRisk * modeMultiplier));
  
  let level: RiskLevel;
  if (risk >= 60) {
    level = 'HIGH';
  } else if (risk >= 30) {
    level = 'MEDIUM';
  } else {
    level = 'LOW';
  }
  
  return { risk, level };
}

/**
 * Generate human-readable summary of simulated changes
 */
function generateSummary(
  mode: SimulationMode,
  blockedDelta: SimulationDelta,
  fpDelta: SimulationDelta,
  breakageRisk: number
): string {
  const profile = POLICY_PROFILES[mode];
  
  const blockedChange = blockedDelta.change > 0 
    ? `+${blockedDelta.change} more blocked`
    : blockedDelta.change < 0 
      ? `${Math.abs(blockedDelta.change)} fewer blocked`
      : 'no change';
  
  const fpChange = fpDelta.change > 0
    ? `+${fpDelta.change}% protection`
    : fpDelta.change < 0
      ? `${Math.abs(fpDelta.change)}% less protection`
      : 'no change';
  
  const riskNote = breakageRisk > 50 
    ? 'Some features may break.' 
    : breakageRisk > 25 
      ? 'Minor compatibility issues possible.'
      : 'Expected to work normally.';
  
  return `${mode}: ${blockedChange}, ${fpChange}. ${riskNote}`;
}

/**
 * Generate detailed changes list
 */
function generateChangesList(
  mode: SimulationMode,
  blockedDelta: SimulationDelta,
  fpDelta: SimulationDelta,
  thirdPartyDelta: SimulationDelta,
  headerDelta: SimulationDelta
): string[] {
  const changes: string[] = [];
  const profile = POLICY_PROFILES[mode];
  
  if (blockedDelta.change !== 0) {
    changes.push(
      blockedDelta.change > 0
        ? `Block ${Math.abs(blockedDelta.change)} additional requests`
        : `Allow ${Math.abs(blockedDelta.change)} previously blocked requests`
    );
  }
  
  if (fpDelta.change !== 0) {
    changes.push(
      fpDelta.change > 0
        ? `Increase fingerprint protection by ${Math.abs(fpDelta.change)}%`
        : `Reduce fingerprint protection by ${Math.abs(fpDelta.change)}%`
    );
  }
  
  if (thirdPartyDelta.change !== 0) {
    changes.push(
      thirdPartyDelta.change > 0
        ? `Block ${Math.abs(thirdPartyDelta.change)}% more third-party content`
        : `Allow ${Math.abs(thirdPartyDelta.change)}% more third-party content`
    );
  }
  
  if (headerDelta.change !== 0) {
    changes.push(
      headerDelta.change > 0
        ? `Apply stricter header modifications`
        : `Reduce header modifications`
    );
  }
  
  if (changes.length === 0) {
    changes.push('No significant changes from current behavior');
  }
  
  return changes;
}

/**
 * Determine current effective mode based on telemetry
 */
function determineCurrentMode(snapshot: TelemetrySnapshot): SimulationMode {
  const thirdPartyCount = snapshot.requests.thirdPartyRequests;
  const blockedCount = snapshot.requests.blockedRequests;
  
  if (thirdPartyCount === 0) {
    return 'BALANCED'; // Default when no data
  }
  
  const blockRate = blockedCount / thirdPartyCount;
  
  if (blockRate >= 0.7) {
    return 'STRICT';
  } else if (blockRate >= 0.35) {
    return 'BALANCED';
  } else {
    return 'PERMISSIVE';
  }
}

/**
 * Simulate policy impact for a single mode
 * 
 * This is a PURE FUNCTION - NO SIDE EFFECTS
 * Output is PREVIEW ONLY - does NOT affect enforcement
 */
export function simulateMode(
  snapshot: TelemetrySnapshot,
  mode: SimulationMode
): SimulationResult {
  const profile = POLICY_PROFILES[mode];
  
  // Calculate all deltas (pure calculations)
  const blockedRequests = estimateBlockedRequests(snapshot, profile);
  const fingerprintProtection = estimateFingerprintProtection(snapshot, profile);
  const thirdPartyBlocking = estimateThirdPartyBlocking(snapshot, profile);
  const headerHardening = estimateHeaderHardening(snapshot, profile);
  
  // Calculate breakage risk
  const { risk: breakageRisk, level: breakageRiskLevel } = estimateBreakageRisk(snapshot, mode);
  
  // Generate summaries
  const summary = generateSummary(mode, blockedRequests, fingerprintProtection, breakageRisk);
  const changes = generateChangesList(mode, blockedRequests, fingerprintProtection, thirdPartyBlocking, headerHardening);
  
  return {
    mode,
    blockedRequests,
    fingerprintProtection,
    thirdPartyBlocking,
    headerHardening,
    breakageRisk,
    breakageRiskLevel,
    summary,
    changes,
    simulatedAt: Date.now(),
  };
}

/**
 * Simulate all policy modes
 * 
 * This is a PURE FUNCTION - NO SIDE EFFECTS
 * Output is PREVIEW ONLY - does NOT affect enforcement
 */
export function simulateAllModes(snapshot: TelemetrySnapshot): PolicySimulationOutput {
  return {
    strict: simulateMode(snapshot, 'STRICT'),
    balanced: simulateMode(snapshot, 'BALANCED'),
    permissive: simulateMode(snapshot, 'PERMISSIVE'),
    currentEffectiveMode: determineCurrentMode(snapshot),
  };
}

/**
 * PolicySimulator class for stateless simulation
 * 
 * This is a stateless, pure class - NO SIDE EFFECTS
 * All methods are PREVIEW ONLY - do NOT affect enforcement
 */
export class PolicySimulator {
  /**
   * Simulate policy impact for a single mode
   * PURE FUNCTION - no side effects
   */
  simulate(snapshot: TelemetrySnapshot, mode: SimulationMode): SimulationResult {
    return simulateMode(snapshot, mode);
  }

  /**
   * Simulate all policy modes
   * PURE FUNCTION - no side effects
   */
  simulateAll(snapshot: TelemetrySnapshot): PolicySimulationOutput {
    return simulateAllModes(snapshot);
  }

  /**
   * Get description of a policy mode
   */
  getModeDescription(mode: SimulationMode): string {
    return POLICY_PROFILES[mode].description;
  }

  /**
   * Get all available modes
   */
  getAvailableModes(): SimulationMode[] {
    return ['STRICT', 'BALANCED', 'PERMISSIVE'];
  }
}

// Singleton instance (stateless, so safe to share)
let instance: PolicySimulator | null = null;

export function getPolicySimulator(): PolicySimulator {
  if (!instance) {
    instance = new PolicySimulator();
  }
  return instance;
}

export function resetPolicySimulator(): void {
  instance = null;
}


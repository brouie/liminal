/**
 * PolicyDiffAnalyzer - Policy Diff Explanation Layer
 * 
 * Analyzes and explains WHY simulation modes differ,
 * referencing specific protections and rules.
 * 
 * PHASE 2.3 RULES:
 * - PURE function - no side effects
 * - NEVER mutates state or enforcement
 * - Explanations reference CONCRETE protections
 * - Output is DISPLAY ONLY
 * 
 * NO Solana, NO wallets, NO transactions.
 */

import {
  TelemetrySnapshot,
  PolicySimulationOutput,
  SimulationResult,
  SimulationMode,
  PolicyDiffExplanation,
  ModeExplanation,
  ProtectionFactor,
} from '../../../shared/ai-types';

/**
 * Protection definitions with their characteristics
 */
interface ProtectionDefinition {
  name: string;
  category: 'fingerprint' | 'network' | 'headers' | 'tracking';
  description: string;
  privacyWeight: number; // 0-100
  breakageWeight: number; // 0-100
  strictLevel: number; // 0-100 (how aggressive in STRICT)
  balancedLevel: number; // 0-100
  permissiveLevel: number; // 0-100
}

/**
 * All protection types analyzed
 */
const PROTECTION_DEFINITIONS: ProtectionDefinition[] = [
  {
    name: 'Canvas Fingerprint Blocking',
    category: 'fingerprint',
    description: 'Blocks or adds noise to canvas readout to prevent fingerprinting',
    privacyWeight: 85,
    breakageWeight: 15,
    strictLevel: 100,
    balancedLevel: 70,
    permissiveLevel: 30,
  },
  {
    name: 'WebGL Fingerprint Protection',
    category: 'fingerprint',
    description: 'Normalizes WebGL vendor/renderer strings',
    privacyWeight: 75,
    breakageWeight: 10,
    strictLevel: 100,
    balancedLevel: 60,
    permissiveLevel: 20,
  },
  {
    name: 'AudioContext Fingerprint Noise',
    category: 'fingerprint',
    description: 'Adds deterministic noise to audio fingerprinting',
    privacyWeight: 60,
    breakageWeight: 5,
    strictLevel: 100,
    balancedLevel: 50,
    permissiveLevel: 10,
  },
  {
    name: 'Navigator Properties Masking',
    category: 'fingerprint',
    description: 'Masks or normalizes navigator.plugins and languages',
    privacyWeight: 50,
    breakageWeight: 5,
    strictLevel: 100,
    balancedLevel: 40,
    permissiveLevel: 10,
  },
  {
    name: 'Third-Party Request Blocking',
    category: 'network',
    description: 'Blocks requests to known tracking and advertising domains',
    privacyWeight: 90,
    breakageWeight: 60,
    strictLevel: 85,
    balancedLevel: 50,
    permissiveLevel: 20,
  },
  {
    name: 'Cross-Origin Request Filtering',
    category: 'network',
    description: 'Filters requests to different origins',
    privacyWeight: 70,
    breakageWeight: 45,
    strictLevel: 80,
    balancedLevel: 45,
    permissiveLevel: 15,
  },
  {
    name: 'Referrer Header Minimization',
    category: 'headers',
    description: 'Strips or reduces Referer header to origin only',
    privacyWeight: 65,
    breakageWeight: 20,
    strictLevel: 100,
    balancedLevel: 70,
    permissiveLevel: 30,
  },
  {
    name: 'User-Agent Reduction',
    category: 'headers',
    description: 'Reduces User-Agent entropy while maintaining compatibility',
    privacyWeight: 55,
    breakageWeight: 15,
    strictLevel: 100,
    balancedLevel: 60,
    permissiveLevel: 20,
  },
  {
    name: 'Client Hints Blocking',
    category: 'headers',
    description: 'Removes Sec-CH-UA and related client hint headers',
    privacyWeight: 60,
    breakageWeight: 10,
    strictLevel: 100,
    balancedLevel: 80,
    permissiveLevel: 20,
  },
  {
    name: 'Timing Jitter',
    category: 'tracking',
    description: 'Adds deterministic delays to third-party requests',
    privacyWeight: 40,
    breakageWeight: 5,
    strictLevel: 100,
    balancedLevel: 60,
    permissiveLevel: 20,
  },
  {
    name: 'Cookie Isolation',
    category: 'tracking',
    description: 'Partitions cookies per context to prevent cross-site tracking',
    privacyWeight: 85,
    breakageWeight: 30,
    strictLevel: 100,
    balancedLevel: 100,
    permissiveLevel: 50,
  },
  {
    name: 'Storage Partitioning',
    category: 'tracking',
    description: 'Isolates localStorage and IndexedDB per context',
    privacyWeight: 80,
    breakageWeight: 25,
    strictLevel: 100,
    balancedLevel: 100,
    permissiveLevel: 50,
  },
];

/**
 * Create a protection factor from a definition
 */
function createProtectionFactor(
  def: ProtectionDefinition,
  snapshot: TelemetrySnapshot
): ProtectionFactor {
  // Calculate actual impacts based on telemetry
  let privacyImpact = def.privacyWeight;
  let breakageImpact = def.breakageWeight;

  // Adjust based on what's actually being used on the site
  if (def.category === 'fingerprint') {
    const fpUsed = 
      (def.name.includes('Canvas') && snapshot.fingerprinting.canvasAccessed) ||
      (def.name.includes('WebGL') && snapshot.fingerprinting.webglAccessed) ||
      (def.name.includes('Audio') && snapshot.fingerprinting.audioAccessed) ||
      (def.name.includes('Navigator') && snapshot.fingerprinting.navigatorAccessed);
    
    if (fpUsed) {
      privacyImpact = Math.min(100, privacyImpact * 1.2);
    } else {
      privacyImpact = Math.round(privacyImpact * 0.5);
      breakageImpact = Math.round(breakageImpact * 0.3);
    }
  }

  if (def.category === 'network') {
    // More third-party = higher impact
    const tpRatio = snapshot.requests.thirdPartyRequests / Math.max(1, snapshot.requests.totalRequests);
    privacyImpact = Math.round(privacyImpact * (0.5 + tpRatio));
    breakageImpact = Math.round(breakageImpact * (0.5 + tpRatio));
  }

  return {
    name: def.name,
    category: def.category,
    description: def.description,
    privacyImpact: Math.min(100, Math.round(privacyImpact)),
    breakageImpact: Math.min(100, Math.round(breakageImpact)),
    enabledInStrict: def.strictLevel > 50,
    enabledInBalanced: def.balancedLevel > 50,
    enabledInPermissive: def.permissiveLevel > 50,
  };
}

/**
 * Generate mode-specific explanation
 */
function generateModeExplanation(
  mode: SimulationMode,
  result: SimulationResult,
  factors: ProtectionFactor[],
  snapshot: TelemetrySnapshot
): ModeExplanation {
  // Get factors relevant to this mode
  const modeEnabledFactors = factors.filter(f => {
    switch (mode) {
      case 'STRICT': return f.enabledInStrict;
      case 'BALANCED': return f.enabledInBalanced;
      case 'PERMISSIVE': return f.enabledInPermissive;
    }
  });

  // Sort by impact
  const topPrivacyFactors = [...modeEnabledFactors]
    .sort((a, b) => b.privacyImpact - a.privacyImpact)
    .slice(0, 3);

  const topBreakageFactors = [...modeEnabledFactors]
    .sort((a, b) => b.breakageImpact - a.breakageImpact)
    .slice(0, 2);

  // Generate summary
  let summary: string;
  switch (mode) {
    case 'STRICT':
      summary = `STRICT mode enables ${modeEnabledFactors.length} protections including aggressive fingerprint blocking, ` +
        `third-party request filtering (${result.thirdPartyBlocking.simulated}% blocked), and full header hardening. ` +
        `This maximizes privacy but may cause ${result.breakageRiskLevel.toLowerCase()} site breakage.`;
      break;
    case 'BALANCED':
      summary = `BALANCED mode enables ${modeEnabledFactors.length} protections with moderate fingerprint protection ` +
        `and selective third-party blocking (${result.thirdPartyBlocking.simulated}% blocked). ` +
        `This balances privacy with compatibility.`;
      break;
    case 'PERMISSIVE':
      summary = `PERMISSIVE mode enables ${modeEnabledFactors.length} core protections while allowing most third-party ` +
        `content (${100 - result.thirdPartyBlocking.simulated}% allowed). Prioritizes site compatibility over privacy.`;
      break;
  }

  // Generate privacy rationale
  const privacyRationale = topPrivacyFactors.length > 0
    ? `Privacy is ${mode === 'STRICT' ? 'maximized' : mode === 'BALANCED' ? 'balanced' : 'reduced'} ` +
      `primarily through ${topPrivacyFactors.map(f => f.name).join(', ')}.`
    : 'No significant privacy protections active.';

  // Generate breakage rationale
  const breakageRationale = topBreakageFactors.length > 0 && result.breakageRisk > 20
    ? `Breakage risk comes from ${topBreakageFactors.map(f => f.name).join(' and ')}, ` +
      `which may interfere with ${snapshot.requests.thirdPartyDomains.length} third-party dependencies.`
    : 'Low breakage risk as most site dependencies remain accessible.';

  return {
    mode,
    summary,
    topFactors: topPrivacyFactors,
    privacyRationale,
    breakageRationale,
  };
}

/**
 * Generate key differences between modes
 */
function generateKeyDifferences(
  factors: ProtectionFactor[],
  simulation: PolicySimulationOutput
): string[] {
  const differences: string[] = [];

  // Third-party blocking difference
  const strictBlock = simulation.strict.thirdPartyBlocking.simulated;
  const permissiveBlock = simulation.permissive.thirdPartyBlocking.simulated;
  if (strictBlock - permissiveBlock > 20) {
    differences.push(
      `Third-party blocking: STRICT blocks ${strictBlock}% vs PERMISSIVE ${permissiveBlock}% (${strictBlock - permissiveBlock}% difference)`
    );
  }

  // Fingerprint protection difference
  const strictFP = simulation.strict.fingerprintProtection.simulated;
  const permissiveFP = simulation.permissive.fingerprintProtection.simulated;
  if (strictFP - permissiveFP > 20) {
    differences.push(
      `Fingerprint protection: STRICT provides ${strictFP}% vs PERMISSIVE ${permissiveFP}%`
    );
  }

  // Breakage risk difference
  const strictBreakage = simulation.strict.breakageRisk;
  const permissiveBreakage = simulation.permissive.breakageRisk;
  if (strictBreakage - permissiveBreakage > 20) {
    differences.push(
      `Breakage risk: STRICT ${strictBreakage}% vs PERMISSIVE ${permissiveBreakage}%`
    );
  }

  // Identify which protections differ most
  const varyingProtections = factors.filter(f => 
    f.enabledInStrict !== f.enabledInPermissive
  );
  
  if (varyingProtections.length > 0) {
    const topVarying = varyingProtections
      .sort((a, b) => b.privacyImpact - a.privacyImpact)
      .slice(0, 2);
    differences.push(
      `Key protections that vary: ${topVarying.map(p => p.name).join(', ')}`
    );
  }

  if (differences.length === 0) {
    differences.push('All modes provide similar protection for this site.');
  }

  return differences;
}

/**
 * Analyze policy diffs and generate explanations
 * 
 * PURE FUNCTION - no side effects
 * Output is DISPLAY ONLY - does NOT affect enforcement
 */
export function analyzePolicyDiff(
  snapshot: TelemetrySnapshot,
  simulation: PolicySimulationOutput
): PolicyDiffExplanation {
  // Create all protection factors
  const allFactors = PROTECTION_DEFINITIONS.map(def => 
    createProtectionFactor(def, snapshot)
  );

  // Generate mode explanations
  const strict = generateModeExplanation('STRICT', simulation.strict, allFactors, snapshot);
  const balanced = generateModeExplanation('BALANCED', simulation.balanced, allFactors, snapshot);
  const permissive = generateModeExplanation('PERMISSIVE', simulation.permissive, allFactors, snapshot);

  // Generate key differences
  const keyDifferences = generateKeyDifferences(allFactors, simulation);

  return {
    strict,
    balanced,
    permissive,
    keyDifferences,
    allFactors,
    analyzedAt: Date.now(),
  };
}

/**
 * PolicyDiffAnalyzer class for stateless analysis
 * 
 * PURE and side-effect-free
 * Output is DISPLAY ONLY
 */
export class PolicyDiffAnalyzer {
  /**
   * Analyze policy diffs
   * PURE FUNCTION - no side effects
   */
  analyze(
    snapshot: TelemetrySnapshot,
    simulation: PolicySimulationOutput
  ): PolicyDiffExplanation {
    return analyzePolicyDiff(snapshot, simulation);
  }

  /**
   * Get all protection definitions
   */
  getProtectionDefinitions(): { name: string; category: string; description: string }[] {
    return PROTECTION_DEFINITIONS.map(d => ({
      name: d.name,
      category: d.category,
      description: d.description,
    }));
  }

  /**
   * Get explanation for a specific mode
   */
  getModeExplanation(
    mode: SimulationMode,
    snapshot: TelemetrySnapshot,
    simulation: PolicySimulationOutput
  ): ModeExplanation {
    const allFactors = PROTECTION_DEFINITIONS.map(def => 
      createProtectionFactor(def, snapshot)
    );

    switch (mode) {
      case 'STRICT':
        return generateModeExplanation('STRICT', simulation.strict, allFactors, snapshot);
      case 'BALANCED':
        return generateModeExplanation('BALANCED', simulation.balanced, allFactors, snapshot);
      case 'PERMISSIVE':
        return generateModeExplanation('PERMISSIVE', simulation.permissive, allFactors, snapshot);
    }
  }
}

// Singleton instance (stateless, safe to share)
let instance: PolicyDiffAnalyzer | null = null;

export function getPolicyDiffAnalyzer(): PolicyDiffAnalyzer {
  if (!instance) {
    instance = new PolicyDiffAnalyzer();
  }
  return instance;
}

export function resetPolicyDiffAnalyzer(): void {
  instance = null;
}


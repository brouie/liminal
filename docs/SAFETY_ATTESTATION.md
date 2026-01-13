# Liminal Phase 3 Safety Attestation

**Version:** 3.10.0  
**Generated:** Phase 3.10  
**Status:** ACTIVE

---

## Public Safety Attestation

This document provides a **PUBLIC ATTESTATION** of the safety guarantees for Liminal Phase 3.

### Executive Summary

**Phase 3 of Liminal is a SIMULATION and SIGNING-ONLY system.**

Phase 3 provides:
- ✅ Transaction simulation (dry-run)
- ✅ Scoped wallet signing (per-origin, per-context)
- ✅ Read-only RPC queries (blockhash, slot, version, health)
- ✅ Privacy-preserving transaction classification and risk scoring
- ✅ User intent & consent management
- ✅ Immutable audit receipts

**Phase 3 does NOT provide:**
- ❌ Transaction submission to any blockchain
- ❌ Private rail execution (ZK proofs, mixers, relayers)
- ❌ Funds movement of any kind
- ❌ Cryptographic operations that affect on-chain state
- ❌ RPC submission methods (sendTransaction, etc.)

---

## Formal Declarations

### 1. No Transaction Submission

**ATTESTATION:** Phase 3 does not submit transactions to any blockchain or network.

- All submission attempts are **HARD BLOCKED** by `TxSubmissionGate` (Phase 3.2)
- Submission is **DISABLED** by `ExecutionPolicy` (Phase 3.7)
- Submission invariants are **ENFORCED** at runtime (Phase 3.9)
- No RPC submission methods are reachable (Phase 3.4)

**Evidence:**
- Safety Report: `disabledCapabilities.submission = true`
- Invariant: `NO_SUBMISSION_WHEN_POLICY_LOCKED` (enforced)
- Policy: `ExecutionPolicy.allowSubmission = false` (locked)

### 2. No Private Rail Execution

**ATTESTATION:** Phase 3 does not execute private transaction rails.

- Private rail adapter is a **STUB ONLY** (`NullPrivateRailAdapter`, Phase 3.6)
- Private rail execution is **DISABLED** by `ExecutionPolicy` (Phase 3.7)
- Private rail invariants are **ENFORCED** at runtime (Phase 3.9)

**Evidence:**
- Safety Report: `disabledCapabilities.privateRailExecution = true`
- Invariant: `NO_PRIVATE_RAIL_WITHOUT_UNLOCK` (enforced)
- Policy: `ExecutionPolicy.allowPrivateRail = false` (locked)

### 3. No Funds Movement

**ATTESTATION:** Phase 3 does not move funds or execute financial transactions.

- Funds movement is **DISABLED** by `ExecutionPolicy` (Phase 3.7)
- Funds movement invariants are **ENFORCED** at runtime (Phase 3.9)
- Signing operations are **SCOPED** and **AUDITABLE** but do not cause fund movement

**Evidence:**
- Safety Report: `disabledCapabilities.fundsMovement = true`
- Invariant: `NO_FUNDS_MOVEMENT_PHASE_3` (enforced)
- Policy: `ExecutionPolicy.allowFundMovement = false` (locked)

### 4. Simulation & Signing Only

**ATTESTATION:** Phase 3 provides simulation and signing capabilities only.

**Simulation (Enabled):**
- Transaction dry-run execution
- Risk scoring and classification
- Strategy selection (preview only)
- RPC query simulation

**Signing (Enabled):**
- Scoped wallet signing (per-origin, per-context)
- Signature generation (for adapter layer only)
- Signing is **REVOCABLE** and **AUDITABLE**
- Signatures are **NOT SUBMITTED** (Phase 3.2 gate blocks submission)

**Evidence:**
- Safety Report: `enabledCapabilities.signing = true`
- Safety Report: `enabledCapabilities.dryRun = true`
- Safety Report: `disabledCapabilities.submission = true`

---

## Safety Mechanisms

### Policy Lock (Phase 3.7)

- `ExecutionPolicy` is **LOCKED** by default
- All dangerous flags default to `false`
- Policy unlocks require explicit reason + author (logged but not approved in Phase 3.7)
- Policy state is **AUDITED** and **IMMUTABLE** in receipts

### Formal Invariants (Phase 3.9)

Six formal invariants are **ENFORCED** at runtime:

1. `NO_SUBMISSION_WHEN_POLICY_LOCKED` - Blocks submission when policy is locked
2. `NO_FUNDS_MOVEMENT_PHASE_3` - Blocks funds movement in Phase 3
3. `NO_PRIVATE_RAIL_WITHOUT_UNLOCK` - Blocks private rail without unlock
4. `READ_ONLY_RPC_ONLY` - Enforces read-only RPC only
5. `NO_SUBMISSION_METHODS` - Blocks submission methods
6. `KILL_SWITCH_OVERRIDES_ALL` - Ensures kill-switch overrides all checks

**Invariant Violations:** Throw `InvariantViolationError` immediately (fail-fast)

### Emergency Kill-Switch (Phase 3.9)

- Global kill-switch can **IMMEDIATELY STOP** all operations
- Overrides **ALL** other checks
- Requires reason + author (auditable)
- Stops: transaction creation, submission, signing

### Phase Freeze (Phase 3.10)

- Phase 3 is **FROZEN** (read-only)
- Any attempt to modify execution paths **THROWS**
- Freeze status is **QUERYABLE** and **AUDITABLE**

---

## Safety Report

A machine-generated safety report is available for verification.

**Report Hash:** `[GENERATED AT RUNTIME]`

To verify:
1. Generate safety report: `getSafetyReportGenerator().generateReport()`
2. Compare report hash with attestation metadata
3. Verify report contents match this attestation

**Report Contents:**
- Enabled/disabled capabilities
- Policy state
- Invariant list + versions
- Kill-switch status
- RPC capabilities
- Safety snapshot

---

## Receipt Integration

All transaction receipts include:

- `phaseFrozen: true` - Phase 3 is frozen
- `safetyReportHash: string` - Hash of safety report
- `attestationVersion: "3.10.0"` - Attestation version
- `invariantVersion: number` - Invariant system version
- `invariantCheckPassed: boolean` - Whether invariants passed
- `killSwitchActive: boolean` - Whether kill-switch was active

Receipts provide **IMMUTABLE** audit trail of safety state at transaction time.

---

## Threat Model

See `docs/THREAT_MODEL.md` for detailed threat analysis.

**Key Points:**
- Phase 3 mitigates: submission bypass, funds movement, private rail bypass
- Residual risks: Main process compromise (catastrophic), local storage compromise
- Emergency procedures: Kill-switch activation, invariant violation handling

---

## Version History

| Version | Phase | Date | Changes |
|---------|-------|------|---------|
| 3.10.0 | 3.10 | 2024 | Initial attestation |

---

## Verification

This attestation can be verified by:

1. **Code Review:** Examine Phase 3 codebase
2. **Safety Report:** Generate and review machine-generated report
3. **Invariant Checks:** Verify all invariants pass
4. **Policy State:** Verify policy is locked with all flags `false`
5. **Test Suite:** Run all 647+ tests (all must pass)

---

## Contact

For questions about this attestation, review:
- `docs/THREAT_MODEL.md` - Threat model
- `src/main/modules/invariants/` - Invariant enforcement
- `src/main/modules/policy/` - Policy management
- `tests/` - Test suite

---

**NOTE:** This attestation is generated locally and stored with code. The safety report hash provides integrity verification. Any modification to Phase 3 execution paths after freeze will be detected.

**PHASE 3 IS FROZEN - NO MODIFICATIONS ALLOWED**


# Security Review B.1 - Enforcement Boundary Audit

**Review Date:** Phase 3.10  
**Scope:** READ-ONLY AUDIT. NO CODE CHANGES.  
**Purpose:** Identify bypass paths, order-of-check issues, missing invariant coverage

---

## Executive Summary

**Question: Is there ANY bypass to submission?**

**Answer: NO**

All submission paths are blocked by multiple layers:
1. **TxSubmissionGate** - Always returns `allowed: false`, hard-coded
2. **ExecutionPolicy** - `allowSubmission` flag is `false` and locked
3. **Invariants** - `NO_SUBMISSION_WHEN_POLICY_LOCKED` enforced at entry points
4. **Kill-Switch** - Overrides all checks (checked first)
5. **RPC Client** - Read-only methods only, submission methods throw

**No code path exists where submission can succeed without modifying the codebase.**

---

## Enforcement Boundary Analysis

| Module | Guard | What it Blocks | Bypass Risk | Notes |
|--------|-------|----------------|-------------|-------|
| **TxSubmissionGate** | `attemptSubmission()` | Transaction submission | **NONE** | Always returns `allowed: false` (hard-coded). Kills-witch checked first (line 120), invariant checked (line 121), policy checked (line 124), then ALWAYS returns false (line 152). Multiple explicit `sendTransaction()` methods throw `SubmissionBlockedError` (lines 231-291). |
| **TxSubmissionGate** | `sendTransaction()` | Direct submission API calls | **NONE** | Method signature exists but ALWAYS throws `SubmissionBlockedError` (line 231-236). No code path returns normally. |
| **ExecutionPolicyManager** | `checkSubmission()` | Policy-level submission check | **NONE** | Returns `allowed: false` because `allowSubmission` flag is `false` by default (line 30) and locked (line 45). `requestUnlock()` records attempt but doesn't unlock (lines 240-278). `requestFlagChange()` records but doesn't change flags (lines 291-329). |
| **ExecutionPolicyManager** | `enforceSubmission()` | Policy enforcement | **NONE** | Calls `checkSubmission()` which always returns `allowed: false`, then throws `PolicyViolationError` (lines 175-184). Never allows submission. |
| **InvariantManager** | `enforceKillSwitch()` | All operations when kill-switch active | **NONE** | Checked FIRST at all enforcement points. If active, throws `InvariantViolationError` immediately (lines 177-184). Overrides all other checks. |
| **InvariantManager** | `enforceInvariant(NO_SUBMISSION_WHEN_POLICY_LOCKED)` | Submission invariant | **NONE** | Checked at `TxSubmissionGate.attemptSubmission()` (line 121) and `TxPipeline.createTransaction()` (line 142). Verifies policy is locked AND submission is blocked (lines 262-276). Throws on violation. |
| **InvariantManager** | `enforceInvariant(NO_FUNDS_MOVEMENT_PHASE_3)` | Funds movement | **NONE** | Checked at `LiminalWalletAdapter.signTransaction()` (line 144). Verifies `allowFundMovement` is `false` (lines 281-294). Throws on violation. |
| **InvariantManager** | `enforceInvariant(NO_PRIVATE_RAIL_WITHOUT_UNLOCK)` | Private rail execution | **NONE** | Verifies policy is locked OR private rail is blocked (lines 299-314). NullPrivateRailAdapter always returns unavailable, so invariant always passes. |
| **PhaseFreeze** | `enforceFreeze()` | Phase modifications | **NOT ENFORCED** | ⚠️ **FINDING:** `PhaseFreeze.enforceFreeze()` exists (line 88) but is NOT called at any enforcement point. However, PhaseFreeze is informational only in Phase 3.10 - the actual freeze prevents future modifications, not runtime execution. Phase 3 is already locked by policy + invariants. |
| **LiminalWalletAdapter** | `signTransaction()` | Wallet signing boundary | **NONE** | Checks kill-switch first (line 143), then funds movement invariant (line 144). Signing is allowed but signatures are NOT submitted (Phase 3.2 gate blocks submission). Signing does NOT cause fund movement. |
| **ReadOnlySolanaRpcClient** | `makeRpcCall()` | RPC method calls | **NONE** | Only allows read-only methods (`getHealth`, `getLatestBlockhash`, `getSlot`, `getVersion`). No submission methods are exposed. If a submission method is called, it would fail at the gate level (no code path to call submission methods exists). |
| **NullPrivateRailAdapter** | `prepare()`, `estimate()`, `validate()` | Private rail execution | **NONE** | Always returns `available: false` (stub implementation). Checks policy first (line 117), then returns not available. No execution code exists. |
| **TxPipeline** | `createTransaction()` | Transaction creation entry point | **NONE** | Checks kill-switch first (line 141), then submission invariant (line 142). Blocks before transaction is even created. |
| **TxPipeline** | `attemptSubmission()` | Submission attempt | **NONE** | Delegates to `TxSubmissionGate.attemptSubmission()` which always returns false. Records attempt for audit. |

---

## Order-of-Check Analysis

### Submission Path (TxSubmissionGate.attemptSubmission)

**Check Order:**
1. ✅ **Kill-switch** (line 120) - **FIRST** (correct - overrides all)
2. ✅ **Submission invariant** (line 121) - **SECOND** (correct - fail-fast)
3. ✅ **Policy check** (line 124) - **THIRD** (correct - policy layer)
4. ✅ **Always returns false** (line 152) - **FINAL** (correct - hard guarantee)

**Assessment:** ✅ **CORRECT ORDER** - Kill-switch checked first (highest priority), then invariants, then policy. Multiple layers ensure defense-in-depth.

### Transaction Creation Path (TxPipeline.createTransaction)

**Check Order:**
1. ✅ **Kill-switch** (line 141) - **FIRST** (correct)
2. ✅ **Submission invariant** (line 142) - **SECOND** (correct)
3. ✅ **Transaction creation** (line 144) - **PROCEEDS** (correct - only simulation)

**Assessment:** ✅ **CORRECT ORDER** - Invariants checked before any transaction state is created.

### Wallet Signing Path (LiminalWalletAdapter.signTransaction)

**Check Order:**
1. ✅ **Kill-switch** (line 143) - **FIRST** (correct)
2. ✅ **Funds movement invariant** (line 144) - **SECOND** (correct)
3. ✅ **Signing proceeds** (correct - signing doesn't cause fund movement)

**Assessment:** ✅ **CORRECT ORDER** - Kill-switch and funds movement invariant checked before signing.

---

## Missing Invariant Coverage Analysis

### Coverage Gaps: NONE IDENTIFIED

**All critical paths are covered:**

1. ✅ **Submission** - Covered by:
   - `NO_SUBMISSION_WHEN_POLICY_LOCKED` (enforced at gate + pipeline entry)
   - `NO_SUBMISSION_METHODS` (structural check)
   - Policy: `allowSubmission = false`
   - Gate: Always returns false

2. ✅ **Funds Movement** - Covered by:
   - `NO_FUNDS_MOVEMENT_PHASE_3` (enforced at signing boundary)
   - Policy: `allowFundMovement = false`
   - Signing is scoped and auditable but doesn't move funds

3. ✅ **Private Rail** - Covered by:
   - `NO_PRIVATE_RAIL_WITHOUT_UNLOCK` (checked)
   - Policy: `allowPrivateRail = false`
   - NullPrivateRailAdapter always unavailable (stub)

4. ✅ **RPC Submission** - Covered by:
   - `READ_ONLY_RPC_ONLY` (checked)
   - ReadOnlySolanaRpcClient only exposes read methods
   - No submission methods reachable

---

## Bypass Path Analysis

### Potential Bypass Vectors: NONE IDENTIFIED

1. **Direct API Bypass:**
   - ❌ **Not Possible** - `TxSubmissionGate.sendTransaction()` and related methods ALWAYS throw
   - ❌ **Not Possible** - ReadOnlySolanaRpcClient doesn't expose submission methods

2. **Policy Bypass:**
   - ❌ **Not Possible** - Policy is locked by default, `requestUnlock()` doesn't unlock
   - ❌ **Not Possible** - Flags default to `false`, `requestFlagChange()` doesn't change flags

3. **Invariant Bypass:**
   - ❌ **Not Possible** - Invariants checked at all entry points
   - ❌ **Not Possible** - Kill-switch checked FIRST (overrides all)

4. **State Machine Bypass:**
   - ❌ **Not Possible** - State machine transitions don't bypass checks
   - ❌ **Not Possible** - `attemptSubmission()` always calls gate

5. **RPC Bypass:**
   - ❌ **Not Possible** - Only read-only methods exist
   - ❌ **Not Possible** - No code path to call submission methods

6. **Private Rail Bypass:**
   - ❌ **Not Possible** - NullPrivateRailAdapter is stub only
   - ❌ **Not Possible** - Policy blocks private rail

---

## Findings Summary

### Critical Findings: 0

### High Findings: 0

### Medium Findings: 1

1. **PhaseFreeze Not Enforced at Runtime**
   - **Severity:** Medium (informational)
   - **Location:** `PhaseFreeze.enforceFreeze()` exists but not called
   - **Impact:** PhaseFreeze is informational/documentation only in Phase 3.10
   - **Rationale:** Phase 3 is already locked by policy + invariants. PhaseFreeze is a declaration that Phase 3 is frozen, not a runtime enforcement mechanism (Phase 3.10 rules state Phase 3 is frozen, but freeze is not intended to block execution - it's a declaration).
   - **Recommendation:** None (by design - PhaseFreeze is a declaration, not a runtime block)

### Low Findings: 0

---

## Defense-in-Depth Analysis

**Layers of Protection:**

1. **Layer 1: Kill-Switch** (Highest Priority)
   - Checked FIRST at all enforcement points
   - Overrides ALL other checks
   - Throws immediately if active

2. **Layer 2: Invariants** (Fail-Fast)
   - Enforced at entry points
   - Multiple invariants cover different aspects
   - Throws on violation

3. **Layer 3: Policy** (Governance)
   - Locked by default
   - Flags default to `false`
   - Unlock attempts logged but not approved

4. **Layer 4: Gate** (Hard Block)
   - Always returns `allowed: false`
   - Multiple explicit throw points
   - No code path to success

5. **Layer 5: RPC Client** (Structural)
   - Only read-only methods exposed
   - No submission methods reachable

---

## Conclusion

**Is there ANY bypass to submission?**

**NO.**

All submission paths are blocked by multiple independent layers. No code path exists where submission can succeed without modifying the codebase. The defense-in-depth approach ensures that even if one layer fails, others will block submission.

**Is there ANY bypass to funds movement?**

**NO.**

Funds movement is blocked by:
- Policy: `allowFundMovement = false` (locked)
- Invariant: `NO_FUNDS_MOVEMENT_PHASE_3` (enforced at signing)
- Signing doesn't cause fund movement (signatures are not submitted)

**Is there ANY bypass to private rail execution?**

**NO.**

Private rail execution is blocked by:
- Policy: `allowPrivateRail = false` (locked)
- Invariant: `NO_PRIVATE_RAIL_WITHOUT_UNLOCK` (checked)
- NullPrivateRailAdapter is stub only (no execution code)

---

## Audit Trail

- **Reviewer:** Security Review B.1
- **Date:** Phase 3.10
- **Scope:** All enforcement boundaries
- **Method:** Code review, path analysis, bypass vector identification
- **Result:** NO BYPASSES IDENTIFIED


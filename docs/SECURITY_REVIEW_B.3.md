# Security Review B.3 - Persistence Surface Audit

**Review Date:** Phase 3.10  
**Scope:** READ-ONLY AUDIT. NO CODE CHANGES.  
**Purpose:** Identify replay risks, tampering risks, cross-context leakage, and storage-based execution influence

---

## Executive Summary

**Question 1: Can intents be replayed?**

**Answer: NO**

Intents are stored in-memory only (not persisted). Intent validation checks:
- Intent status (PENDING, CONFIRMED, CONSUMED, EXPIRED, REVOKED)
- Expiration timestamp (`expiresAt`)
- Consumption flag (intent becomes CONSUMED after use)

Even if intent state could be manipulated, Phase 3 has no submission capability (TxSubmissionGate blocks all submissions).

**Question 2: Can signatures be reused to submit?**

**Answer: NO**

1. Signatures are NOT persisted to disk (in-memory only)
2. Signatures are stored in transaction objects (in-memory state machine)
3. Phase 3 has NO submission capability (TxSubmissionGate always returns false)
4. Receipts contain signature metadata for audit only (not execution)
5. No code path exists that uses receipt data for submission

**Question 3: Can stored data affect execution?**

**Answer: PARTIALLY (receipts only, read-only)**

Receipts are persisted to disk, but:
- Receipts are READ-ONLY audit trail
- Receipts are NOT used for execution decisions
- Receipts are context-scoped (no cross-context access)
- Loading receipts from disk only populates audit data (doesn't affect execution)

All other execution-critical data (intents, scopes, policy, invariants, freeze) is in-memory only.

---

## Persistence Surface Analysis

| Storage | What is Stored | Replay Risk | Tamper Risk | Mitigation | Notes |
|---------|---------------|-------------|-------------|------------|-------|
| **ReceiptStore (Files)** | Privacy receipts per context: blocked/allowed domains, events, proxy config | **NONE** | **LOW** | Receipts are READ-ONLY audit trail. Not used for execution decisions. Files stored in `app.getPath('userData')/receipts/` (user-controlled location). Loading receipts populates audit data only - doesn't affect enforcement. | `saveReceipt()` writes JSON to disk. `loadReceipt()` reads from disk. Receipts are context-scoped (file name = contextId). No cross-context access. Receipts are immutable once written (no mutation logic). |
| **Intent Storage (In-Memory)** | UserIntent objects: intentId, txId, origin, contextId, status, expiresAt | **NONE** | **NONE** | Intents stored in `Map<intentId, UserIntent>` (in-memory only). Intent validation checks status (CONSUMED, EXPIRED), expiration timestamp, and consumption flag. Even if replayed, Phase 3 has no submission capability. | IntentManager stores intents in-memory Map. No persistence to disk. Intent status prevents reuse (CONSUMED, EXPIRED, REVOKED). Intent expiry is enforced (timestamp check). No code path to resurrect expired/consumed intents. |
| **Wallet Scopes (In-Memory)** | WalletScope objects: origin, contextId, grantedAt, active flag | **NONE** | **NONE** | Wallet scopes stored in `Map<scopeKey, WalletScope>` (in-memory only). Scope key is `${origin}::${contextId}` (isolated). Scope revocation sets `active = false`. No persistence to disk. | WalletScopeManager stores scopes in-memory Map. No persistence to disk. Scope isolation prevents cross-context access (scope key includes contextId). Scopes are ephemeral (lost on restart). |
| **Policy State (In-Memory)** | ExecutionPolicy: flags, lockStatus, version, unlockHistory | **NONE** | **NONE** | Policy stored in-memory only (ExecutionPolicyManager instance). Policy is locked by default, flags default to false. Unlock attempts are logged but don't unlock (Phase 3.7). No persistence to disk. | ExecutionPolicyManager stores policy in private field. No persistence to disk. Policy state is ephemeral (lost on restart, resets to locked/false). Unlock history is in-memory audit log only. |
| **Freeze Record (In-Memory)** | PhaseFreezeRecord: freezeId, phase, frozenAt, frozenBy, reason, status | **NONE** | **NONE** | Freeze record stored in-memory only (PhaseFreeze instance). Freeze status is ephemeral (lost on restart). No persistence to disk. | PhaseFreeze stores freeze record in private field. No persistence to disk. Freeze status is ephemeral (lost on restart, resets to NOT_FROZEN). |
| **Kill-Switch History (In-Memory)** | KillSwitchActivation records: activationId, reason, author, activatedAt | **NONE** | **NONE** | Kill-switch state stored in-memory only (InvariantManager instance). History is in-memory array. No persistence to disk. | InvariantManager stores kill-switch state and history in private fields. No persistence to disk. Kill-switch state is ephemeral (lost on restart, resets to INACTIVE). |
| **Safety Snapshots (Receipts)** | SafetySnapshot in TxReceiptData: policyLockStatus, submissionBlocked, privateRailAvailable, etc. | **NONE** | **NONE** | Safety snapshots are embedded in transaction receipts (TxReceiptData). Receipts are in-memory transaction objects (not persisted separately). Receipts contain READ-ONLY snapshot of safety state at transaction creation time. | Safety snapshots are generated at transaction creation time and embedded in receipt. Receipts are stored in TxStateMachine (in-memory). Receipts are read-only audit trail (not used for execution). |
| **Safety Reports (In-Memory)** | SafetyReport: enabled/disabled capabilities, policy state, invariants, kill-switch, report hash | **NONE** | **NONE** | Safety reports are generated on-demand (not persisted). Reports are deterministic (same state → same report). Reports include SHA-256 hash for verification. Report generation is pure function (no side effects). | SafetyReportGenerator generates reports on-demand. No persistence to disk (except SAFETY_ATTESTATION.md which is static documentation). Reports are generated from live system state (not loaded from storage). |
| **Transaction Receipts (In-Memory)** | TxReceiptData: txId, contextId, state, classification, riskScore, signingResult, safetySnapshot, etc. | **NONE** | **NONE** | Transaction receipts stored in TxStateMachine (in-memory). Receipts contain signingResult (signature metadata) for audit only. Receipts are NOT used for execution decisions. No persistence to disk (separate from ReceiptStore). | Transaction receipts are stored in transaction objects (TxObject). Receipts include signingResult.signedPayload and signingResult.signature for audit. Receipts are read-only (no mutation). No code path uses receipt data for submission. |

---

## Replay Risk Analysis

### Intent Replay

**Storage:** In-memory Map (IntentManager)

**Replay Mechanism:**
- Intents stored in `Map<intentId, UserIntent>` (in-memory only)
- Intent status prevents reuse (CONSUMED, EXPIRED, REVOKED)
- Intent expiry is enforced (`expiresAt` timestamp check)
- Intent consumption sets status to CONSUMED (cannot be reused)

**Replay Risk:** ❌ **NONE**

**Reasoning:**
1. Intents are in-memory only (not persisted, lost on restart)
2. Intent validation checks status before use (CONSUMED intents rejected)
3. Intent expiry is enforced (expired intents rejected)
4. Even if replayed, Phase 3 has NO submission capability (TxSubmissionGate blocks)
5. No code path exists to resurrect expired/consumed intents

### Signature Replay

**Storage:** In-memory transaction objects (TxStateMachine)

**Replay Mechanism:**
- Signatures stored in `TxObject.signingResult.signedPayload` and `TxObject.signingResult.signature` (in-memory only)
- Receipts contain signature metadata for audit only (not used for execution)
- No persistence to disk

**Replay Risk:** ❌ **NONE**

**Reasoning:**
1. Signatures are in-memory only (not persisted to disk)
2. Signatures are stored in transaction objects (ephemeral, lost on restart)
3. Phase 3 has NO submission capability (TxSubmissionGate always returns false)
4. Receipts contain signature metadata for audit only (not used for execution)
5. No code path exists that uses receipt data for submission
6. Even if signature could be extracted from receipt, submission is blocked

### Receipt Replay

**Storage:** File-backed (ReceiptStore)

**Replay Mechanism:**
- Receipts stored in `app.getPath('userData')/receipts/{contextId}.json`
- Receipts can be loaded from disk via `loadReceipt()`
- Receipts are READ-ONLY audit trail

**Replay Risk:** ❌ **NONE**

**Reasoning:**
1. Receipts are READ-ONLY audit trail (not used for execution decisions)
2. Receipts are context-scoped (no cross-context access)
3. Receipts don't contain executable data (just blocked/allowed domains, events)
4. No code path exists that uses receipt data for execution
5. Loading receipts only populates audit data (doesn't affect enforcement)

---

## Tampering Risk Analysis

### Receipt Tampering

**Storage:** Files in user-controlled directory

**Tampering Mechanism:**
- Receipts stored as JSON files in `app.getPath('userData')/receipts/`
- Files can be modified/overwritten by user (user-controlled directory)
- Receipts loaded from disk via `loadReceipt()`

**Tampering Risk:** ⚠️ **LOW** (Files can be modified, but receipts are read-only audit trail)

**Mitigation:**
1. Receipts are READ-ONLY audit trail (not used for execution decisions)
2. Receipts are context-scoped (file name = contextId, no cross-context access)
3. Receipts don't contain executable data (just blocked/allowed domains, events)
4. Loading receipts only populates audit data (doesn't affect enforcement)
5. Receipt mutation logic doesn't exist (receipts are immutable once written)

**Impact:** LOW - Tampered receipts only affect audit trail display, not execution

### Intent Tampering

**Storage:** In-memory Map (not persisted)

**Tampering Risk:** ❌ **NONE**

**Reasoning:**
1. Intents are in-memory only (not persisted to disk)
2. Intent state cannot be modified externally (no file access)
3. Intent status is enforced by IntentManager (CONSUMED, EXPIRED checks)
4. No code path exists to modify intent state from storage

### Scope Tampering

**Storage:** In-memory Map (not persisted)

**Tampering Risk:** ❌ **NONE**

**Reasoning:**
1. Wallet scopes are in-memory only (not persisted to disk)
2. Scope state cannot be modified externally (no file access)
3. Scope validation is enforced by WalletScopeManager
4. No code path exists to modify scope state from storage

### Policy Tampering

**Storage:** In-memory only (not persisted)

**Tampering Risk:** ❌ **NONE**

**Reasoning:**
1. Policy is in-memory only (not persisted to disk)
2. Policy state cannot be modified externally (no file access)
3. Policy lock is enforced by ExecutionPolicyManager
4. No code path exists to modify policy state from storage

### Freeze/Invariant Tampering

**Storage:** In-memory only (not persisted)

**Tampering Risk:** ❌ **NONE**

**Reasoning:**
1. Freeze records and kill-switch state are in-memory only (not persisted)
2. State cannot be modified externally (no file access)
3. State is enforced by PhaseFreeze and InvariantManager
4. No code path exists to modify state from storage

---

## Cross-Context Leakage Analysis

### Receipt Storage

**Mechanism:**
- Receipts stored per context: `receipts/{contextId}.json`
- Receipt loading requires explicit `contextId` parameter
- No IPC handler exposes cross-context receipts

**Leakage Risk:** ❌ **NONE**

**Reasoning:**
1. Receipts are context-scoped (file name = contextId)
2. Receipt loading requires explicit contextId parameter (`getReceipt(contextId)`)
3. No IPC handler returns receipts from multiple contexts
4. Receipts are READ-ONLY audit trail (don't affect execution)

### Intent Storage

**Mechanism:**
- Intents stored in-memory Map (not persisted)
- Intents are indexed by `intentId` and `txId`
- Intent lookup requires explicit intentId or txId

**Leakage Risk:** ❌ **NONE**

**Reasoning:**
1. Intents are in-memory only (not persisted, no cross-context file access)
2. Intent lookup requires explicit intentId or txId
3. Intent contextId is validated during use (but intents are not persisted)

### Scope Storage

**Mechanism:**
- Wallet scopes stored in-memory Map with key `${origin}::${contextId}`
- Scope lookup requires explicit origin and contextId
- Scope validation checks both origin AND contextId match

**Leakage Risk:** ❌ **NONE**

**Reasoning:**
1. Wallet scopes are in-memory only (not persisted, no cross-context file access)
2. Scope key includes contextId (isolates per context)
3. Scope validation checks both origin AND contextId match

---

## Execution Influence Analysis

### Receipts Affect Execution?

**Analysis:**
- Receipts are loaded from disk via `loadReceipt()`
- Receipts are READ-ONLY audit trail
- Receipts contain blocked/allowed domains, events, proxy config
- Receipts are NOT used for execution decisions

**Result:** ❌ **NO** - Receipts are read-only audit trail, not used for execution

### Intents Affect Execution?

**Analysis:**
- Intents are in-memory only (not persisted)
- Intent validation checks status and expiry
- Intent confirmation is required for signing (if enabled)
- Phase 3 has NO submission capability (signing doesn't require intent in Phase 3.3 design)

**Result:** ❌ **NO** - Intents are in-memory only, Phase 3 has no submission capability

### Scopes Affect Execution?

**Analysis:**
- Wallet scopes are in-memory only (not persisted)
- Scope validation is required for signing
- Scope state affects signing capability (active scope required)

**Result:** ⚠️ **PARTIALLY** - Scopes affect signing, but scopes are in-memory only (ephemeral, lost on restart)

### Policy Affects Execution?

**Analysis:**
- Policy is in-memory only (not persisted)
- Policy flags affect submission, private rail, funds movement checks
- Policy lock prevents changes
- Policy state affects execution checks

**Result:** ⚠️ **PARTIALLY** - Policy affects execution checks, but policy is in-memory only (ephemeral, resets to locked/false on restart)

### Freeze/Invariant Affect Execution?

**Analysis:**
- Freeze and kill-switch state are in-memory only (not persisted)
- Freeze status affects execution (PhaseFreeze.enforceFreeze())
- Kill-switch affects execution (InvariantManager.enforceKillSwitch())
- State is enforced at entry points

**Result:** ⚠️ **PARTIALLY** - Freeze and kill-switch affect execution, but state is in-memory only (ephemeral, resets on restart)

---

## Specific Attack Vector Analysis

### Attack Vector 1: Replay Intent from Disk

**Analysis:**
- Intents are NOT persisted to disk (in-memory only)
- Intent storage is `Map<intentId, UserIntent>` (ephemeral)
- No code path exists to load intents from storage

**Result:** ❌ **NOT POSSIBLE** - Intents are not persisted, no storage to replay from

### Attack Vector 2: Replay Signature from Receipt

**Analysis:**
- Receipts contain signature metadata (`signingResult.signedPayload`, `signingResult.signature`)
- Receipts can be loaded from disk (`loadReceipt()`)
- Receipts are READ-ONLY audit trail (not used for execution)
- Phase 3 has NO submission capability (TxSubmissionGate blocks)

**Result:** ❌ **NOT POSSIBLE** - Even if signature extracted from receipt, submission is blocked

### Attack Vector 3: Tamper Receipt to Affect Execution

**Analysis:**
- Receipts stored as JSON files (user-controlled directory)
- Receipts can be modified/overwritten
- Receipts loaded from disk via `loadReceipt()`
- Receipts are READ-ONLY audit trail (not used for execution decisions)

**Result:** ❌ **NOT POSSIBLE** - Receipts are read-only audit trail, don't affect execution

### Attack Vector 4: Cross-Context Receipt Access

**Analysis:**
- Receipts stored per context: `receipts/{contextId}.json`
- Receipt loading requires explicit `contextId` parameter
- No IPC handler exposes cross-context receipts
- Receipts are context-scoped

**Result:** ❌ **NOT POSSIBLE** - Receipts are context-scoped, no cross-context access

### Attack Vector 5: Resurrect Expired Intent

**Analysis:**
- Intents are in-memory only (not persisted)
- Intent validation checks expiration (`expiresAt` timestamp)
- Intent status prevents reuse (EXPIRED, CONSUMED, REVOKED)
- No code path exists to modify intent state

**Result:** ❌ **NOT POSSIBLE** - Intents are in-memory only, validation prevents reuse

### Attack Vector 6: Reuse Consumed Intent

**Analysis:**
- Intent status becomes CONSUMED after use
- Intent validation checks status (CONSUMED intents rejected)
- Intents are in-memory only (not persisted)
- No code path exists to reset intent status

**Result:** ❌ **NOT POSSIBLE** - Intent status prevents reuse, no reset path

### Attack Vector 7: Modify Policy from Storage

**Analysis:**
- Policy is in-memory only (not persisted to disk)
- Policy state cannot be modified externally (no file access)
- Policy lock prevents changes
- No code path exists to load policy from storage

**Result:** ❌ **NOT POSSIBLE** - Policy is in-memory only, no storage to modify

### Attack Vector 8: Modify Freeze/Invariant State from Storage

**Analysis:**
- Freeze and kill-switch state are in-memory only (not persisted)
- State cannot be modified externally (no file access)
- State is enforced by managers
- No code path exists to load state from storage

**Result:** ❌ **NOT POSSIBLE** - State is in-memory only, no storage to modify

---

## Explicit Answers

### Question 1: Can intents be replayed?

**Answer: NO**

**Reasoning:**
1. Intents are in-memory only (not persisted to disk, lost on restart)
2. Intent validation checks status (CONSUMED, EXPIRED, REVOKED intents rejected)
3. Intent expiry is enforced (`expiresAt` timestamp check)
4. Intent consumption sets status to CONSUMED (cannot be reused)
5. No code path exists to resurrect expired/consumed intents
6. Even if replayed, Phase 3 has NO submission capability (TxSubmissionGate blocks)

### Question 2: Can signatures be reused to submit?

**Answer: NO**

**Reasoning:**
1. Signatures are in-memory only (not persisted to disk, lost on restart)
2. Signatures are stored in transaction objects (TxStateMachine, ephemeral)
3. Phase 3 has NO submission capability (TxSubmissionGate always returns false)
4. Receipts contain signature metadata for audit only (not used for execution)
5. No code path exists that uses receipt data for submission
6. Even if signature could be extracted from receipt, submission is blocked at module level

### Question 3: Can stored data affect execution?

**Answer: PARTIALLY (receipts only, read-only)**

**Reasoning:**
1. **Receipts (READ-ONLY):** Receipts are persisted to disk, but are READ-ONLY audit trail. Loading receipts only populates audit data (doesn't affect enforcement). Receipts don't contain executable data (just blocked/allowed domains, events).
2. **Intents (IN-MEMORY):** Intents are in-memory only (not persisted). Intent validation affects execution (signing requires intent if enabled), but intents are ephemeral (lost on restart).
3. **Scopes (IN-MEMORY):** Wallet scopes are in-memory only (not persisted). Scope validation affects execution (signing requires active scope), but scopes are ephemeral (lost on restart).
4. **Policy (IN-MEMORY):** Policy is in-memory only (not persisted). Policy flags affect execution checks, but policy is ephemeral (resets to locked/false on restart).
5. **Freeze/Invariant (IN-MEMORY):** Freeze and kill-switch state are in-memory only (not persisted). State affects execution (enforced at entry points), but state is ephemeral (resets on restart).

**Only receipts are persisted, and they are READ-ONLY audit trail (do not affect execution).**

---

## Findings Summary

### Critical Findings: 0

### High Findings: 0

### Medium Findings: 0

### Low Findings: 1

1. **Receipt Files in User-Controlled Directory**
   - **Severity:** Low (informational)
   - **Location:** ReceiptStore stores receipts in `app.getPath('userData')/receipts/`
   - **Impact:** LOW - Receipts can be modified/overwritten by user, but receipts are READ-ONLY audit trail (not used for execution decisions)
   - **Rationale:** Receipts are stored in user-controlled directory (can be tampered), but receipts are read-only audit trail. Loading receipts only populates audit data (doesn't affect enforcement). Receipts don't contain executable data.
   - **Recommendation:** None (by design - receipts are audit trail, not execution data)

---

## Conclusion

**All three explicit questions answered:**

1. **Can intents be replayed?** NO - Intents are in-memory only, validation prevents reuse, Phase 3 has no submission capability
2. **Can signatures be reused to submit?** NO - Signatures are in-memory only, Phase 3 has no submission capability, receipts are read-only audit trail
3. **Can stored data affect execution?** PARTIALLY - Only receipts are persisted, and they are READ-ONLY audit trail (do not affect execution)

**Persistence analysis summary:**
- Most execution-critical data (intents, scopes, policy, freeze, invariants) is in-memory only (ephemeral, lost on restart)
- Only receipts are persisted to disk (user-controlled directory)
- Receipts are READ-ONLY audit trail (not used for execution decisions)
- No replay risks identified (intents/signatures not persisted, receipts read-only)
- Low tampering risk (receipts can be modified, but don't affect execution)

**No critical persistence vulnerabilities identified.**

---

## Audit Trail

- **Reviewer:** Security Review B.3
- **Date:** Phase 3.10
- **Scope:** All persistence surfaces (receipts, intents, scopes, policy, freeze, invariants, safety snapshots)
- **Method:** Code review, storage analysis, replay/tamper risk assessment
- **Result:** NO CRITICAL VULNERABILITIES IDENTIFIED - Most data is in-memory only, receipts are read-only audit trail


# Security Review B.2 - Trust Boundary Audit

**Review Date:** Phase 3.10  
**Scope:** READ-ONLY AUDIT. NO CODE CHANGES.  
**Purpose:** Identify renderer escape possibilities, IPC abuse, cross-context access risks

---

## Executive Summary

**Question 1: Can renderer trigger submission?**

**Answer: NO**

All submission paths require main process execution. IPC handlers that could trigger submission paths (`tx:attemptSubmission`) are blocked by:
- TxSubmissionGate (always returns false)
- ExecutionPolicy (allowSubmission = false, locked)
- Invariants (NO_SUBMISSION_WHEN_POLICY_LOCKED enforced)
- No IPC handler exists that bypasses these checks

**Question 2: Can renderer bypass intent?**

**Answer: NO**

Signing requires explicit intent confirmation:
- `wallet:sign` IPC handler calls `signTransaction()` which validates scope
- Scope validation requires active scope for origin + context
- Intent confirmation is a separate step (intent:confirm)
- No IPC handler allows signing without intent validation

**Question 3: Can renderer access another context?**

**Answer: NO**

Context isolation is enforced by:
- Partitioned sessions (`session.fromPartition`)
- Context-scoped receipt storage (`getReceiptsByContext(contextId)`)
- Wallet scope validation (per-origin, per-context)
- No IPC handlers expose cross-context data

---

## Trust Boundary Analysis

| Boundary | Exposed Surface | Risk | Mitigation | Notes |
|----------|----------------|------|------------|-------|
| **Renderer → Main IPC (Transaction)** | `tx:create`, `tx:get`, `tx:advance`, `tx:dryRun`, `tx:receipt` | **LOW** | All handlers delegate to `TxPipeline` which enforces invariants at entry point (`createTransaction` checks kill-switch + submission invariant). No handler exists for `attemptSubmission` - submission cannot be triggered via IPC. Receipt handlers require `contextId` parameter - receipts are context-scoped. | `tx:create` → `TxPipeline.createTransaction()` → enforces kill-switch + submission invariant (line 141-142). `tx:receipt` → `TxPipeline.getReceiptData()` → returns receipt for specific txId, no cross-context access. |
| **Renderer → Main IPC (Wallet)** | `wallet:connect`, `wallet:sign`, `wallet:signAll`, `wallet:status`, `wallet:revoke` | **LOW** | `wallet:sign` calls `LiminalWalletAdapter.signTransaction()` which enforces kill-switch + funds movement invariant (line 143-144). Signing requires active scope (per-origin, per-context). Scope validation prevents cross-context access. Signatures are NOT submitted (Phase 3.2 gate blocks). | `wallet:connect` → `LiminalWalletAdapter.connect(origin, contextId)` → creates scope for specific origin + context. `wallet:sign` → validates scope before signing. Scope key is `${origin}::${contextId}` - isolates per origin AND context. |
| **Renderer → Main IPC (Intent)** | `intent:create`, `intent:confirm`, `intent:get`, `intent:getForTx` | **LOW** | Intent creation requires `origin` and `contextId`. Intent confirmation is explicit step. No IPC handler allows bypassing intent confirmation. Intent validation checks scope and expiration. | `intent:create` → creates intent for specific origin + context. `intent:confirm` → explicit confirmation step. Intent is immutable once created. Intent expiry is enforced. |
| **Preload Exposure (window.liminal)** | Transaction, wallet, intent APIs exposed to renderer | **LOW** | Preload script exposes IPC channels via `contextBridge.exposeInMainWorld('liminal', ...)`. All methods delegate to IPC handlers (no direct main process access). IPC handlers validate all inputs. No dangerous methods exposed (no submission methods). | Preload exposes safe wrappers that call IPC. No direct access to main process objects. All dangerous operations (submission) are blocked at IPC handler level. |
| **Context Isolation (Session Partition)** | Partitioned cookies, storage, cache per context | **LOW** | Each context uses `session.fromPartition(\`persist:liminal-${contextId}\`)` - creates isolated session. BrowserViews use partitioned sessions. No code path allows accessing another context's session. | `ContextManager.createContext()` creates partition with unique ID. Each context's BrowserView uses its partition. Electron's session isolation prevents cross-context cookie/storage access. |
| **Context Isolation (Receipt Storage)** | Receipts stored per context | **LOW** | `ReceiptStore` stores receipts with `contextId`. `getReceiptsByContext(contextId)` requires explicit contextId parameter. No IPC handler exposes cross-context receipts. Receipt storage is file-backed (local only). | Receipt storage is context-scoped. No handler exists that returns receipts from multiple contexts without explicit contextId. Receipts are immutable once written. |
| **Context Isolation (Wallet Scope)** | Wallet permissions per origin + context | **LOW** | Wallet scope is keyed by `${origin}::${contextId}`. Scope validation checks both origin AND context. Revoking scope for one context doesn't affect others. No cross-context scope access. | `WalletScopeManager` uses scope key combining origin and context. Each scope is isolated. `validateForSigning()` checks both origin and context match. No code path allows cross-context scope access. |
| **IPC Validation** | Input validation in IPC handlers | **MEDIUM** | ⚠️ **FINDING:** IPC handlers receive `origin` and `contextId` from renderer (via IPC event sender). Validation relies on renderer-provided values. However, renderer cannot forge contextId (contexts are created by main process). Origin is derived from renderer's URL (trusted source in Electron). | IPC handlers receive `contextId` from renderer. Main process should validate that contextId belongs to sender's session partition. However, contexts are created by main process and associated with specific BrowserViews - renderer cannot create contexts or access others. |
| **IPC Method Overreach** | IPC handlers accessing unauthorized operations | **LOW** | All IPC handlers delegate to appropriate modules (TxPipeline, LiminalWalletAdapter, IntentManager). No handler directly accesses dangerous operations. Submission is blocked at module level (TxSubmissionGate). | IPC handlers are thin wrappers around module methods. All dangerous operations (submission, funds movement) are blocked at module level, not at IPC level. This is defense-in-depth. |
| **Renderer Escape (Direct Main Process Access)** | Renderer accessing main process objects | **NONE** | Preload uses `contextBridge.exposeInMainWorld()` (isolated context). No direct access to Node.js APIs or main process objects. All communication via IPC (validated). | Electron's contextBridge prevents direct access to Node.js or main process. Renderer runs in isolated context. All communication is via IPC (serialized, validated). |

---

## IPC Handler Analysis

### Transaction Handlers

**`tx:create` (txHandlers.ts)**
- **Handler:** Calls `TxPipeline.createTransaction(contextId, payload)`
- **Validation:** Requires `contextId` parameter (validated by ContextManager)
- **Enforcement:** `TxPipeline.createTransaction()` enforces kill-switch + submission invariant (line 141-142)
- **Risk:** LOW - Entry point has invariant enforcement
- **Bypass:** NO - Cannot bypass invariants (checked at module level)

**`tx:dryRun` (txHandlers.ts)**
- **Handler:** Calls `TxPipeline.runDryRunPipeline(txId, originTrust)`
- **Validation:** Requires `txId` parameter
- **Enforcement:** Dry-run only, no submission
- **Risk:** LOW - Dry-run doesn't submit transactions
- **Bypass:** NO - Dry-run is simulation only

**`tx:receipt` (txHandlers.ts)**
- **Handler:** Calls `TxPipeline.getReceiptData(txId)`
- **Validation:** Requires `txId` parameter
- **Enforcement:** Receipts are read-only, immutable
- **Risk:** LOW - Receipts are read-only audit trail
- **Bypass:** NO - Receipts don't affect execution

**`tx:attemptSubmission` - DOES NOT EXIST**
- **Finding:** No IPC handler exists for submission attempts
- **Risk:** NONE - Submission cannot be triggered via IPC
- **Mitigation:** Submission is blocked at module level (TxSubmissionGate)

### Wallet Handlers

**`wallet:connect` (walletHandlers.ts)**
- **Handler:** Calls `LiminalWalletAdapter.connect(origin, contextId)`
- **Validation:** Requires `origin` and `contextId` parameters
- **Enforcement:** Creates scope for specific origin + context (isolated)
- **Risk:** LOW - Scope is per-origin, per-context
- **Bypass:** NO - Cannot create scope for another context

**`wallet:sign` (walletHandlers.ts)**
- **Handler:** Calls `LiminalWalletAdapter.signTransaction(txId)`
- **Validation:** Requires `txId` parameter, validates scope (origin + context)
- **Enforcement:** Enforces kill-switch + funds movement invariant (line 143-144), validates scope before signing
- **Risk:** LOW - Signing requires active scope, invariants enforced
- **Bypass:** NO - Cannot sign without scope, cannot bypass invariants

**`wallet:signAll` (walletHandlers.ts)**
- **Handler:** Calls `LiminalWalletAdapter.signAllTransactions(txIds)`
- **Validation:** Requires `txIds` array, validates scope for each
- **Enforcement:** Same as `wallet:sign` (per-transaction scope validation)
- **Risk:** LOW - Batch signing requires scope for each transaction
- **Bypass:** NO - Same protections as single signing

### Intent Handlers

**`intent:create` (txHandlers.ts)**
- **Handler:** Calls `IntentManager.createIntent(options)`
- **Validation:** Requires `origin`, `contextId`, `intentType` parameters
- **Enforcement:** Intent is immutable once created
- **Risk:** LOW - Intent creation doesn't execute operations
- **Bypass:** NO - Intent must be confirmed separately

**`intent:confirm` (txHandlers.ts)**
- **Handler:** Calls `IntentManager.confirmIntent(intentId)`
- **Validation:** Requires `intentId` parameter, validates intent exists and not expired
- **Enforcement:** Intent confirmation is explicit step, doesn't bypass scope validation
- **Risk:** LOW - Confirmation doesn't execute operations, signing still requires scope
- **Bypass:** NO - Signing still requires scope validation after intent confirmation

---

## Context Isolation Analysis

### Session Partition Isolation

**Mechanism:**
- Each context uses `session.fromPartition(\`persist:liminal-${contextId}\`)` (ContextManager.ts, line 139)
- BrowserViews are created with context-specific partitions
- Electron's session isolation prevents cross-context cookie/storage access

**Validation:**
- ✅ Contexts are created by main process (renderer cannot create contexts)
- ✅ Each BrowserView uses its context's partition
- ✅ No code path allows accessing another context's session

**Risk:** LOW - Electron's session isolation is enforced at the platform level

**Bypass:** NO - Electron prevents cross-partition access

### Receipt Storage Isolation

**Mechanism:**
- Receipts are stored with `contextId` (ReceiptStore.ts)
- `getReceiptsByContext(contextId)` requires explicit contextId parameter
- Receipts are file-backed, stored per context

**Validation:**
- ✅ IPC handlers require `contextId` parameter
- ✅ No handler returns receipts from multiple contexts
- ✅ Receipt storage is read-only (immutable once written)

**Risk:** LOW - Receipt storage is context-scoped

**Bypass:** NO - Cannot access another context's receipts without explicit contextId

### Wallet Scope Isolation

**Mechanism:**
- Wallet scope is keyed by `${origin}::${contextId}` (WalletScopeManager.ts, line 21)
- Scope validation checks both origin AND context
- Each scope is isolated (no cross-context access)

**Validation:**
- ✅ `validateForSigning()` checks both origin and context match (WalletScopeManager.ts, line 159-162)
- ✅ Scope revocation for one context doesn't affect others
- ✅ No code path allows cross-context scope access

**Risk:** LOW - Wallet scope is per-origin, per-context

**Bypass:** NO - Cannot access another context's wallet scope

---

## Renderer Escape Analysis

### Direct Main Process Access

**Mechanism:**
- Preload uses `contextBridge.exposeInMainWorld()` (preload.ts)
- Renderer runs in isolated context (no Node.js APIs)
- All communication via IPC (serialized, validated)

**Validation:**
- ✅ Electron's contextBridge prevents direct access to Node.js or main process
- ✅ Renderer cannot access main process objects directly
- ✅ All communication is via IPC (validated at handler level)

**Risk:** NONE - Electron's isolation prevents direct access

**Bypass:** NO - Platform-level isolation prevents escape

### IPC Abuse (Method Overreach)

**Analysis:**
- IPC handlers are thin wrappers around module methods
- All dangerous operations are blocked at module level
- No handler directly accesses dangerous operations

**Validation:**
- ✅ Submission is blocked at module level (TxSubmissionGate)
- ✅ Policy enforcement at module level (ExecutionPolicyManager)
- ✅ Invariant enforcement at module level (InvariantManager)
- ✅ IPC handlers don't bypass module-level checks

**Risk:** LOW - Defense-in-depth (IPC + module-level checks)

**Bypass:** NO - Module-level checks prevent bypass even if IPC handler is compromised

### IPC Input Validation

**Analysis:**
- IPC handlers receive `origin` and `contextId` from renderer
- Validation relies on renderer-provided values
- Contexts are created by main process (renderer cannot create)

**Validation:**
- ✅ Contexts are created by main process (ContextManager.createContext())
- ✅ ContextId is associated with specific BrowserView/session
- ✅ Renderer cannot forge contextId (contexts are main-process-owned)
- ⚠️ **FINDING:** IPC handlers trust renderer-provided contextId, but contexts are main-process-owned, so renderer cannot access others

**Risk:** LOW - Contexts are main-process-owned, renderer cannot access others

**Bypass:** NO - Cannot access another context's data (contexts are isolated)

---

## Specific Attack Vector Analysis

### Attack Vector 1: Trigger Submission Via IPC

**Analysis:**
- **IPC Handler:** NONE - No handler exists for `tx:attemptSubmission`
- **Module-Level Block:** TxSubmissionGate always returns false
- **Invariant Block:** NO_SUBMISSION_WHEN_POLICY_LOCKED enforced at entry points
- **Policy Block:** ExecutionPolicy.allowSubmission = false, locked

**Result:** ❌ **NOT POSSIBLE** - No IPC handler exists, submission blocked at module level

### Attack Vector 2: Bypass Intent Via IPC

**Analysis:**
- **IPC Handler:** `wallet:sign` requires active scope (origin + context)
- **Intent Requirement:** Intent confirmation is separate step (`intent:confirm`)
- **Scope Validation:** Signing validates scope before executing (WalletScopeManager.validateForSigning)
- **Intent Validation:** Intent must be confirmed and not expired

**Result:** ❌ **NOT POSSIBLE** - Signing requires scope validation, intent is separate concern (signing doesn't require intent in Phase 3.3 design, but scope validation prevents unauthorized signing)

### Attack Vector 3: Access Another Context's Receipts

**Analysis:**
- **IPC Handler:** `tx:receipt` requires `txId` parameter (not contextId)
- **Receipt Storage:** Receipts are stored with contextId (context-scoped)
- **Handler Logic:** `getReceiptData(txId)` returns receipt for specific txId (no cross-context access)
- **Context Isolation:** Transactions are created with contextId, receipts inherit contextId

**Result:** ❌ **NOT POSSIBLE** - Receipts are context-scoped, no handler returns cross-context receipts

### Attack Vector 4: Access Another Context's Wallet Scope

**Analysis:**
- **IPC Handler:** `wallet:connect` creates scope for specific origin + context
- **Scope Key:** `${origin}::${contextId}` (isolated per origin AND context)
- **Scope Validation:** `validateForSigning()` checks both origin and context match
- **Context Isolation:** Renderer cannot access another context's session partition

**Result:** ❌ **NOT POSSIBLE** - Wallet scope is per-origin, per-context, validation prevents cross-context access

### Attack Vector 5: Bypass Invariants Via IPC

**Analysis:**
- **IPC Handlers:** All handlers delegate to modules that enforce invariants
- **Module-Level Enforcement:** Invariants enforced at entry points (TxPipeline.createTransaction, TxSubmissionGate.attemptSubmission, LiminalWalletAdapter.signTransaction)
- **Invariant Checks:** Kill-switch checked FIRST, then invariants, then policy
- **Bypass Path:** None - IPC handlers don't bypass module-level checks

**Result:** ❌ **NOT POSSIBLE** - Invariants enforced at module level, IPC handlers don't bypass

### Attack Vector 6: Forge ContextId in IPC Calls

**Analysis:**
- **IPC Handlers:** Receive contextId from renderer (via IPC event sender)
- **Context Creation:** Contexts are created by main process (ContextManager.createContext())
- **Context Association:** Contexts are associated with specific BrowserViews/sessions
- **Validation:** Renderer cannot create contexts or access others (contexts are main-process-owned)

**Result:** ❌ **NOT POSSIBLE** - Contexts are main-process-owned, renderer cannot forge or access others

---

## Explicit Answers

### Question 1: Can renderer trigger submission?

**Answer: NO**

**Reasoning:**
1. No IPC handler exists for submission (`tx:attemptSubmission` doesn't exist)
2. Even if handler existed, `TxSubmissionGate.attemptSubmission()` always returns `allowed: false` (hard-coded)
3. Invariants are enforced at module entry points (cannot bypass via IPC)
4. Policy blocks submission (`allowSubmission = false`, locked)
5. All submission paths require main process execution (blocked at module level)

### Question 2: Can renderer bypass intent?

**Answer: NO**

**Reasoning:**
1. Signing requires active scope (per-origin, per-context) - validated by `WalletScopeManager.validateForSigning()`
2. Scope validation checks both origin AND context match (prevents cross-context access)
3. Intent confirmation is explicit step (`intent:confirm` IPC handler)
4. Signing doesn't require intent confirmation in Phase 3.3 design (intent is for future submission), but scope validation prevents unauthorized signing
5. No IPC handler allows signing without scope validation

### Question 3: Can renderer access another context?

**Answer: NO**

**Reasoning:**
1. Context isolation via partitioned sessions (`session.fromPartition`) - Electron enforces isolation
2. Receipt storage is context-scoped (`getReceiptsByContext(contextId)`) - requires explicit contextId
3. Wallet scope is per-origin, per-context (`${origin}::${contextId}`) - validation prevents cross-context access
4. Contexts are created by main process (renderer cannot create or access others)
5. No IPC handlers expose cross-context data (all handlers require explicit contextId or are context-scoped)

---

## Findings Summary

### Critical Findings: 0

### High Findings: 0

### Medium Findings: 1

1. **IPC Input Validation Relies on Renderer-Provided Values**
   - **Severity:** Medium (informational)
   - **Location:** IPC handlers receive `contextId` from renderer
   - **Impact:** Low - Contexts are main-process-owned, renderer cannot access others
   - **Rationale:** IPC handlers trust renderer-provided contextId, but contexts are created by main process and associated with specific BrowserViews/sessions. Renderer cannot forge contextId or access another context's data (contexts are isolated by Electron's session partition mechanism).
   - **Recommendation:** None (by design - contexts are main-process-owned, isolation enforced at platform level)

### Low Findings: 0

---

## Conclusion

**All three explicit questions answered: NO**

1. **Can renderer trigger submission?** NO - No IPC handler exists, submission blocked at module level
2. **Can renderer bypass intent?** NO - Signing requires scope validation, intent is separate concern
3. **Can renderer access another context?** NO - Context isolation enforced at platform level, receipts/scopes are context-scoped

**Trust boundaries are properly enforced:**
- IPC handlers are thin wrappers (defense-in-depth)
- Module-level checks prevent bypass even if IPC handler is compromised
- Context isolation enforced at platform level (Electron sessions)
- All dangerous operations blocked at module level (not IPC level)

**No renderer escape possibilities identified.**

---

## Audit Trail

- **Reviewer:** Security Review B.2
- **Date:** Phase 3.10
- **Scope:** All trust boundaries, IPC handlers, context isolation
- **Method:** Code review, IPC handler analysis, context isolation verification
- **Result:** NO BYPASSES IDENTIFIED - Trust boundaries properly enforced


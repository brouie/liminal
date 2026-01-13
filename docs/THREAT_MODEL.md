# Liminal Threat Model

**Version:** 1.0  
**Last Updated:** Phase 3.9  
**Status:** ACTIVE

---

## Overview

This document describes the threat model for Liminal, a privacy-native browser execution environment. It identifies assets, adversaries, trust boundaries, and mitigations.

**PHASE 3.9 RULES:**
- NO transaction submission
- NO private rail execution
- NO funds movement
- Safety guarantees documented here

---

## Assets

### 1. Cryptographic Keys
- **Description:** Wallet private keys (future phase)
- **Current Status:** Simulated only (Phase 3.1)
- **Risk:** Theft, unauthorized access
- **Location:** Wallet adapter (scoped, per-origin)

### 2. User Intent & Consent
- **Description:** Explicit user consent records for signing/submission
- **Current Status:** Intent layer implemented (Phase 3.3)
- **Risk:** Bypass, replay attacks
- **Location:** IntentManager

### 3. Transaction Receipts
- **Description:** Immutable audit trail of all transactions
- **Current Status:** Receipts include policy, safety, invariant state
- **Risk:** Tampering, deletion
- **Location:** ReceiptStore (local file-backed)

### 4. Execution Policy
- **Description:** Policy flags controlling dangerous capabilities
- **Current Status:** Locked by default (Phase 3.7)
- **Risk:** Unauthorized unlocks, flag changes
- **Location:** ExecutionPolicyManager

### 5. Privacy Receipts
- **Description:** Privacy-related data per context/origin
- **Current Status:** Includes telemetry, AI classifications
- **Risk:** Privacy leakage
- **Location:** ReceiptStore

### 6. Context Isolation
- **Description:** Per-tab isolated sessions (cookies, storage)
- **Current Status:** Implemented (Phase 1)
- **Risk:** Cross-context leakage
- **Location:** ContextManager

---

## Adversaries

### 1. Malicious Website
- **Capabilities:**
  - JavaScript execution in renderer
  - Request interception attempts
  - Fingerprint attempts
- **Goals:**
  - Track user across contexts
  - Bypass privacy protections
  - Execute unauthorized transactions
- **Limitations:**
  - Cannot access main process directly
  - Cannot modify policy
  - Cannot access other contexts

### 2. Compromised RPC Endpoint
- **Capabilities:**
  - Network traffic observation
  - Request correlation
  - Metadata analysis
- **Goals:**
  - Link transactions to IP/user
  - Correlate requests across contexts
- **Limitations:**
  - Read-only RPC only (Phase 3.4)
  - Route separation (Phase 3.5)
  - Cannot submit transactions

### 3. Developer Mistakes
- **Capabilities:**
  - Code access
  - Accidental feature enablement
  - Policy bypass attempts
- **Goals:**
  - N/A (unintentional)
- **Limitations:**
  - Invariants enforce safety (Phase 3.9)
  - Policy locks prevent accidental changes
  - Kill-switch provides emergency stop

### 4. Compromised Main Process
- **Capabilities:**
  - Full system access (worst case)
  - Policy modification
  - Receipt tampering
- **Goals:**
  - Enable unauthorized features
  - Extract keys/receipts
- **Limitations:**
  - Main process compromise is catastrophic
  - Defensive measures:
    - Invariants fail-fast
    - Kill-switch can be activated
    - Receipts are immutable once written

---

## Trust Boundaries

### 1. Renderer → Main Process
- **Boundary:** IPC communication
- **Trust:** Main process validates all requests
- **Protection:** 
  - Request validation (Phase 1)
  - Policy enforcement (Phase 3.7)
  - Invariant checks (Phase 3.9)

### 2. Main Process → RPC Endpoints
- **Boundary:** Network requests
- **Trust:** RPC endpoints are untrusted
- **Protection:**
  - Read-only RPC only (Phase 3.4)
  - Route separation (Phase 3.5)
  - No transaction submission (Phase 3.2)

### 3. Main Process → Local Storage
- **Boundary:** File system
- **Trust:** Local storage is trusted
- **Protection:**
  - Receipts are immutable
  - Audit trail for policy changes
  - Local-only storage (no remote upload)

### 4. Context → Context
- **Boundary:** Session isolation
- **Trust:** Contexts are isolated
- **Protection:**
  - Partitioned cookies/storage (Phase 1)
  - Deterministic fingerprint protection (Phase 1.2)
  - Context state machine (Phase 1.1)

---

## Attack Vectors

### 1. Transaction Submission Bypass
- **Vector:** Attempt to submit transaction despite policy locks
- **Mitigation:**
  - Phase 3.2: TxSubmissionGate (HARD BLOCK)
  - Phase 3.7: ExecutionPolicy checks
  - Phase 3.9: Invariants enforce NO_SUBMISSION_WHEN_POLICY_LOCKED
- **Status:** MITIGATED

### 2. Funds Movement
- **Vector:** Attempt to move funds
- **Mitigation:**
  - Phase 3.7: ExecutionPolicy.allowFundMovement = false (locked)
  - Phase 3.9: Invariants enforce NO_FUNDS_MOVEMENT_PHASE_3
- **Status:** MITIGATED

### 3. Private Rail Execution Bypass
- **Vector:** Attempt to execute private rail without unlock
- **Mitigation:**
  - Phase 3.6: NullPrivateRailAdapter (stub only)
  - Phase 3.7: ExecutionPolicy.allowPrivateRail = false (locked)
  - Phase 3.9: Invariants enforce NO_PRIVATE_RAIL_WITHOUT_UNLOCK
- **Status:** MITIGATED

### 4. RPC Submission Methods
- **Vector:** Attempt to use RPC submission methods
- **Mitigation:**
  - Phase 3.4: ReadOnlySolanaRpcClient (only read methods)
  - Phase 3.9: Invariants enforce READ_ONLY_RPC_ONLY
- **Status:** MITIGATED

### 5. Policy Unlock Bypass
- **Vector:** Attempt to unlock policy without proper authorization
- **Mitigation:**
  - Phase 3.7: Policy locks require explicit unlock with reason/author
  - Phase 3.9: Invariants check policy lock status
  - Unlock attempts are audited
- **Status:** MITIGATED (Phase 3.7 never approves unlocks)

### 6. Kill-Switch Bypass
- **Vector:** Attempt to bypass kill-switch
- **Mitigation:**
  - Phase 3.9: Kill-switch checked at ALL enforcement points
  - Kill-switch overrides ALL other checks
- **Status:** MITIGATED

### 7. Cross-Context Tracking
- **Vector:** Track user across contexts
- **Mitigation:**
  - Phase 1: Partitioned sessions
  - Phase 1.2: Fingerprint protection
  - Phase 1.1: Context state machine
- **Status:** MITIGATED

---

## Mitigations by Phase

### Phase 1 (Foundation)
- Per-tab context isolation
- Request interception
- Proxy support per context
- Privacy receipts

### Phase 1.1 (State Machine)
- Explicit context states
- Valid transition enforcement

### Phase 1.2 (Privacy Hardening)
- Deterministic fingerprint protection
- Timing jitter
- Header minimization

### Phase 2.1-2.4 (AI Observation)
- Read-only AI agent
- Policy simulation (preview only)
- Audit trail for AI decisions

### Phase 3.0 (Transaction Skeleton)
- Dry-run only
- State machine for transactions

### Phase 3.1 (Wallet Adapter)
- Scoped signing only
- NO submission

### Phase 3.2 (Submission Gate)
- HARD BLOCK on submission
- Explicit rejection reasons

### Phase 3.3 (User Intent)
- Explicit consent layer
- Intent confirmation required

### Phase 3.4 (Read-Only RPC)
- Read-only RPC methods only
- Submission methods blocked

### Phase 3.5 (RPC Routing)
- Purpose-based endpoint separation
- Route rotation on identity change

### Phase 3.6 (Private Rail Interface)
- Stub adapter only
- NO execution

### Phase 3.7 (Policy Lock)
- Policy locks require explicit unlock
- All flags default to FALSE
- Audit trail for unlocks

### Phase 3.8 (Safety Guarantees)
- Transparency into system state
- Safety snapshots in receipts

### Phase 3.9 (Invariants & Kill-Switch)
- Formal invariants with runtime checks
- Emergency kill-switch
- Invariant enforcement at key boundaries

---

## Residual Risks

### 1. Main Process Compromise
- **Risk:** Full system compromise
- **Mitigation:** 
  - Invariants fail-fast
  - Kill-switch can be activated
  - Receipts are immutable
- **Acceptance:** Main process compromise is catastrophic - defensive measures only

### 2. Local Storage Compromise
- **Risk:** Receipt/policy tampering
- **Mitigation:**
  - Receipts are immutable once written
  - Policy changes are audited
- **Acceptance:** Local storage compromise requires OS-level access

### 3. Developer Error
- **Risk:** Accidental feature enablement
- **Mitigation:**
  - Invariants enforce safety
  - Policy locks prevent changes
  - Kill-switch provides emergency stop
- **Acceptance:** Defense-in-depth reduces risk

---

## Emergency Procedures

### Kill-Switch Activation
- **When:** Detected compromise, emergency stop needed
- **How:** `getInvariantManager().activateKillSwitch(reason, author)`
- **Effect:** Immediately disables signing, RPC, pipeline execution
- **Audit:** All activations are logged

### Invariant Violation
- **When:** Invariant check fails
- **Effect:** Throws InvariantViolationError, fails-fast
- **Audit:** Violation is recorded in receipt

---

## Document History

| Version | Phase | Date | Changes |
|---------|-------|------|---------|
| 1.0 | 3.9 | 2024 | Initial threat model |

---

**NOTE:** This threat model is deterministic and versioned. Changes must be reviewed and versioned. The model is stored locally with code for auditability.


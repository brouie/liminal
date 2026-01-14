# Liminal

A privacy-first browser execution environment with formally enforced safety guarantees.

---

## What Liminal Is

Liminal is a browser-based execution environment designed to reduce metadata leakage during web interaction and transaction preparation. It provides scoped signing, read-only blockchain access, and deterministic privacy controls without enabling fund movement.

**Capabilities:**

- Context-isolated execution
- Scoped, auditable signing
- Read-only Solana RPC access
- Deterministic privacy routing
- Formal safety enforcement

---

## Scope & Guarantees

Liminal is a privacy-first browser execution environment with scoped, auditable signing and read-only rails. Phase 3 remains frozen for safety; fund movement and private rails are disabled.

---

## Phase 3 Safety Guarantees

Phase 3 is formally frozen and enforced by multiple independent safety layers.

**Status:**

- Transaction submission: Disabled
- Funds movement: Disabled
- Private rail execution: Disabled
- Relayers: Disabled
- Signing: Enabled (scoped, auditable)
- RPC access: Read-only only

**Current Phase:** Phase 3.10 (Frozen)

Phase 3 is frozen as read-only. All guarantees are enforced at the code level through multiple independent protection layers.

---

## How Safety Is Enforced

Safety is enforced through defense-in-depth mechanisms that fail fast on violation.

**Protection Layers:**

- Hard-coded submission gate
- Locked execution policy
- Runtime invariants
- Global kill-switch
- Phase freeze with audit trail

These layers are independent and complementary. Even if one layer is bypassed, other layers will block the operation, ensuring no single point of failure.

---

## Audits & Verification

All guarantees are backed by machine-checkable invariants, internal security reviews, and immutable receipts.

**Security Reviews:**

- Security Review B.1: Submission Gate & Policy Enforcement
- Security Review B.2: Trust Boundaries (IPC, Preload, Context Isolation)
- Security Review B.3: Persistence Surface (Replay & Tampering)
- Security Review B.4: Regression & Upgrade Risk

**Final Status:** PASS - All guarantees verified

**Documentation:**

- Security: [`SECURITY.md`](SECURITY.md)
- Security Review (Option B): [`docs/SECURITY_REVIEW_B.FINAL.md`](docs/SECURITY_REVIEW_B.FINAL.md)
- Safety Attestation: [`docs/SAFETY_ATTESTATION.md`](docs/SAFETY_ATTESTATION.md)
- Threat Model: `docs/THREAT_MODEL.md`

---

## Current Status

Current phase: Phase 3.10 (Frozen)

Phase 3 is frozen as read-only. Any attempt to modify execution paths must throw. Phase 3 becomes immutable after Phase 3.10.

**Enabled Capabilities:**

- Signing (scoped, auditable)
- Read-only RPC (blockhash, slot, version, health)
- Dry-run transaction simulation
- Receipt generation (audit trail)

**Disabled Capabilities:**

- Transaction submission
- Private rail execution
- Funds movement
- Relayers
- ZK proofs

---

## Links

- Documentation: `README.md`
- Getting started: [`START_HERE.md`](START_HERE.md)
- GitHub: https://github.com/brouie/liminal
- Website: https://brouie.github.io/liminal/
- Security: [`SECURITY.md`](SECURITY.md)

## Downloads (v0.1.3)
- Windows (NSIS), macOS (DMG), Linux (AppImage): https://github.com/brouie/liminal/releases/tag/v0.1.3

---

## Binary Quickstart (v0.1.x)

- Download the platform build from the GitHub release (v0.1.3).
- Run the Liminal app:
  - Tabs are isolated (unique partitions), HTTPS-only navigation, `window.open` blocked.
  - Address bar + Go, Back/Forward/Reload; inline error messages for blocked/failed nav.
  - Status panel shows contextId/partition and safety flags (read-only).
- CLI remains available after `npm install` / `npm run build` (see CLI usage below).

---

## CLI Usage (v0.1.0)

### Install / Build
- Install dependencies: `npm install`
- Build: `npm run build` (outputs `dist/cli/liminal.js`)
- CLI entry (after build): `node dist/cli/liminal.js ...`
  - If installed globally via npm, `liminal` is available as a bin.

### Commands
- Submit: `liminal submit <tx.json>`
  - `tx.json` must include a string field `txId`.
- Status: `liminal status <txId>`
- Receipt: `liminal receipt <txId>`

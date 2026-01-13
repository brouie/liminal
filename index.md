---
layout: default
title: Liminal
---

## Liminal

A privacy-first browser execution environment with formally enforced safety guarantees.

Liminal isolates browsing, transactions, and signing into deterministic, auditable contexts.

Phase 3 is frozen: no transaction submission, no funds movement, no private execution.

---

## What Liminal Is

Liminal is a browser-based execution environment designed to reduce metadata leakage during web interaction and transaction preparation. It provides scoped signing, read-only blockchain access, and deterministic privacy controls without enabling fund movement.

- Context-isolated execution
- Scoped, auditable signing
- Read-only Solana RPC access
- Deterministic privacy routing
- Formal safety enforcement

---

## What Liminal Is Not

- Not a wallet
- Not a mixer
- Not a relayer
- Not a transaction broadcaster
- Not a custody solution

Liminal does not submit transactions, move funds, or execute private rails in Phase 3.

---

## Safety Guarantees (Phase 3)

Phase 3 is formally frozen and enforced by multiple independent safety layers.

- Transaction submission: Disabled
- Funds movement: Disabled
- Private rail execution: Disabled
- Relayers: Disabled
- Signing: Enabled (scoped, auditable)
- RPC access: Read-only only

---

## How Safety Is Enforced

Safety is enforced through defense-in-depth mechanisms that fail fast on violation.

- Hard-coded submission gate
- Locked execution policy
- Runtime invariants
- Global kill-switch
- Phase freeze with audit trail

---

## Audits & Verification

All guarantees are backed by machine-checkable invariants, internal security reviews, and immutable receipts.

- [Security Review (Option B)](https://github.com/brouie/liminal/blob/main/docs/SECURITY_REVIEW_B.FINAL.md)
- [Safety Attestation](https://github.com/brouie/liminal/blob/main/docs/SAFETY_ATTESTATION.md)
- [Threat Model](https://github.com/brouie/liminal/blob/main/docs/THREAT_MODEL.md)

---

## Current Status

Current phase: Phase 3.10 (Frozen)

---

## Documentation

- [README](https://github.com/brouie/liminal/blob/main/README.md)
- [Security Policy](https://github.com/brouie/liminal/blob/main/SECURITY.md)
- [GitHub Repository](https://github.com/brouie/liminal)

---

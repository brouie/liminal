# Frequently Asked Questions (FAQ)

**Phase 3.10 - Frozen**

This FAQ addresses common questions about Liminal. All answers reflect the current state (Phase 3.10, frozen).

---

## Is this a wallet?

**No.** Liminal is not a wallet.

Liminal is a privacy-first browser execution environment. It provides scoped signing capabilities (per-origin, per-context) but does not manage keys, store funds, or act as a wallet interface.

Liminal does not provide wallet features such as:
- Key management
- Balance display
- Transaction history
- Fund storage

---

## Can it send transactions?

**No.** Liminal cannot send transactions.

Transaction submission is disabled and hard-blocked by multiple independent protection layers:
- Hard-coded submission gate (always returns false)
- Locked execution policy (flags default to false)
- Runtime invariants (fail-fast on violation)
- Global kill-switch (checked first)

All submission attempts are blocked. No transactions are submitted to any blockchain in Phase 3.

---

## Can it move funds?

**No.** Liminal cannot move funds.

Funds movement is disabled and impossible in Phase 3. Even if signing is enabled (scoped, per-origin, per-context), signatures are not submitted. No fund movement occurs.

Liminal does not:
- Move funds
- Execute financial transactions
- Submit signed transactions
- Access funds

---

## What does "frozen" mean?

**"Frozen" means Phase 3 is read-only and will not change.**

Phase 3.10 is frozen:
- Phase 3 code is locked (read-only)
- Any attempt to modify execution paths will throw an error
- Phase 3 becomes immutable after Phase 3.10
- No code changes to Phase 3 execution paths are allowed

"Frozen" does not mean "temporary" or "pending change." It means Phase 3 is permanently locked in its current state.

---

## What is Option B vs Option A?

**Option B and Option A are documentation and development phases, not code phases.**

**Option B (Completed):**
- Security review and audit documentation
- Safety attestation and verification
- Threat model documentation
- Internal security reviews (B.1 through B.4)
- Final security review consolidation
- **Status:** Complete. Phase 3 code frozen.

**Option A (Current):**
- Public-facing documentation
- Website and GitHub Pages
- Architecture diagrams
- Public roadmap
- External-facing documentation
- **Status:** In progress. Documentation only, no code changes.

Both options are documentation-focused. Option B focused on security reviews and attestations. Option A focuses on public documentation and developer experience.

**Neither Option B nor Option A modifies Phase 3 code or enables execution.**

---

## What is Phase 3?

**Phase 3 is the current, frozen implementation of Liminal.**

Phase 3 provides:
- Context-isolated browser execution
- Scoped signing (signatures only, not submitted)
- Read-only Solana RPC access
- Transaction simulation (dry-run)
- Privacy hardening (fingerprint protection, header minimization)
- Safety guarantees (multiple protection layers)

Phase 3 does not provide:
- Transaction submission
- Funds movement
- Private rail execution
- Relayer execution

Phase 3 is frozen at Phase 3.10 and will not change.

---

## What is Phase 4?

**Phase 4 is not implemented and may never exist.**

Phase 4 represents potential future directions. It is speculative only:
- No Phase 4 code exists
- Phase 4 capabilities are not enabled
- Phase 4 has no timeline
- Phase 4 may never be implemented

Phase 4 is not guaranteed, not promised, and not under active development.

---

## Is Liminal safe to use?

**Phase 3 provides formal safety guarantees enforced at the code level.**

Safety is enforced through multiple independent protection layers:
- Hard-coded submission gate
- Locked execution policy
- Runtime invariants
- Global kill-switch
- Phase freeze

These guarantees are verified through security reviews and documented in:
- Safety Attestation (`docs/SAFETY_ATTESTATION.md`)
- Security Review (`docs/SECURITY_REVIEW_B.FINAL.md`)
- Threat Model (`docs/THREAT_MODEL.md`)

Phase 3 cannot submit transactions, move funds, or execute private rails.

---

## Can I contribute code?

**Phase 3 code is frozen and will not accept changes to execution paths.**

Phase 3 is read-only. Any attempt to modify execution paths will throw an error.

Documentation contributions (Option A scope) may be accepted, but execution code changes are not allowed.

---

## Notes

- All answers reflect Phase 3.10 (frozen) state
- No roadmap promises or timelines
- For detailed information, see `README.md` and `docs/`
- For security reporting, see `SECURITY.md`

---


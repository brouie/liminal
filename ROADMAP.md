# Liminal Roadmap

**Phase 3.10 - Frozen**

This roadmap describes the current state of Liminal and potential future directions. It explicitly separates what exists today (Phase 3, frozen) from what may exist in the future (Phase 4, not implemented).

---

## Phase 3 (Current State - Frozen)

**Status:** ✅ **Implemented and Frozen (Phase 3.10)**

Phase 3 is the current, frozen implementation of Liminal. It is read-only and provides the following capabilities:

### Enabled Capabilities

- **Context Isolation**: Per-tab isolated browser contexts with partitioned sessions
- **Request Interception**: Configurable request blocking per context
- **Proxy Routing**: Per-context proxy configuration and routing
- **Privacy Receipts**: Immutable audit trail of privacy events
- **Transaction Simulation**: Dry-run transaction classification, risk scoring, and strategy selection
- **Scoped Signing**: Per-origin, per-context transaction signing (signatures only, not submitted)
- **Read-Only RPC**: Read-only Solana RPC access (blockhash, slot, version, health)
- **RPC Privacy Routing**: Purpose-based endpoint selection and route rotation
- **AI Observation**: Read-only AI classification and explanation (no enforcement)
- **Privacy Hardening**: Fingerprint protection, timing jitter, header minimization
- **Safety Guarantees**: Multiple independent protection layers (gate, policy, invariants, kill-switch)

### Disabled Capabilities

- **Transaction Submission**: Hard-coded block (cannot submit transactions)
- **Funds Movement**: Disabled (no fund movement possible)
- **Private Rail Execution**: Disabled (no private execution paths)
- **Relayers**: Disabled (no relayer execution)
- **ZK Proofs**: Disabled (no zero-knowledge proof execution)

### Safety Enforcement

Phase 3 enforces its guarantees through multiple independent protection layers:

- **TxSubmissionGate**: Hard-coded block (always returns false)
- **ExecutionPolicy**: Locked by default (flags default to false)
- **InvariantManager**: Runtime checks (fail-fast on violation)
- **Kill-Switch**: Global override (checked first at all enforcement points)
- **PhaseFreeze**: Phase 3 is frozen as read-only (Phase 3.10)

### Phase 3 Scope

Phase 3 provides:
- Privacy-native browser execution environment
- Transaction simulation and analysis
- Scoped signing (signatures only)
- Read-only blockchain access
- Deterministic privacy controls

Phase 3 does not provide:
- Transaction submission
- Fund movement
- Private rail execution
- Relayer execution
- Any execution that affects on-chain state

**Phase 3 is frozen and will not change.**

---

## Phase 4 (Future - Not Implemented)

**Status:** ❌ **Not Implemented - Speculative Only**

Phase 4 represents potential future directions for Liminal. **Nothing in Phase 4 is implemented, and Phase 4 is not guaranteed to exist.**

### Phase 4 Scope (Speculative)

If Phase 4 were to exist, it might include capabilities such as:

- **Transaction Submission**: Potential ability to submit transactions to the blockchain
- **Private Rail Execution**: Potential execution of private transaction paths (ZK, mixers, relayers)
- **Fund Movement**: Potential ability to move funds through private rails
- **Relayer Execution**: Potential relayer-based transaction routing
- **ZK Proof Generation**: Potential zero-knowledge proof generation and verification

### Important Disclaimers

**Phase 4 is speculative and not implemented.**

- No Phase 4 code exists in the current codebase
- Phase 4 capabilities are not enabled or available
- Phase 4 may never be implemented
- Phase 4 would require explicit policy unlocks and code changes
- Phase 4 would require additional security reviews and attestations
- Phase 4 has no timeline, no dates, and no promises

### Phase 4 Prerequisites (Speculative)

If Phase 4 were to be considered in the future, it would require:

- Explicit policy unlocks (currently locked)
- Code changes to enable execution paths
- Additional security reviews and audits
- Updated threat model and attestations
- Formal safety guarantees for Phase 4 capabilities
- User consent mechanisms for Phase 4 operations

**None of these prerequisites have been met, and Phase 4 is not under active development.**

---

## Current Development Status

**Active Development:** Option A (Public-facing website, documentation, diagrams)

**Frozen:** Phase 3 (no execution code changes)

**Not Under Development:** Phase 4 (speculative only)

---

## Notes

- This roadmap is documentation only
- Phase 3 code is frozen and will not change
- Phase 4 is speculative and has no timeline
- No execution enablement is promised or implied
- For current capabilities, see `README.md`
- For safety guarantees, see `docs/SAFETY_ATTESTATION.md`
- For security reviews, see `docs/SECURITY_REVIEW_B.FINAL.md`

---


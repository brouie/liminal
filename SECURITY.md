# Security Policy

## Reporting Security Issues

Security issues should be reported through appropriate channels. Do not open public issues for security vulnerabilities.

**How to Report:**

1. Review existing security documentation:
   - Security Review (Option B): `docs/SECURITY_REVIEW_B.FINAL.md`
   - Safety Attestation: `docs/SAFETY_ATTESTATION.md`
   - Threat Model: `docs/THREAT_MODEL.md`

2. Determine if the issue is already documented or addressed in the security reviews.

3. Report through appropriate channels if the issue is not already documented.

## Security Reviews

Phase 3 has undergone comprehensive security audits:

- **Security Review B.1:** Submission Gate & Policy Enforcement
- **Security Review B.2:** Trust Boundaries (IPC, Preload, Context Isolation)
- **Security Review B.3:** Persistence Surface (Replay & Tampering)
- **Security Review B.4:** Regression & Upgrade Risk

All reviews passed with no critical, high, or medium findings. Low-severity findings are informational or by design.

**Review Status:** PASS - All guarantees verified

**Review Documents:** See `docs/SECURITY_REVIEW_B.*.md`

## Safety Guarantees

Phase 3 provides the following verified safety guarantees:

- Transaction submission: BLOCKED (hard-coded, multiple layers)
- Funds movement: BLOCKED (policy locked, invariants enforced)
- Private rail execution: BLOCKED (stub only, policy locked)
- Intent replay prevention: Verified (in-memory only, validation enforced)
- Signature reuse prevention: Verified (in-memory only, submission blocked)
- Cross-context isolation: Verified (Electron session partitions)

## Current Phase Status

**Phase 3.10:** FROZEN (Read-Only)

Phase 3 is frozen as read-only. The protection mechanisms are hard-coded and locked by default. Modifying protection mechanisms requires explicit code changes.

## References

- Security Review (Option B): `docs/SECURITY_REVIEW_B.FINAL.md`
- Safety Attestation: `docs/SAFETY_ATTESTATION.md`
- Threat Model: `docs/THREAT_MODEL.md`

---


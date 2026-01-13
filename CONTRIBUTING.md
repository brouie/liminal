# Contributing to Liminal

**Phase 3.10 - Frozen**

This document describes how to contribute to Liminal. Please read this carefully before submitting any contributions.

---

## Phase 3 Code is Frozen

**Phase 3 code is frozen and will not accept changes to execution paths.**

Phase 3.10 is frozen as read-only. Any attempt to modify execution paths will throw an error. Phase 3 becomes immutable after Phase 3.10.

**This means:**
- No code changes to Phase 3 execution paths are accepted
- No feature additions are accepted
- No refactors are accepted
- No "small" logic changes are accepted
- No bug fixes to execution code are accepted
- Phase 3 code is permanently locked

---

## What Contributions Are Accepted

**Only the following types of contributions are accepted:**

### 1. Documentation Fixes
- Corrections to existing documentation
- Clarifications to existing text
- Updates to documentation to reflect current state
- Fixes to documentation errors or inconsistencies

### 2. Typo Corrections
- Spelling corrections
- Grammar corrections
- Formatting improvements (markdown, structure)
- Broken link fixes

### 3. Diagram and Documentation Improvements
- Improvements to existing diagrams (clarity, accuracy)
- Documentation structure improvements
- Better explanations in existing documentation
- Additional examples in documentation (non-code)

**All contributions must be documentation-only and must not modify Phase 3 code.**

---

## What Contributions Are Not Accepted

**The following types of contributions are explicitly forbidden:**

### 1. Feature Additions
- New features or capabilities
- Enhancements to existing features
- New modules or components
- New functionality of any kind

### 2. Refactors
- Code restructuring
- Refactoring of existing code
- Code organization changes
- Architecture changes

### 3. "Small" Logic Changes
- Bug fixes to execution code
- Logic improvements
- Performance optimizations
- Code style changes
- Test improvements (unless documentation-related)

### 4. Execution Path Modifications
- Changes to transaction pipeline
- Changes to safety mechanisms
- Changes to policy enforcement
- Changes to invariants
- Changes to submission gate
- Any changes to execution code

**Any contribution that modifies Phase 3 code will be rejected.**

---

## How to Submit Documentation-Only Pull Requests

### 1. Check Your Contribution Type

Before submitting a pull request, verify that your contribution is:
- Documentation-only (no code changes)
- A documentation fix, typo correction, or documentation improvement
- Not a feature addition, refactor, or logic change

### 2. Create a Pull Request

1. Fork the repository
2. Create a branch for your documentation changes
3. Make your documentation changes only
4. Ensure no Phase 3 code files are modified
5. Submit a pull request with a clear title and description

### 3. Pull Request Title Format

Use the following format for pull request titles:
- `docs: Fix typo in README.md`
- `docs: Clarify frozen status in FAQ.md`
- `docs: Improve architecture diagram clarity`

### 4. Pull Request Description

Include the following in your pull request description:
- **Type:** Documentation fix / Typo correction / Documentation improvement
- **Files Changed:** List of documentation files modified
- **No Code Changes:** Explicitly state that no Phase 3 code files were modified
- **Description:** Brief description of the documentation change

### 5. Review Process

All pull requests will be reviewed to ensure:
- No Phase 3 code changes are included
- Documentation changes are appropriate
- Changes align with the frozen Phase 3 state
- Changes improve documentation clarity or accuracy

**Pull requests that include Phase 3 code changes will be rejected immediately.**

---

## Examples of Accepted Contributions

### ✅ Documentation Fix
```
docs: Fix typo in README.md
- Correct spelling of "guarantees" in Phase 3 section
- No code changes
```

### ✅ Typo Correction
```
docs: Fix grammar error in FAQ.md
- Correct "it's" to "its" in wallet question answer
- No code changes
```

### ✅ Documentation Improvement
```
docs: Clarify frozen status explanation
- Add explicit statement that frozen means permanent
- Improve clarity in ROADMAP.md
- No code changes
```

### ✅ Diagram Improvement
```
docs: Improve architecture diagram clarity
- Add missing component labels
- Improve diagram layout for better readability
- No code changes
```

---

## Examples of Rejected Contributions

### ❌ Feature Addition
```
feat: Add new privacy feature
- Adds new privacy protection module
- Includes code changes to src/main/modules/
```
**Rejected:** Includes code changes, feature addition.

### ❌ Bug Fix
```
fix: Fix transaction pipeline bug
- Fixes issue in TxPipeline.ts
- Includes code changes
```
**Rejected:** Includes code changes, bug fix to execution code.

### ❌ Refactor
```
refactor: Improve code organization
- Reorganizes module structure
- Includes code changes
```
**Rejected:** Includes code changes, refactor.

### ❌ "Small" Logic Change
```
chore: Improve error handling
- Small improvement to error messages
- Includes code changes
```
**Rejected:** Includes code changes, logic change.

### ❌ Documentation + Code
```
docs: Update README and add feature
- Updates README.md
- Adds new feature in src/main/modules/
```
**Rejected:** Includes code changes, even if documentation is updated.

---

## Enforcement

**All pull requests are automatically checked for Phase 3 code changes.**

If a pull request includes modifications to Phase 3 code files:
- The pull request will be rejected immediately
- The pull request will be closed without review
- No exceptions will be made

**Phase 3 code is frozen. No code changes are accepted, regardless of size, scope, or intent.**

---

## Questions

If you have questions about whether a contribution is acceptable:
1. Review this document carefully
2. Verify that your contribution is documentation-only
3. Ensure no Phase 3 code files are modified
4. If still uncertain, open an issue (not a pull request) to ask

**When in doubt, do not submit the contribution.**

---

## Notes

- Phase 3 code is frozen permanently
- Documentation contributions are welcome and appreciated
- All contributions must respect the frozen Phase 3 state
- For detailed information about Phase 3, see `README.md` and `docs/`
- For questions about Liminal, see `FAQ.md`

---


# START HERE

## What Liminal Is
- A privacy-first browser execution environment (Electron/Chromium) with context isolation, sandboxing, and scoped, auditable signing.
- Built-in submission pipeline and persistence; protocol/core remain frozen for safety.

## What Liminal Is Not
- Not a custody surface; not for fund movement or private rails (Phase 3 frozen).
- Not a general-purpose wallet; safety gates and invariants remain in place.

## Getting the App (v0.1.x)
- Download binaries from the GitHub release (v0.1.3): Windows (NSIS), macOS (DMG), Linux (AppImage).
- Requirements: modern OS, internet for HTTPS navigation. No extra permissions.

## Using the Browser UI
- Launch the app; each tab is an isolated context with its own partition.
- Navigation: HTTPS-only address bar with Go; Back/Forward/Reload buttons. Blocked or failed navigation shows inline errors.
- Safety surface: status bar shows contextId, partition, and kill-switch/policy snapshot (read-only).
- Submission controls: submit/status/receipt by txId via the existing public API; protocol is unchanged.

## CLI (optional)
- Install/build from source: `npm install`, `npm run build`, then `node dist/cli/liminal.js ...` (or `npm install -g .` for `liminal`).
- Commands: `liminal submit <tx.json>`, `liminal status <txId>`, `liminal receipt <txId>`.

## Notes
- Protocol, pipeline, invariants, and privacy logic remain unchanged in v0.1.3 (UI-only release).
- Persistence is stabilized for tests; release binaries run with default persistence paths per platform.

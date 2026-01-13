# Release Notes

## v0.1.3
- Prebuilt binaries via electron-builder: Windows (NSIS), macOS (DMG), Linux (AppImage); GitHub Actions builds on tag and publishes artifacts.
- Browser UX polish: dark theme, spacing, empty states, blocked-navigation messaging; app icon generation.
- Persistence stabilization retained; protocol/core unchanged.
- Docs: START_HERE.md, binary quickstart link from README; wording cleanup.

## v0.1.2
- Browser UX: tab strip, HTTPS-only address bar + Go, Back/Forward/Reload, inline load errors, status panel (contextId/partition/kill-switch/policy).
- Session persistence stabilization: deterministic tests with isolated paths; session restore for tabs/URLs; Tx persistence uses override path for tests.
- No protocol/core changes; UI-only release.

## v0.1.1
- Browser Execution Layer MVP (Electron) with HTTPS-only navigation and UI error surfacing.

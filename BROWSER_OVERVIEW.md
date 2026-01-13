# BROWSER OVERVIEW

## What Liminal Is
- A privacy-first browser execution environment: context-isolated browsing with scoped, auditable signing and deterministic privacy controls.
- The protocol, submission API, and CLI are supporting infrastructure; the product is the browser execution layer.
- Designed to minimize metadata leakage while keeping safety guarantees enforced by invariants and policy.

## What the Electron MVP Is (and Is Not)
- It is an execution shell that hosts web contexts with isolation (`contextIsolation`, `sandbox`, no `nodeIntegration`) and IPC bridges into the existing submission pipeline.
- It is not a wallet, not a mixer, and not a custody surface. Signing is scoped and auditable; submission follows the established pipeline.
- Tabs/contexts use unique partitions for isolation and enforce hardened navigation (HTTPS-only, `window.open` blocked).

## How the Pieces Fit
- Browser shell (Electron): user-facing execution environment with isolated contexts and minimal UI to create/list/close contexts and invoke submit/status/receipt.
- Protocol + pipeline + invariants: the safety and transaction lifecycle engine; unchanged by the browser shell.
- CLI: a thin user-facing surface for automation and testing; infrastructure, not the core product.

## Intended Use
- Load web content in isolated contexts, invoke the submission pipeline via the preload bridge, and observe status/receipts while preserving privacy posture.
- Keep navigation constrained to hardened rules; treat the shell as an execution environment, not as a key manager or fund mover.

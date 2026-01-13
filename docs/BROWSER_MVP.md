## Liminal Browser Execution Layer MVP (v0.1.0)

### Goal
Electron-based shell that opens context-isolated tabs and invokes the existing pipeline via IPC. No protocol changes.

### Architecture
- **Main (src/electron/main.ts)**: Creates one BrowserWindow, manages contexts (tabs) as BrowserViews with unique partitions. Exposes IPC for context lifecycle and submission API calls. Navigation hardened (blocks `window.open`, denies non-http/https `will-navigate`).
- **Preload (src/electron/preload.ts)**: Minimal bridge using `contextBridge`; exposes `createContext`, `closeContext`, `listContexts`, `submitTransaction`, `getTransactionStatus`, `getReceipt`.
- **Renderer (src/electron/renderer/...)**: Minimal UI with buttons to create/list/close contexts; displays current contexts.
- **Pipeline/API**: Uses existing Public Submission API and TxPipeline; no semantics changed.

### Context Isolation & Security
- BrowserWindow/BrowserView: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, unique `partition` per contextId.
- Navigation guards: `window.open` denied; `will-navigate` allows only http/https.

### Run Instructions
1) Install deps: `npm install`
2) Build: `npm run build`
3) Run MVP: `npm run dev:mvp`

### Testing submission flow (manual)
- Ensure a valid `txId` exists via your pipeline (CLI or programmatically).
- In renderer devtools console (View > Toggle DevTools), call:
  - `window.liminal.submitTransaction('<txId>')`
  - `window.liminal.getTransactionStatus('<txId>')`
  - `window.liminal.getReceipt('<txId>')`

### Notes
- No protocol, invariant, or policy changes.
- MVP wiring only; scoped signing UX to follow in next task.

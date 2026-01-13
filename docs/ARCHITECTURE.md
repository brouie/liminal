# Liminal Architecture & Safety Diagrams

**Phase 3.10 - Frozen**

This document provides architecture and safety diagrams for Liminal.

---

## High-Level Architecture

```mermaid
graph TB
    subgraph "Main Process (Electron)"
        IPC[IPC Handlers]
        CM[ContextManager<br/>Per-tab isolation]
        INT[Interceptor<br/>Request blocking]
        PM[ProxyManager<br/>Per-context routing]
        RS[ReceiptStore<br/>Audit trail]
        TXP[TxPipeline<br/>Transaction simulation]
        WS[WalletScopeManager<br/>Scoped permissions]
        WA[LiminalWalletAdapter<br/>Signing only]
        SG[TxSubmissionGate<br/>Always blocks]
        EP[ExecutionPolicyManager<br/>Locked by default]
        IM[InvariantManager<br/>Runtime checks]
        RC[ReadOnlySolanaRpcClient<br/>Read-only RPC]
    end
    
    subgraph "Renderer Process"
        UI[UI Layer]
        PRE[Preload Script<br/>window.liminal API]
    end
    
    subgraph "External"
        SOL[Solana RPC<br/>Read-only methods]
    end
    
    UI -->|IPC| IPC
    PRE -->|IPC| IPC
    IPC --> CM
    IPC --> INT
    IPC --> PM
    IPC --> RS
    IPC --> TXP
    IPC --> WA
    
    TXP --> SG
    TXP --> EP
    TXP --> IM
    TXP --> WA
    TXP --> RC
    TXP --> WS
    
    WA --> WS
    WA --> IM
    SG --> EP
    SG --> IM
    
    CM -->|Isolated sessions| INT
    CM -->|Partitioned storage| RS
    PM -->|Proxy config| INT
    
    RC -->|Read-only queries| SOL
```

**Key Components:**
- **ContextManager**: Creates isolated browser contexts (session partitions)
- **Interceptor**: Blocks and logs requests per context
- **ProxyManager**: Manages per-context proxy routing
- **ReceiptStore**: Stores privacy receipts (audit trail)
- **TxPipeline**: Orchestrates transaction simulation (dry-run only)
- **LiminalWalletAdapter**: Provides scoped signing (no submission)
- **TxSubmissionGate**: Hard-coded block (always returns false)
- **ExecutionPolicyManager**: Locked policy (flags default to false)
- **InvariantManager**: Runtime safety checks (fail-fast)
- **ReadOnlySolanaRpcClient**: Read-only RPC access (no submission methods)

---

## Safety Defense-in-Depth

```mermaid
graph TD
    START[Operation Request] --> KS{Kill-Switch}
    KS -->|Active| BLOCK1[Blocked: Kill-Switch]
    KS -->|Inactive| INV{Invariants}
    
    INV -->|Violation| BLOCK2[Blocked: Invariant Violation]
    INV -->|Pass| POLICY{ExecutionPolicy}
    
    POLICY -->|Locked/Disabled| BLOCK3[Blocked: Policy Lock]
    POLICY -->|Unlocked/Enabled| GATE{TxSubmissionGate}
    
    GATE -->|Always| BLOCK4[Blocked: Hard-Coded Gate]
    
    BLOCK1 --> END[Operation Rejected]
    BLOCK2 --> END
    BLOCK3 --> END
    BLOCK4 --> END
    
    style BLOCK1 fill:#ff6b6b
    style BLOCK2 fill:#ff6b6b
    style BLOCK3 fill:#ff6b6b
    style BLOCK4 fill:#ff6b6b
    style END fill:#ff6b6b
```

**Protection Layers:**

1. **Kill-Switch (Layer 1 - Global Override)**
   - Checked FIRST at all enforcement points
   - If active, blocks ALL operations immediately
   - Overrides all other checks
   - Location: `InvariantManager.enforceKillSwitch()`

2. **Invariants (Layer 2 - Runtime Checks)**
   - Enforced at module entry points
   - Fail-fast (throw on violation)
   - Checked BEFORE operations
   - Location: `InvariantManager.enforceInvariant()`

3. **ExecutionPolicy (Layer 3 - Policy Lock)**
   - Flags default to `false` (hard-coded)
   - Policy is `LOCKED` by default
   - Change attempts don't work (Phase 3.7)
   - Location: `ExecutionPolicyManager.checkSubmission()`

4. **TxSubmissionGate (Layer 4 - Hard-Coded Block)**
   - Always returns `allowed: false` (hard-coded)
   - Multiple explicit throw methods
   - Cannot be changed without code modification
   - Location: `TxSubmissionGate.attemptSubmission()`

5. **PhaseFreeze (Layer 5 - Declaration)**
   - Phase 3.10 is frozen (read-only)
   - Freeze status is queryable
   - Location: `PhaseFreeze.enforceFreeze()`

**Defense-in-Depth Principle:**
Even if one layer is bypassed, other layers will block the operation. No single point of failure.

---

## Transaction Flow (Phase 3 - Simulation Only)

```mermaid
sequenceDiagram
    participant UI as Renderer UI
    participant IPC as IPC Handlers
    participant TXP as TxPipeline
    participant SG as TxSubmissionGate
    participant EP as ExecutionPolicy
    participant IM as InvariantManager
    participant WA as WalletAdapter
    
    UI->>IPC: tx:create
    IPC->>TXP: createTransaction()
    TXP->>IM: enforceKillSwitch()
    TXP->>IM: enforceInvariant()
    IM-->>TXP: OK
    
    TXP->>TXP: classifyTransaction()
    TXP->>TXP: scoreRisk()
    TXP->>TXP: selectStrategy()
    TXP->>TXP: dryRun()
    
    UI->>IPC: wallet:sign
    IPC->>WA: signTransaction()
    WA->>IM: enforceKillSwitch()
    WA->>IM: enforceInvariant()
    IM-->>WA: OK
    WA->>WA: generateSignature()
    WA-->>IPC: Signature (not submitted)
    
    Note over TXP,SG: Submission attempt (if made)
    TXP->>SG: attemptSubmission()
    SG->>IM: enforceKillSwitch()
    SG->>IM: enforceInvariant()
    SG->>EP: checkSubmission()
    EP-->>SG: allowed: false (locked)
    SG-->>TXP: allowed: false (always)
    
    TXP-->>IPC: Simulation complete (no submission)
    IPC-->>UI: Receipt (audit trail)
```

**Key Points:**
- All operations go through safety layers
- Kill-switch checked FIRST
- Invariants checked BEFORE operations
- Policy checked at gate level
- Gate ALWAYS blocks (hard-coded)
- Signing produces signatures but does NOT submit
- Receipts are audit trail only (not execution data)

---

## Context Isolation

```mermaid
graph LR
    subgraph "Context 1"
        S1[Session Partition 1]
        C1[Cookies/Storage 1]
        R1[Receipt 1]
        W1[Wallet Scopes 1]
    end
    
    subgraph "Context 2"
        S2[Session Partition 2]
        C2[Cookies/Storage 2]
        R2[Receipt 2]
        W2[Wallet Scopes 2]
    end
    
    subgraph "Context N"
        SN[Session Partition N]
        CN[Cookies/Storage N]
        RN[Receipt N]
        WN[Wallet Scopes N]
    end
    
    S1 -.->|Isolated| C1
    S1 -.->|Isolated| R1
    S1 -.->|Isolated| W1
    
    S2 -.->|Isolated| C2
    S2 -.->|Isolated| R2
    S2 -.->|Isolated| W2
    
    SN -.->|Isolated| CN
    SN -.->|Isolated| RN
    SN -.->|Isolated| WN
    
    C1 -.->|No cross-access| C2
    R1 -.->|No cross-access| R2
    W1 -.->|No cross-access| W2
```

**Isolation Mechanisms:**
- Electron session partitions (`session.fromPartition`)
- Context-scoped data storage
- Per-context proxy routing
- Per-origin, per-context wallet scopes
- No cross-context data access

---

## Notes

- All diagrams represent Phase 3.10 (Frozen)
- No code execution is modified by these diagrams
- Diagrams are documentation only
- For implementation details, see source code in `src/main/modules/`


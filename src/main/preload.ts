/**
 * Preload Script
 * 
 * Exposes secure IPC channels to the renderer process.
 * 
 * Phase 1: Privacy execution runtime
 * Phase 2: AI observation layer (READ-ONLY)
 * Phase 2.2: Policy simulation (PREVIEW ONLY)
 * Phase 3.0: Transaction pipeline (DRY-RUN ONLY)
 * Phase 3.1: Wallet adapter (SIGNING ONLY)
 * 
 * NO real Solana RPC calls, NO sendTransaction, NO actual execution.
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { IPC_CHANNELS, ProxyConfig, ContextId, BrowserContext, PrivacyReceipt, Tab } from '../shared/types';
import { 
  AI_IPC_CHANNELS, 
  TelemetrySnapshot, 
  AIClassification,
  AIClassificationWithSimulation,
  PolicySimulationOutput,
  PolicyDiffExplanation,
  AIDecisionTrace,
  StoredTrace,
  SimulationMode,
  SimulationResult,
} from '../shared/ai-types';
import {
  TX_IPC_CHANNELS,
  TxObject,
  SimulatedTxPayload,
  TxReceiptData,
  WalletConnectionResult,
  WalletScope,
  SigningResult,
} from '../shared/tx-types';

// Type definitions for the exposed API
interface LiminalAPI {
  // Context management
  context: {
    create: (proxyConfig?: ProxyConfig) => Promise<BrowserContext>;
    destroy: (contextId: ContextId) => Promise<boolean>;
    rotate: (contextId: ContextId, newProxy?: ProxyConfig) => Promise<BrowserContext | null>;
    get: (contextId: ContextId) => Promise<BrowserContext | undefined>;
    list: () => Promise<BrowserContext[]>;
  };
  
  // Proxy management
  proxy: {
    set: (contextId: ContextId, config: ProxyConfig) => Promise<{ success: boolean; error?: string }>;
    get: (contextId: ContextId) => Promise<ProxyConfig | undefined>;
  };
  
  // Receipt management
  receipt: {
    get: (contextId: ContextId) => Promise<PrivacyReceipt | undefined>;
    subscribe: (contextId: ContextId) => void;
    onUpdate: (callback: (receipt: PrivacyReceipt) => void) => () => void;
  };
  
  // Tab management
  tab: {
    create: (url?: string) => Promise<Tab | null>;
    close: (tabId: number) => Promise<boolean>;
    navigate: (tabId: number, url: string) => Promise<boolean>;
    onUpdate: (callback: (tab: Tab) => void) => () => void;
  };
  
  // Navigation
  nav: {
    back: (tabId: number) => Promise<boolean>;
    forward: (tabId: number) => Promise<boolean>;
    reload: (tabId: number) => Promise<boolean>;
  };

  // ========== Phase 2: AI Privacy Agent (READ-ONLY) ==========
  ai: {
    /**
     * Get telemetry snapshot for a context
     * READ-ONLY - does not affect enforcement
     */
    getTelemetry: (contextId: ContextId) => Promise<TelemetrySnapshot | null>;
    
    /**
     * Get AI classification for a context
     * READ-ONLY - output is DISPLAY ONLY
     */
    classify: (contextId: ContextId, forceRefresh?: boolean) => Promise<AIClassification | null>;
    
    /**
     * Subscribe to classification updates
     */
    subscribe: (contextId: ContextId) => void;
    
    /**
     * Listen for classification updates
     */
    onClassification: (callback: (classification: AIClassification) => void) => () => void;
    
    /**
     * Get available classifiers
     */
    getClassifiers: () => Promise<{ name: string; type: string; available: boolean }[]>;

    // ========== Phase 2.2: Policy Simulation (PREVIEW ONLY) ==========
    
    /**
     * Get AI classification with policy simulation preview
     * READ-ONLY - simulation does NOT affect enforcement
     */
    classifyWithSimulation: (contextId: ContextId, forceRefresh?: boolean) => Promise<AIClassificationWithSimulation | null>;
    
    /**
     * Simulate a single policy mode
     * PURE FUNCTION - no side effects
     * Output is PREVIEW ONLY
     */
    simulateMode: (contextId: ContextId, mode: SimulationMode) => Promise<SimulationResult | null>;
    
    /**
     * Simulate all policy modes
     * PURE FUNCTION - no side effects
     * Output is PREVIEW ONLY
     */
    simulateAll: (contextId: ContextId) => Promise<PolicySimulationOutput | null>;

    // ========== Phase 2.4: AI Audit & Trace (READ-ONLY) ==========
    
    /**
     * Get most recent trace for a context
     * READ-ONLY - for audit purposes
     */
    getTrace: (contextId: ContextId, traceId?: string) => Promise<StoredTrace | null>;
    
    /**
     * List all traces for a context
     * READ-ONLY - for audit purposes
     */
    listTraces: (contextId: ContextId) => Promise<StoredTrace[]>;
    
    /**
     * Export trace as JSON string
     * Manual export only - local only
     */
    exportTrace: (contextId: ContextId, traceId: string) => Promise<string | null>;
  };

  // ========== Phase 3.0: Transaction Pipeline (DRY-RUN ONLY) ==========
  tx: {
    /**
     * Create a new simulated transaction
     * DRY-RUN ONLY - no real execution
     */
    create: (contextId: ContextId, payload: SimulatedTxPayload) => Promise<{ success: boolean; data?: TxObject; error?: string }>;
    
    /**
     * Get transaction by ID
     */
    get: (txId: string) => Promise<{ success: boolean; data?: TxObject; error?: string }>;
    
    /**
     * Run full dry-run pipeline
     * SIMULATION ONLY - no real Solana RPC calls
     */
    dryRun: (txId: string, originTrust?: number) => Promise<{ success: boolean; data?: TxObject; error?: string }>;
    
    /**
     * Abort a transaction
     */
    abort: (txId: string, reason: string) => Promise<{ success: boolean; data?: TxObject; error?: string }>;
    
    /**
     * Get transaction receipt data
     * For display in privacy receipt
     */
    getReceipt: (txId: string) => Promise<{ success: boolean; data?: TxReceiptData; error?: string }>;
  };

  // ========== Phase 3.1: Wallet Adapter (SIGNING ONLY) ==========
  wallet: {
    /**
     * Connect wallet for scope
     * Scoped per-origin AND per-context
     */
    connect: (origin: string, contextId: ContextId) => Promise<{ success: boolean; data?: WalletConnectionResult; error?: string }>;
    
    /**
     * Disconnect wallet for scope
     */
    disconnect: (origin: string, contextId: ContextId) => Promise<{ success: boolean; error?: string }>;
    
    /**
     * Sign single transaction
     * SIGNING ONLY - NO submission
     */
    sign: (txId: string) => Promise<{ success: boolean; data?: TxObject; error?: string }>;
    
    /**
     * Sign multiple transactions
     * SIGNING ONLY - NO submission
     */
    signAll: (txIds: string[]) => Promise<{ success: boolean; data?: SigningResult[]; error?: string }>;
    
    /**
     * Get wallet connection status
     */
    status: (origin: string, contextId: ContextId) => Promise<{ success: boolean; data?: { connected: boolean; scope?: WalletScope }; error?: string }>;
    
    /**
     * Revoke wallet scope
     */
    revoke: (target: { origin?: string; contextId?: ContextId }) => Promise<{ success: boolean; error?: string }>;
  };
}

const liminalAPI: LiminalAPI = {
  context: {
    create: (proxyConfig?: ProxyConfig) => 
      ipcRenderer.invoke(IPC_CHANNELS.CONTEXT_CREATE, proxyConfig),
    destroy: (contextId: ContextId) => 
      ipcRenderer.invoke(IPC_CHANNELS.CONTEXT_DESTROY, contextId),
    rotate: (contextId: ContextId, newProxy?: ProxyConfig) => 
      ipcRenderer.invoke(IPC_CHANNELS.CONTEXT_ROTATE, contextId, newProxy),
    get: (contextId: ContextId) => 
      ipcRenderer.invoke(IPC_CHANNELS.CONTEXT_GET, contextId),
    list: () => 
      ipcRenderer.invoke(IPC_CHANNELS.CONTEXT_LIST),
  },

  proxy: {
    set: (contextId: ContextId, config: ProxyConfig) => 
      ipcRenderer.invoke(IPC_CHANNELS.PROXY_SET, contextId, config),
    get: (contextId: ContextId) => 
      ipcRenderer.invoke(IPC_CHANNELS.PROXY_GET, contextId),
  },

  receipt: {
    get: (contextId: ContextId) => 
      ipcRenderer.invoke(IPC_CHANNELS.RECEIPT_GET, contextId),
    subscribe: (contextId: ContextId) => 
      ipcRenderer.send(IPC_CHANNELS.RECEIPT_SUBSCRIBE, contextId),
    onUpdate: (callback: (receipt: PrivacyReceipt) => void) => {
      const handler = (_event: IpcRendererEvent, receipt: PrivacyReceipt) => callback(receipt);
      ipcRenderer.on(IPC_CHANNELS.RECEIPT_UPDATE, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.RECEIPT_UPDATE, handler);
    },
  },

  tab: {
    create: (url?: string) => 
      ipcRenderer.invoke(IPC_CHANNELS.TAB_CREATE, url),
    close: (tabId: number) => 
      ipcRenderer.invoke(IPC_CHANNELS.TAB_CLOSE, tabId),
    navigate: (tabId: number, url: string) => 
      ipcRenderer.invoke(IPC_CHANNELS.TAB_NAVIGATE, tabId, url),
    onUpdate: (callback: (tab: Tab) => void) => {
      const handler = (_event: IpcRendererEvent, tab: Tab) => callback(tab);
      ipcRenderer.on(IPC_CHANNELS.TAB_UPDATE, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TAB_UPDATE, handler);
    },
  },

  nav: {
    back: (tabId: number) => 
      ipcRenderer.invoke(IPC_CHANNELS.NAV_BACK, tabId),
    forward: (tabId: number) => 
      ipcRenderer.invoke(IPC_CHANNELS.NAV_FORWARD, tabId),
    reload: (tabId: number) => 
      ipcRenderer.invoke(IPC_CHANNELS.NAV_RELOAD, tabId),
  },

  // ========== Phase 2: AI Privacy Agent (READ-ONLY) ==========
  ai: {
    getTelemetry: (contextId: ContextId) =>
      ipcRenderer.invoke(AI_IPC_CHANNELS.TELEMETRY_GET, contextId),
    
    classify: (contextId: ContextId, forceRefresh?: boolean) =>
      ipcRenderer.invoke(AI_IPC_CHANNELS.CLASSIFY, contextId, forceRefresh),
    
    subscribe: (contextId: ContextId) =>
      ipcRenderer.send(AI_IPC_CHANNELS.CLASSIFICATION_SUBSCRIBE, contextId),
    
    onClassification: (callback: (classification: AIClassification) => void) => {
      const handler = (_event: IpcRendererEvent, classification: AIClassification) => callback(classification);
      ipcRenderer.on(AI_IPC_CHANNELS.CLASSIFICATION_UPDATE, handler);
      return () => ipcRenderer.removeListener(AI_IPC_CHANNELS.CLASSIFICATION_UPDATE, handler);
    },
    
    getClassifiers: () =>
      ipcRenderer.invoke(AI_IPC_CHANNELS.CLASSIFIERS_LIST),

    // ========== Phase 2.2: Policy Simulation (PREVIEW ONLY) ==========
    
    classifyWithSimulation: (contextId: ContextId, forceRefresh?: boolean) =>
      ipcRenderer.invoke(AI_IPC_CHANNELS.CLASSIFY_WITH_SIMULATION, contextId, forceRefresh),
    
    simulateMode: (contextId: ContextId, mode: SimulationMode) =>
      ipcRenderer.invoke(AI_IPC_CHANNELS.SIMULATE, contextId, mode),
    
    simulateAll: (contextId: ContextId) =>
      ipcRenderer.invoke(AI_IPC_CHANNELS.SIMULATE, contextId),

    // ========== Phase 2.4: AI Audit & Trace (READ-ONLY) ==========
    
    getTrace: (contextId: ContextId, traceId?: string) =>
      ipcRenderer.invoke(AI_IPC_CHANNELS.TRACE_GET, contextId, traceId),
    
    listTraces: (contextId: ContextId) =>
      ipcRenderer.invoke(AI_IPC_CHANNELS.TRACE_LIST, contextId),
    
    exportTrace: (contextId: ContextId, traceId: string) =>
      ipcRenderer.invoke(AI_IPC_CHANNELS.TRACE_EXPORT, contextId, traceId),
  },

  // ========== Phase 3.0: Transaction Pipeline (DRY-RUN ONLY) ==========
  tx: {
    create: (contextId: ContextId, payload: SimulatedTxPayload) =>
      ipcRenderer.invoke(TX_IPC_CHANNELS.TX_CREATE, contextId, payload),
    
    get: (txId: string) =>
      ipcRenderer.invoke(TX_IPC_CHANNELS.TX_GET, txId),
    
    dryRun: (txId: string, originTrust?: number) =>
      ipcRenderer.invoke(TX_IPC_CHANNELS.TX_DRY_RUN, txId, originTrust),
    
    abort: (txId: string, reason: string) =>
      ipcRenderer.invoke(TX_IPC_CHANNELS.TX_ABORT, txId, reason),
    
    getReceipt: (txId: string) =>
      ipcRenderer.invoke(TX_IPC_CHANNELS.TX_RECEIPT, txId),
  },

  // ========== Phase 3.1: Wallet Adapter (SIGNING ONLY) ==========
  wallet: {
    connect: (origin: string, contextId: ContextId) =>
      ipcRenderer.invoke(TX_IPC_CHANNELS.WALLET_CONNECT, origin, contextId),
    
    disconnect: (origin: string, contextId: ContextId) =>
      ipcRenderer.invoke(TX_IPC_CHANNELS.WALLET_DISCONNECT, origin, contextId),
    
    sign: (txId: string) =>
      ipcRenderer.invoke(TX_IPC_CHANNELS.WALLET_SIGN, txId),
    
    signAll: (txIds: string[]) =>
      ipcRenderer.invoke(TX_IPC_CHANNELS.WALLET_SIGN_ALL, txIds),
    
    status: (origin: string, contextId: ContextId) =>
      ipcRenderer.invoke(TX_IPC_CHANNELS.WALLET_STATUS, origin, contextId),
    
    revoke: (target: { origin?: string; contextId?: ContextId }) =>
      ipcRenderer.invoke(TX_IPC_CHANNELS.WALLET_REVOKE, target),
  },
};

// Expose the API to the renderer
contextBridge.exposeInMainWorld('liminal', liminalAPI);

// Type declaration for renderer
declare global {
  interface Window {
    liminal: LiminalAPI;
  }
}

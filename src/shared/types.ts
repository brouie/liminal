/**
 * Liminal - Shared Types
 * Core type definitions for the privacy execution runtime
 */

/**
 * Unique identifier for a browser context
 */
export type ContextId = string;

/**
 * Context State Machine
 * 
 * Every context is ALWAYS in exactly one of these states.
 * Valid transitions:
 *   NEW -> POLICY_EVAL
 *   POLICY_EVAL -> ROUTE_SET
 *   ROUTE_SET -> ACTIVE
 *   ACTIVE -> ROTATING
 *   ROTATING -> DRAINING
 *   DRAINING -> POLICY_EVAL
 *   ACTIVE -> CLOSED
 *   Any -> ERROR (on failure)
 */
export enum ContextState {
  /** Context just created, not yet initialized */
  CTX_NEW = 'CTX_NEW',
  /** Evaluating privacy policies for this context */
  CTX_POLICY_EVAL = 'CTX_POLICY_EVAL',
  /** Route (proxy) is being configured */
  CTX_ROUTE_SET = 'CTX_ROUTE_SET',
  /** Context is active and can process requests */
  CTX_ACTIVE = 'CTX_ACTIVE',
  /** Identity rotation initiated */
  CTX_ROTATING = 'CTX_ROTATING',
  /** Draining pending requests before reset */
  CTX_DRAINING = 'CTX_DRAINING',
  /** Context is closed and cannot be used */
  CTX_CLOSED = 'CTX_CLOSED',
  /** Context encountered an error */
  CTX_ERROR = 'CTX_ERROR',
}

/**
 * Valid state transitions map
 */
export const VALID_STATE_TRANSITIONS: Record<ContextState, ContextState[]> = {
  [ContextState.CTX_NEW]: [ContextState.CTX_POLICY_EVAL, ContextState.CTX_ERROR],
  [ContextState.CTX_POLICY_EVAL]: [ContextState.CTX_ROUTE_SET, ContextState.CTX_ERROR],
  [ContextState.CTX_ROUTE_SET]: [ContextState.CTX_ACTIVE, ContextState.CTX_ERROR],
  [ContextState.CTX_ACTIVE]: [ContextState.CTX_ROTATING, ContextState.CTX_CLOSED, ContextState.CTX_ERROR],
  [ContextState.CTX_ROTATING]: [ContextState.CTX_DRAINING, ContextState.CTX_ERROR],
  [ContextState.CTX_DRAINING]: [ContextState.CTX_POLICY_EVAL, ContextState.CTX_ERROR],
  [ContextState.CTX_CLOSED]: [ContextState.CTX_ERROR], // Terminal state, only error possible
  [ContextState.CTX_ERROR]: [], // Terminal state, no transitions out
};

/**
 * Proxy configuration for a context
 */
export interface ProxyConfig {
  /** Proxy type: socks5 or http */
  type: 'socks5' | 'http' | 'direct';
  /** Proxy host (e.g., "127.0.0.1") */
  host?: string;
  /** Proxy port */
  port?: number;
  /** Optional username for proxy auth */
  username?: string;
  /** Optional password for proxy auth */
  password?: string;
}

/**
 * Browser context state
 */
export interface BrowserContext {
  /** Unique context identifier */
  id: ContextId;
  /** Session partition name for Electron */
  partition: string;
  /** Current state in the context state machine */
  state: ContextState;
  /** Current proxy configuration */
  proxy: ProxyConfig;
  /** Creation timestamp */
  createdAt: number;
  /** Associated tab IDs */
  tabIds: number[];
  /** Whether this context is active (derived from state) */
  active: boolean;
  /** Error message if state is CTX_ERROR */
  errorMessage?: string;
}

/**
 * Blocklist rule definition
 */
export interface BlocklistRule {
  /** Domain pattern (supports wildcards like *.example.com) */
  domain: string;
  /** Category for grouping (advertising, tracking, etc.) */
  category: string;
}

/**
 * Blocklist file structure
 */
export interface Blocklist {
  version: string;
  description: string;
  rules: BlocklistRule[];
}

/**
 * Request interception result
 */
export interface InterceptionResult {
  /** Whether the request was blocked */
  blocked: boolean;
  /** The domain that was evaluated */
  domain: string;
  /** Whether this is a third-party request */
  isThirdParty: boolean;
  /** The matching rule if blocked */
  matchedRule?: BlocklistRule;
  /** Request URL */
  url: string;
  /** Timestamp of interception */
  timestamp: number;
}

/**
 * Transaction receipt summary (for display in privacy receipt)
 * Phase 3.0: DRY-RUN ONLY
 */
export interface TxReceiptSummary {
  /** Transaction ID */
  txId: string;
  /** Transaction type (TRANSFER, SWAP, etc.) */
  type: string;
  /** Risk level (LOW, MEDIUM, HIGH) */
  riskLevel: string;
  /** Risk score (0-100) */
  riskScore: number;
  /** Selected strategy */
  strategy: string;
  /** Dry-run success */
  dryRunSuccess: boolean;
  /** Timestamp */
  timestamp: number;
  /** Explicitly a simulation */
  isSimulation: true;
}

/**
 * Privacy receipt for a context
 */
export interface PrivacyReceipt {
  /** Context this receipt belongs to */
  contextId: ContextId;
  /** Proxy used for this context */
  proxy: ProxyConfig;
  /** Total number of blocked requests */
  blockedCount: number;
  /** Set of blocked domains */
  blockedDomains: string[];
  /** Set of allowed third-party domains */
  allowedThirdPartyDomains: string[];
  /** All interception events (capped for memory) */
  events: InterceptionResult[];
  /** First request timestamp */
  startTime: number;
  /** Last update timestamp */
  lastUpdated: number;
  /** Transaction receipts (Phase 3.0 - DRY-RUN ONLY) */
  transactions?: TxReceiptSummary[];
}

/**
 * Tab state in the renderer
 */
export interface Tab {
  /** Electron webContents ID */
  id: number;
  /** Context this tab belongs to */
  contextId: ContextId;
  /** Current URL */
  url: string;
  /** Page title */
  title: string;
  /** Whether this tab is loading */
  loading: boolean;
  /** Whether this tab is the active tab */
  active: boolean;
}

/**
 * IPC channel names
 */
export const IPC_CHANNELS = {
  // Context management
  CONTEXT_CREATE: 'context:create',
  CONTEXT_DESTROY: 'context:destroy',
  CONTEXT_ROTATE: 'context:rotate',
  CONTEXT_GET: 'context:get',
  CONTEXT_LIST: 'context:list',
  
  // Proxy management
  PROXY_SET: 'proxy:set',
  PROXY_GET: 'proxy:get',
  
  // Receipt management
  RECEIPT_GET: 'receipt:get',
  RECEIPT_SUBSCRIBE: 'receipt:subscribe',
  RECEIPT_UPDATE: 'receipt:update',
  
  // Tab management
  TAB_CREATE: 'tab:create',
  TAB_CLOSE: 'tab:close',
  TAB_NAVIGATE: 'tab:navigate',
  TAB_UPDATE: 'tab:update',
  
  // Navigation
  NAV_BACK: 'nav:back',
  NAV_FORWARD: 'nav:forward',
  NAV_RELOAD: 'nav:reload',
} as const;

/**
 * Navigation state for a webview
 */
export interface NavigationState {
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  url: string;
  title: string;
}


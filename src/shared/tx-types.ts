/**
 * Liminal - Transaction Types
 * 
 * Type definitions for the transaction execution pipeline.
 * 
 * PHASE 3.0 RULES:
 * - DRY-RUN ONLY
 * - NO real Solana RPC calls
 * - NO private rail implementation
 * - NO funds movement
 * 
 * PHASE 3.1 ADDITIONS:
 * - Wallet Adapter Interface
 * - Scoped Signing (per-origin, per-context)
 * - TX_SIGN state
 * - STILL NO sendTransaction
 * - STILL NO RPC submission
 * 
 * PHASE 3.2 ADDITIONS:
 * - TxSubmissionGate - HARD BLOCK on all submission attempts
 * - Blocked API surface with runtime guards
 * - Structured reason codes for audit
 * - ZERO transaction submission possible
 * 
 * PHASE 3.3 ADDITIONS:
 * - UserIntent - Explicit user consent layer
 * - Intent confirmation required before signing/submission
 * - Immutable intents with expiration
 * - STILL NO transaction submission
 * 
 * PHASE 3.4 ADDITIONS:
 * - Read-Only RPC connectivity
 * - RpcEndpointPool with scoring
 * - Allowed: getHealth, getLatestBlockhash, getSlot, getVersion
 * - FORBIDDEN: sendTransaction, sendRawTransaction, any broadcast
 * - STILL NO transaction submission (Phase 3.2 gate)
 * 
 * PHASE 3.5 ADDITIONS:
 * - RPC Privacy Routing & Separation
 * - Purpose-based endpoint selection (different endpoints for different purposes)
 * - Route rotation on context/identity change
 * - STILL NO transaction submission
 * 
 * PHASE 3.6 ADDITIONS:
 * - Private Rail Adapter Interface (STUB ONLY)
 * - Capability model for future private execution
 * - NullPrivateRailAdapter - always returns "not supported"
 * - NO execution, NO submission, NO cryptography
 * 
 * PHASE 3.7 ADDITIONS:
 * - ExecutionPolicy model with explicit flags
 * - PolicyLock mechanism requiring explicit unlock
 * - Policy enforcement in TxSubmissionGate and PrivateRailAdapter
 * - Audit trail for policy changes
 * - ADDS PROTECTION ONLY - NO execution enabled
 * 
 * PHASE 3.8 ADDITIONS:
 * - Safety Guarantees surface (UI + Receipts)
 * - Safety Snapshot for receipts
 * - Guarantee transparency (read from live state)
 * - ADDS VISIBILITY ONLY - NO execution enabled
 * 
 * PHASE 3.9 ADDITIONS:
 * - Formal invariants with runtime checks
 * - Threat model (code-adjacent document)
 * - Emergency kill-switch
 * - Invariant enforcement at key boundaries
 * - ADDS SAFETY ONLY - NO execution enabled
 * 
 * PHASE 3.10 ADDITIONS:
 * - Phase freeze (Phase 3 becomes read-only)
 * - Machine-generated safety report
 * - Public attestation document
 * - Safety report hash in receipts
 * - Phase 3 becomes IMMUTABLE
 */

import { ContextId } from './types';
import { RiskLevel } from './ai-types';

// ============ Transaction State Machine ============

/**
 * Transaction states
 * Deterministic transitions only
 */
export enum TxState {
  /** New transaction, not yet processed */
  TX_NEW = 'TX_NEW',
  
  /** Classifying transaction intent */
  TX_CLASSIFY = 'TX_CLASSIFY',
  
  /** Scoring transaction risk */
  TX_RISK_SCORE = 'TX_RISK_SCORE',
  
  /** Selecting privacy strategy */
  TX_STRATEGY_SELECT = 'TX_STRATEGY_SELECT',
  
  /** Preparing transaction for execution */
  TX_PREPARE = 'TX_PREPARE',
  
  /** Running dry-run simulation */
  TX_DRY_RUN = 'TX_DRY_RUN',
  
  /** Signing transaction (Phase 3.1 - NO submission) */
  TX_SIGN = 'TX_SIGN',
  
  /** Dry-run completed successfully (SIMULATED - not real) */
  TX_SIMULATED_CONFIRM = 'TX_SIMULATED_CONFIRM',
  
  /** Transaction being submitted (Phase 4.0) */
  TX_SUBMIT = 'TX_SUBMIT',
  
  /** Transaction confirmed (Phase 4.0) */
  TX_CONFIRMED = 'TX_CONFIRMED',
  
  /** Transaction submission failed (Phase 4.0) */
  TX_FAILED = 'TX_FAILED',
  
  /** Transaction aborted */
  TX_ABORTED = 'TX_ABORTED',
}

/**
 * Valid state transitions
 */
export const TX_VALID_TRANSITIONS: Record<TxState, TxState[]> = {
  [TxState.TX_NEW]: [TxState.TX_CLASSIFY, TxState.TX_ABORTED],
  [TxState.TX_CLASSIFY]: [TxState.TX_RISK_SCORE, TxState.TX_ABORTED],
  [TxState.TX_RISK_SCORE]: [TxState.TX_STRATEGY_SELECT, TxState.TX_ABORTED],
  [TxState.TX_STRATEGY_SELECT]: [TxState.TX_PREPARE, TxState.TX_ABORTED],
  [TxState.TX_PREPARE]: [TxState.TX_DRY_RUN, TxState.TX_ABORTED],
  // Phase 3.1: DRY_RUN can go to SIGN (if signing requested) or directly to SIMULATED_CONFIRM
  [TxState.TX_DRY_RUN]: [TxState.TX_SIGN, TxState.TX_SIMULATED_CONFIRM, TxState.TX_ABORTED],
  // Phase 3.1: SIGN goes to SIMULATED_CONFIRM (NO submission)
  [TxState.TX_SIGN]: [TxState.TX_SIMULATED_CONFIRM, TxState.TX_ABORTED],
  // Phase 4.0: SIMULATED_CONFIRM can go to SUBMIT (if submission enabled)
  [TxState.TX_SIMULATED_CONFIRM]: [TxState.TX_SUBMIT, TxState.TX_ABORTED],
  // Phase 4.0: SUBMIT goes to CONFIRMED or FAILED
  [TxState.TX_SUBMIT]: [TxState.TX_CONFIRMED, TxState.TX_FAILED, TxState.TX_ABORTED],
  [TxState.TX_CONFIRMED]: [], // Terminal state
  [TxState.TX_FAILED]: [], // Terminal state
  [TxState.TX_ABORTED]: [], // Terminal state
};

// ============ Transaction Types ============

/**
 * Transaction type classification
 */
export enum TxType {
  /** Token transfer */
  TRANSFER = 'TRANSFER',
  
  /** Token swap */
  SWAP = 'SWAP',
  
  /** Token approval / delegation */
  APPROVAL = 'APPROVAL',
  
  /** Generic program interaction */
  PROGRAM_INTERACTION = 'PROGRAM_INTERACTION',
  
  /** Unknown transaction type */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Transaction classification result
 */
export interface TxClassification {
  /** Classified transaction type */
  type: TxType;
  
  /** Confidence of classification (0-1) */
  confidence: number;
  
  /** Human-readable description */
  description: string;
  
  /** Extracted metadata */
  metadata: {
    /** Estimated SOL amount (if applicable) */
    estimatedAmount?: number;
    
    /** Token mint address (if applicable) */
    tokenMint?: string;
    
    /** Destination address (if applicable) */
    destination?: string;
    
    /** Program ID being called */
    programId?: string;
    
    /** Number of instructions */
    instructionCount: number;
  };
}

// ============ Risk Scoring ============

/**
 * Risk score inputs
 */
export interface TxRiskInputs {
  /** Origin trust level (0-100) */
  originTrust: number;
  
  /** Context risk from AI (LOW/MEDIUM/HIGH) */
  contextRisk: RiskLevel;
  
  /** Transaction type */
  txType: TxType;
  
  /** Estimated transaction amount in SOL */
  estimatedAmount: number;
  
  /** Whether destination is known/trusted */
  knownDestination: boolean;
  
  /** Number of instructions in transaction */
  instructionCount: number;
}

/**
 * Risk score result
 */
export interface TxRiskScore {
  /** Overall risk level */
  level: RiskLevel;
  
  /** Numeric score (0-100, higher = riskier) */
  score: number;
  
  /** Individual risk factors */
  factors: TxRiskFactor[];
  
  /** Human-readable summary */
  summary: string;
}

/**
 * Individual risk factor
 */
export interface TxRiskFactor {
  /** Factor name */
  name: string;
  
  /** Factor contribution to score */
  contribution: number;
  
  /** Factor description */
  description: string;
}

// ============ Privacy Strategies ============

/**
 * Privacy strategy levels
 */
export enum TxStrategy {
  /** Normal execution - standard RPC */
  S0_NORMAL = 'S0_NORMAL',
  
  /** RPC privacy - use privacy-preserving RPC */
  S1_RPC_PRIVACY = 'S1_RPC_PRIVACY',
  
  /** Ephemeral sender - use temporary wallet */
  S2_EPHEMERAL_SENDER = 'S2_EPHEMERAL_SENDER',
  
  /** Privacy rail - full privacy pipeline (NOT IMPLEMENTED) */
  S3_PRIVACY_RAIL = 'S3_PRIVACY_RAIL',
}

/**
 * Strategy selection result
 */
export interface TxStrategySelection {
  /** Selected strategy */
  strategy: TxStrategy;
  
  /** Confidence in selection (0-1) */
  confidence: number;
  
  /** Human-readable rationale */
  rationale: string;
  
  /** Alternative strategies considered */
  alternatives: {
    strategy: TxStrategy;
    reason: string;
  }[];
  
  /** Privacy level (0-100, higher = more private) */
  privacyLevel: number;
  
  /** Estimated cost impact */
  costImpact: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
}

// ============ Dry-Run Execution ============

/**
 * Simulated RPC endpoint
 */
export interface SimulatedRpc {
  /** RPC name */
  name: string;
  
  /** Whether it's privacy-preserving */
  isPrivate: boolean;
  
  /** Simulated latency (ms) */
  simulatedLatencyMs: number;
}

/**
 * Dry-run execution result
 * SIMULATED ONLY - no real execution
 */
export interface DryRunResult {
  /** Unique dry-run ID */
  dryRunId: string;
  
  /** Whether dry-run succeeded */
  success: boolean;
  
  /** Simulated RPC used */
  simulatedRpc: SimulatedRpc;
  
  /** Selected strategy */
  strategy: TxStrategy;
  
  /** Simulated route taken */
  route: string[];
  
  /** Simulated gas/fee estimate */
  estimatedFee: number;
  
  /** Simulated execution time (ms) */
  simulatedExecutionMs: number;
  
  /** Any warnings */
  warnings: string[];
  
  /** Error message if failed */
  error?: string;
  
  /** Timestamp of dry-run */
  timestamp: number;
  
  /** Explicitly marked as simulation */
  isSimulation: true;
}

// ============ Transaction Object ============

/**
 * Simulated transaction payload
 * NOT a real Solana transaction
 */
export interface SimulatedTxPayload {
  /** Simulated program ID */
  programId: string;
  
  /** Simulated instruction data (hex string) */
  instructionData: string;
  
  /** Number of instructions */
  instructionCount: number;
  
  /** Simulated accounts involved */
  accounts: string[];
  
  /** Estimated SOL amount */
  estimatedAmount: number;
  
  /** Origin of request */
  origin: string;
}

/**
 * Full transaction state object
 */
export interface TxObject {
  /** Unique transaction ID */
  txId: string;
  
  /** Context ID this tx belongs to */
  contextId: ContextId;
  
  /** Current state */
  state: TxState;
  
  /** State history */
  stateHistory: {
    state: TxState;
    timestamp: number;
    reason?: string;
  }[];
  
  /** Simulated payload */
  payload: SimulatedTxPayload;
  
  /** Classification result (after TX_CLASSIFY) */
  classification?: TxClassification;
  
  /** Risk score (after TX_RISK_SCORE) */
  riskScore?: TxRiskScore;
  
  /** Strategy selection (after TX_STRATEGY_SELECT) */
  strategySelection?: TxStrategySelection;
  
  /** Dry-run result (after TX_DRY_RUN) */
  dryRunResult?: DryRunResult;
  
  /** Signing result (after TX_SIGN - Phase 3.1) */
  signingResult?: SigningResult;
  
  /** Submission attempt result (Phase 3.2 - ALWAYS blocked) */
  submissionAttempt?: SubmissionAttemptResult;
  
  /** Submission result (Phase 4.0 - after TX_SUBMIT) */
  submissionResult?: SubmissionResult;
  
  /** User intent for this transaction (Phase 3.3) */
  intentId?: string;
  
  /** Created timestamp */
  createdAt: number;
  
  /** Last updated timestamp */
  updatedAt: number;
  
  /** Abort reason if aborted */
  abortReason?: string;
}

// ============ Wallet Adapter (Phase 3.1) ============

/**
 * Wallet scope - defines the permission boundary
 */
export interface WalletScope {
  /** Origin that requested wallet access */
  origin: string;
  
  /** Context ID the wallet is scoped to */
  contextId: ContextId;
  
  /** Timestamp when scope was granted */
  grantedAt: number;
  
  /** Whether this scope is currently active */
  active: boolean;
}

/**
 * Wallet connection result
 */
export interface WalletConnectionResult {
  /** Whether connection was successful */
  success: boolean;
  
  /** Public key (simulated - not a real wallet) */
  publicKey?: string;
  
  /** Scope this connection is limited to */
  scope?: WalletScope;
  
  /** Error message if failed */
  error?: string;
}

/**
 * Signing result
 * PHASE 3.1: Signing ONLY - NO submission
 */
export interface SigningResult {
  /** Whether signing was successful */
  success: boolean;
  
  /** Signed transaction data (base64) */
  signedPayload?: string;
  
  /** Signature (hex) */
  signature?: string;
  
  /** Scope used for signing */
  signerScope: WalletScope;
  
  /** Payload hash used for verification */
  payloadHash: string;
  
  /** Dry-run hash for consistency check */
  dryRunHash: string;
  
  /** Whether payloads matched */
  payloadConsistent: boolean;
  
  /** Signing timestamp */
  timestamp: number;
  
  /** Error message if failed */
  error?: string;
  
  /** ALWAYS false in Phase 3.1 - no submission */
  submitted: false;
}

/**
 * Wallet adapter interface
 * Scoped per-origin and per-context
 */
export interface ILiminalWalletAdapter {
  /** Connect wallet for a specific origin and context */
  connect(origin: string, contextId: ContextId): Promise<WalletConnectionResult>;
  
  /** Sign a single transaction (NO submission) */
  signTransaction(txId: string): Promise<SigningResult>;
  
  /** Sign multiple transactions (NO submission) */
  signAllTransactions(txIds: string[]): Promise<SigningResult[]>;
  
  /** Check if wallet is connected for scope */
  isConnected(origin: string, contextId: ContextId): boolean;
  
  /** Disconnect wallet for scope */
  disconnect(origin: string, contextId: ContextId): void;
  
  /** Get current scope */
  getScope(origin: string, contextId: ContextId): WalletScope | undefined;
  
  /** Revoke all scopes for a context */
  revokeContext(contextId: ContextId): void;
  
  /** Revoke all scopes for an origin */
  revokeOrigin(origin: string): void;
}

// ============ Submission Gate (Phase 3.2) ============

/**
 * Submission block reason codes
 * Used for audit and explicit rejection tracking
 */
export enum SubmissionBlockReason {
  /** Submission is disabled in current phase */
  SUBMISSION_DISABLED = 'SUBMISSION_DISABLED',
  
  /** Current phase restricts submission */
  PHASE_RESTRICTION = 'PHASE_RESTRICTION',
  
  /** Private rail is not enabled */
  PRIVATE_RAIL_NOT_ENABLED = 'PRIVATE_RAIL_NOT_ENABLED',
  
  /** Transaction not in valid state for submission */
  INVALID_STATE = 'INVALID_STATE',
  
  /** Transaction not signed */
  NOT_SIGNED = 'NOT_SIGNED',
  
  /** Gate explicitly blocked */
  GATE_BLOCKED = 'GATE_BLOCKED',
  
  /** Blocked by execution policy (Phase 3.7) */
  POLICY_BLOCKED = 'POLICY_BLOCKED',
}

/**
 * Result of a submission attempt
 * In Phase 3.2, this is ALWAYS a rejection
 */
export interface SubmissionAttemptResult {
  /** Whether submission was allowed (Phase 4.0: conditional) */
  allowed: boolean;
  
  /** Reason code for rejection (only present if allowed is false) */
  reasonCode?: SubmissionBlockReason;
  
  /** Human-readable reason */
  reason: string;
  
  /** Timestamp of attempt */
  timestamp: number;
  
  /** Transaction ID that attempted submission */
  txId: string;
  
  /** Whether this was a real attempt or preemptive check */
  wasAttempt: boolean;
  
  /** Policy version at time of check (Phase 3.7) */
  policyVersion?: number;
}

/**
 * Result of a successful transaction submission (Phase 4.0)
 */
export interface SubmissionResult {
  /** Unique submission ID */
  submissionId: string;
  
  /** Whether submission succeeded */
  success: boolean;
  
  /** Transaction signature (if successful) */
  signature?: string;
  
  /** Slot of the transaction (if successful) */
  slot?: number;
  
  /** RPC endpoint ID used for submission */
  rpcEndpointId: string;
  
  /** RPC route ID used for submission */
  rpcRouteId?: string;
  
  /** Timestamp of submission */
  timestamp: number;
  
  /** Error message if failed */
  error?: string;
  
  /** Latency in milliseconds */
  latencyMs?: number;
}

/**
 * Submission gate status
 */
export interface SubmissionGateStatus {
  /** Whether gate is currently blocking (Phase 4.0: conditional) */
  blocking: boolean;
  
  /** Current phase */
  phase: string;
  
  /** List of blocked methods */
  blockedMethods: string[];
  
  /** When the gate was initialized */
  initializedAt: number;
}

// ============ User Intent (Phase 3.3) ============

/**
 * User intent type
 * Determines what actions the user consents to
 */
export enum IntentType {
  /** User consents to signing only (no submission) */
  SIGN_ONLY = 'SIGN_ONLY',
  
  /** User consents to signing AND submission (future phases) */
  SIGN_AND_SUBMIT = 'SIGN_AND_SUBMIT',
}

/**
 * Intent status
 */
export enum IntentStatus {
  /** Intent created, awaiting confirmation */
  PENDING = 'PENDING',
  
  /** Intent confirmed by user */
  CONFIRMED = 'CONFIRMED',
  
  /** Intent expired before confirmation */
  EXPIRED = 'EXPIRED',
  
  /** Intent was explicitly revoked */
  REVOKED = 'REVOKED',
  
  /** Intent was consumed (action completed) */
  CONSUMED = 'CONSUMED',
}

/**
 * User Intent Object
 * Represents explicit user consent for a transaction action.
 * 
 * IMMUTABLE once created - cannot be modified.
 */
export interface UserIntent {
  /** Unique intent ID */
  readonly intentId: string;
  
  /** Transaction ID this intent is for */
  readonly txId: string;
  
  /** Origin that requested the intent */
  readonly origin: string;
  
  /** Context ID the intent is scoped to */
  readonly contextId: ContextId;
  
  /** When intent was created */
  readonly createdAt: number;
  
  /** When intent expires (must confirm before this) */
  readonly expiresAt: number;
  
  /** Type of intent (what user consents to) */
  readonly intentType: IntentType;
  
  /** Current status of the intent */
  status: IntentStatus;
  
  /** When intent was confirmed (if confirmed) */
  confirmedAt?: number;
  
  /** When intent was consumed (if consumed) */
  consumedAt?: number;
}

/**
 * Intent creation options
 */
export interface CreateIntentOptions {
  /** Transaction ID */
  txId: string;
  
  /** Origin requesting intent */
  origin: string;
  
  /** Context ID */
  contextId: ContextId;
  
  /** Intent type */
  intentType: IntentType;
  
  /** Time-to-live in milliseconds (default: 5 minutes) */
  ttlMs?: number;
}

/**
 * Intent confirmation result
 */
export interface IntentConfirmationResult {
  /** Whether confirmation was successful */
  success: boolean;
  
  /** The intent ID */
  intentId: string;
  
  /** Error reason if failed */
  error?: string;
  
  /** Whether intent was expired */
  expired?: boolean;
  
  /** Whether intent was already consumed */
  alreadyConsumed?: boolean;
}

/**
 * Intent validation result
 */
export interface IntentValidation {
  /** Whether intent is valid for the requested action */
  valid: boolean;
  
  /** The intent if found */
  intent?: UserIntent;
  
  /** Error reason if invalid */
  reason?: string;
}

// ============ Receipt Extension ============

/**
 * Transaction receipt data for privacy receipt
 */
export interface TxReceiptData {
  /** Transaction ID */
  txId: string;
  
  /** Transaction type */
  type: TxType;
  
  /** Risk score level */
  riskLevel: RiskLevel;
  
  /** Risk score numeric */
  riskScore: number;
  
  /** Selected strategy */
  strategy: TxStrategy;
  
  /** Dry-run success */
  dryRunSuccess: boolean;
  
  /** Dry-run timestamp */
  dryRunTimestamp: number;
  
  /** Explicitly a simulation */
  isSimulation: true;
  
  // Phase 3.1 additions
  
  /** Whether transaction was signed */
  signed: boolean;
  
  /** Signer scope (origin + contextId) if signed */
  signerScope?: {
    origin: string;
    contextId: ContextId;
  };
  
  /** Whether transaction was submitted (Phase 4.0: conditional) */
  submitted: boolean;
  
  // Phase 3.2 additions
  
  /** Whether submission was attempted */
  submissionAttempted: boolean;
  
  /** Whether submission was blocked (ALWAYS true if attempted) */
  submissionBlocked?: true;
  
  /** Block reason code if blocked */
  blockReasonCode?: SubmissionBlockReason;
  
  // Phase 3.3 additions
  
  /** Intent ID if intent was created */
  intentId?: string;
  
  /** Intent type if intent was created */
  intentType?: IntentType;
  
  /** Whether intent was confirmed */
  intentConfirmed?: boolean;
  
  /** Whether intent expired */
  intentExpired?: boolean;
  
  // Phase 3.4 additions
  
  /** RPC endpoint ID used for read-only calls */
  rpcEndpointId?: string;
  
  /** RPC latency in ms */
  rpcLatencyMs?: number;
  
  /** Latest blockhash fetched (if any) */
  blockhashFetched?: string;
  
  /** Slot fetched (if any) */
  slotFetched?: number;
  
  // Phase 3.5 additions
  
  /** RPC route ID used */
  rpcRouteId?: string;
  
  /** RPC purpose for the route */
  rpcPurpose?: RpcPurpose;
  
  /** Whether endpoint was reused from another purpose */
  endpointReused?: boolean;
  
  // Phase 3.6 additions
  
  /** Whether private rail is available */
  privateRailAvailable: boolean;
  
  /** Reason if private rail not available */
  privateRailReason?: string;
  
  /** Private rail status */
  privateRailStatus?: PrivateRailStatus;
  
  // Phase 3.7 additions
  
  /** Policy version at time of receipt generation */
  policyVersion: number;
  
  /** Policy lock status at time of receipt generation */
  policyLockStatus: PolicyLockStatus;
  
  /** Whether submission is allowed by policy */
  policyAllowsSubmission: boolean;
  
  /** Whether private rail is allowed by policy */
  policyAllowsPrivateRail: boolean;
  
  // Phase 3.8 additions
  
  /** Safety snapshot at time of receipt generation */
  safetySnapshot?: SafetySnapshot;
  
  // Phase 3.9 additions
  
  /** Invariant version at time of receipt generation */
  invariantVersion: number;
  
  /** Whether invariant checks passed */
  invariantCheckPassed: boolean;
  
  /** Whether kill-switch was active */
  killSwitchActive: boolean;
  
  // Phase 3.10 additions
  
  /** Whether Phase 3 is frozen */
  phaseFrozen: boolean;
  
  /** Safety report hash */
  safetyReportHash: string;
  
  /** Attestation version */
  attestationVersion: string;
  
  // Phase 4.0 additions
  
  /** Submission result (if submitted) */
  submissionResult?: SubmissionResult;
}

// ============ RPC Pool (Phase 3.4) ============

/**
 * RPC endpoint configuration
 */
export interface RpcEndpointConfig {
  /** Unique endpoint ID */
  id: string;
  
  /** RPC URL */
  url: string;
  
  /** Display name */
  name: string;
  
  /** Whether endpoint supports WebSocket */
  supportsWs?: boolean;
  
  /** Whether this is a private/premium endpoint */
  isPrivate?: boolean;
  
  /** Weight for load balancing (higher = preferred) */
  weight?: number;
  
  /** Whether endpoint is enabled */
  enabled: boolean;
}

/**
 * RPC endpoint metrics
 */
export interface RpcEndpointMetrics {
  /** Endpoint ID */
  endpointId: string;
  
  /** Total requests made */
  totalRequests: number;
  
  /** Successful requests */
  successfulRequests: number;
  
  /** Failed requests */
  failedRequests: number;
  
  /** Average latency in ms */
  avgLatencyMs: number;
  
  /** Last successful request timestamp */
  lastSuccessAt?: number;
  
  /** Last failure timestamp */
  lastFailureAt?: number;
  
  /** Last known slot (freshness indicator) */
  lastKnownSlot?: number;
  
  /** Computed score (0-100) */
  score: number;
}

/**
 * RPC health check result
 */
export interface RpcHealthResult {
  /** Whether health check passed */
  healthy: boolean;
  
  /** Latency in ms */
  latencyMs: number;
  
  /** Error message if unhealthy */
  error?: string;
  
  /** Timestamp */
  timestamp: number;
}

/**
 * Read-only RPC response
 */
export interface RpcReadOnlyResponse<T> {
  /** Whether request succeeded */
  success: boolean;
  
  /** Response data */
  data?: T;
  
  /** Endpoint used */
  endpointId: string;
  
  /** Latency in ms */
  latencyMs: number;
  
  /** Error message if failed */
  error?: string;
  
  /** Timestamp */
  timestamp: number;
}

/**
 * Blockhash response
 */
export interface BlockhashResponse {
  /** The blockhash */
  blockhash: string;
  
  /** Last valid block height */
  lastValidBlockHeight: number;
}

/**
 * Slot response
 */
export interface SlotResponse {
  /** Current slot */
  slot: number;
}

/**
 * Version response
 */
export interface VersionResponse {
  /** Solana version */
  solanaCore: string;
  
  /** Feature set */
  featureSet?: number;
}

// ============ RPC Privacy Routing (Phase 3.5) ============

/**
 * RPC purpose - what type of read operation
 * Different purposes may use different endpoints for privacy
 */
export enum RpcPurpose {
  /** Generic read operation */
  READ = 'READ',
  
  /** Fetching blockhash */
  BLOCKHASH = 'BLOCKHASH',
  
  /** Fetching slot */
  SLOT = 'SLOT',
  
  /** Fetching version */
  VERSION = 'VERSION',
  
  /** Health check */
  HEALTH = 'HEALTH',
  
  /** Transaction submission (Phase 4.0) */
  SUBMIT = 'SUBMIT',
}

/**
 * RPC Route Context
 * Tracks which endpoint is used for which purpose in which context
 */
export interface RpcRouteContext {
  /** Unique route ID */
  readonly routeId: string;
  
  /** Context ID this route belongs to */
  readonly contextId: ContextId;
  
  /** Origin that initiated the route */
  readonly origin: string;
  
  /** Purpose of this route */
  readonly purpose: RpcPurpose;
  
  /** Endpoint ID assigned to this route */
  endpointId: string;
  
  /** When this route was created */
  readonly createdAt: number;
  
  /** When this route was last used */
  lastUsedAt: number;
  
  /** Number of times this route has been used */
  useCount: number;
  
  /** Whether this route is still active */
  active: boolean;
}

/**
 * Route selection result
 */
export interface RouteSelectionResult {
  /** The route context */
  route: RpcRouteContext;
  
  /** Whether this is a new route or reused */
  isNew: boolean;
  
  /** Whether the endpoint was reused from another purpose */
  endpointReused: boolean;
}

/**
 * Route rotation reason
 */
export enum RouteRotationReason {
  /** New context created */
  NEW_CONTEXT = 'NEW_CONTEXT',
  
  /** Identity rotation triggered */
  IDENTITY_ROTATION = 'IDENTITY_ROTATION',
  
  /** Route expired */
  EXPIRED = 'EXPIRED',
  
  /** Manual rotation requested */
  MANUAL = 'MANUAL',
}

// ============ Private Rail Adapter (Phase 3.6) ============

/**
 * Private rail capabilities
 * Describes what a private rail implementation can do
 * 
 * PHASE 3.6: DESCRIPTIVE ONLY - NO EXECUTION
 */
export interface PrivateRailCapabilities {
  /** Whether this rail supports simple transfers */
  supportsTransfers: boolean;
  
  /** Whether this rail supports program/contract calls */
  supportsProgramCalls: boolean;
  
  /** Whether this rail hides the sender address */
  hidesSender: boolean;
  
  /** Whether this rail hides the transaction amount */
  hidesAmount: boolean;
  
  /** Whether this rail hides the recipient address */
  hidesRecipient: boolean;
  
  /** Whether this rail requires a relayer */
  requiresRelayer: boolean;
  
  /** Whether this rail requires ZK proofs */
  requiresZkProof: boolean;
  
  /** Maximum transaction size supported (in bytes) */
  maxTxSize?: number;
  
  /** Minimum transaction amount (if any) */
  minAmount?: number;
  
  /** Maximum transaction amount (if any) */
  maxAmount?: number;
  
  /** Estimated additional latency in ms */
  estimatedLatencyMs?: number;
  
  /** Estimated additional fee (as multiplier, e.g., 1.5 = 50% more) */
  feeMultiplier?: number;
}

/**
 * Private rail preparation context
 * Information passed to the adapter for transaction preparation
 */
export interface PrivateRailPrepContext {
  /** Transaction ID */
  txId: string;
  
  /** Context ID */
  contextId: ContextId;
  
  /** Origin */
  origin: string;
  
  /** Transaction type */
  txType: TxType;
  
  /** Risk level */
  riskLevel: RiskLevel;
  
  /** Estimated amount */
  estimatedAmount?: number;
}

/**
 * Private rail preparation result
 * 
 * PHASE 3.6: STUB ONLY - No actual preparation
 */
export interface PrivateRailPrepResult {
  /** Whether preparation was successful */
  success: boolean;
  
  /** Whether this rail is available */
  available: boolean;
  
  /** Reason if not available or failed */
  reason?: string;
  
  /** Prepared payload (stub only - placeholder) */
  preparedPayload?: string;
  
  /** Estimated fee */
  estimatedFee?: number;
  
  /** Estimated latency */
  estimatedLatencyMs?: number;
  
  /** Timestamp */
  timestamp: number;
}

/**
 * Private rail estimation result
 */
export interface PrivateRailEstimateResult {
  /** Whether estimation was successful */
  success: boolean;
  
  /** Whether this rail is available for this transaction */
  available: boolean;
  
  /** Reason if not available */
  reason?: string;
  
  /** Estimated total fee (including relayer, ZK, etc.) */
  estimatedTotalFee?: number;
  
  /** Estimated execution time in ms */
  estimatedTimeMs?: number;
  
  /** Privacy score (0-100) */
  privacyScore?: number;
  
  /** Timestamp */
  timestamp: number;
}

/**
 * Private rail validation result
 */
export interface PrivateRailValidationResult {
  /** Whether validation passed */
  valid: boolean;
  
  /** Whether this rail is available */
  available: boolean;
  
  /** Validation errors */
  errors: string[];
  
  /** Validation warnings */
  warnings: string[];
  
  /** Reason if not available */
  reason?: string;
  
  /** Timestamp */
  timestamp: number;
}

/**
 * Private rail status
 */
export enum PrivateRailStatus {
  /** Rail is not available */
  NOT_AVAILABLE = 'NOT_AVAILABLE',
  
  /** Rail is available but not configured */
  NOT_CONFIGURED = 'NOT_CONFIGURED',
  
  /** Rail is available and ready */
  READY = 'READY',
  
  /** Rail is temporarily unavailable */
  TEMPORARILY_UNAVAILABLE = 'TEMPORARILY_UNAVAILABLE',
  
  /** Rail is disabled by policy */
  DISABLED_BY_POLICY = 'DISABLED_BY_POLICY',
}

/**
 * Private Rail Adapter Interface
 * 
 * PHASE 3.6 RULES:
 * - STUB ONLY - No execution
 * - NO network calls
 * - NO cryptographic operations
 * - NO submission
 * - Methods return structured results
 * 
 * This interface defines the contract for future private
 * execution implementations (ZK, mixers, relayers, etc.)
 */
export interface IPrivateRailAdapter {
  /** Adapter name/identifier */
  readonly name: string;
  
  /** Adapter version */
  readonly version: string;
  
  /**
   * Get the capabilities of this private rail
   * 
   * PHASE 3.6: Returns descriptive capabilities only
   */
  getCapabilities(): PrivateRailCapabilities;
  
  /**
   * Get the current status of this rail
   */
  getStatus(): PrivateRailStatus;
  
  /**
   * Prepare a transaction for private execution
   * 
   * PHASE 3.6: STUB - Returns placeholder result
   * NO actual preparation occurs
   * 
   * @param payload - Simulated transaction payload
   * @param context - Preparation context
   */
  prepare(
    payload: SimulatedTxPayload,
    context: PrivateRailPrepContext
  ): Promise<PrivateRailPrepResult>;
  
  /**
   * Estimate costs for private execution
   * 
   * PHASE 3.6: STUB - Returns placeholder estimates
   * NO actual estimation occurs
   * 
   * @param payload - Simulated transaction payload
   */
  estimate(payload: SimulatedTxPayload): Promise<PrivateRailEstimateResult>;
  
  /**
   * Validate a transaction for private execution
   * 
   * PHASE 3.6: STUB - Returns placeholder validation
   * NO actual validation occurs
   * 
   * @param payload - Simulated transaction payload
   */
  validate(payload: SimulatedTxPayload): Promise<PrivateRailValidationResult>;
  
  /**
   * Check if this rail is available
   */
  isAvailable(): boolean;
}

// ============ Execution Policy (Phase 3.7) ============

/**
 * Execution Policy Flags
 * 
 * Explicit flags that control dangerous capabilities.
 * All default to FALSE for maximum safety.
 * 
 * PHASE 3.7: ADDS PROTECTION ONLY - NO execution enabled
 */
export interface ExecutionPolicyFlags {
  /** Allow transaction submission (default: false) */
  allowSubmission: boolean;
  
  /** Allow private rail execution (default: false) */
  allowPrivateRail: boolean;
  
  /** Allow relayer usage (default: false) */
  allowRelayer: boolean;
  
  /** Allow ZK proof generation (default: false) */
  allowZkProofs: boolean;
  
  /** Allow fund movement (default: false) */
  allowFundMovement: boolean;
}

/**
 * Policy unlock record
 * Audit trail for policy unlocks
 */
export interface PolicyUnlockRecord {
  /** Unique unlock ID */
  readonly unlockId: string;
  
  /** Which flag was unlocked */
  readonly flag: keyof ExecutionPolicyFlags;
  
  /** New value for the flag */
  readonly newValue: boolean;
  
  /** Previous value */
  readonly previousValue: boolean;
  
  /** Reason for unlock */
  readonly reason: string;
  
  /** Author of unlock */
  readonly author: string;
  
  /** Timestamp */
  readonly timestamp: number;
  
  /** Was unlock approved */
  readonly approved: boolean;
}

/**
 * Policy lock status
 */
export enum PolicyLockStatus {
  /** Policy is locked - flags cannot be changed */
  LOCKED = 'LOCKED',
  
  /** Policy is temporarily unlocked */
  UNLOCKED = 'UNLOCKED',
  
  /** Policy is in pending unlock (awaiting confirmation) */
  PENDING_UNLOCK = 'PENDING_UNLOCK',
}

/**
 * Execution Policy
 * 
 * Immutable at runtime unless explicitly unlocked.
 * 
 * PHASE 3.7 RULES:
 * - All flags default to FALSE
 * - Policy is LOCKED by default
 * - Requires explicit unlock with reason + author
 * - All changes are audited
 */
export interface ExecutionPolicy {
  /** Current policy flags */
  readonly flags: ExecutionPolicyFlags;
  
  /** Lock status */
  readonly lockStatus: PolicyLockStatus;
  
  /** When policy was created */
  readonly createdAt: number;
  
  /** When policy was last modified */
  readonly modifiedAt: number;
  
  /** Version number (increments on any change) */
  readonly version: number;
  
  /** Unlock history */
  readonly unlockHistory: PolicyUnlockRecord[];
}

/**
 * Policy check result
 */
export interface PolicyCheckResult {
  /** Whether the action is allowed */
  allowed: boolean;
  
  /** Policy version at time of check */
  policyVersion: number;
  
  /** Lock status at time of check */
  lockStatus: PolicyLockStatus;
  
  /** Reason if not allowed */
  reason?: string;
  
  /** Which flag blocked the action */
  blockedByFlag?: keyof ExecutionPolicyFlags;
  
  /** Timestamp of check */
  timestamp: number;
}

/**
 * Policy violation error
 */
export class PolicyViolationError extends Error {
  readonly flag: keyof ExecutionPolicyFlags;
  readonly policyVersion: number;
  readonly timestamp: number;
  
  constructor(
    message: string,
    flag: keyof ExecutionPolicyFlags,
    policyVersion: number
  ) {
    super(message);
    this.name = 'PolicyViolationError';
    this.flag = flag;
    this.policyVersion = policyVersion;
    this.timestamp = Date.now();
  }
}

// ============ Safety Guarantees (Phase 3.8) ============

/**
 * Safety Guarantee Status
 * 
 * Describes a single safety guarantee and its current state.
 * 
 * PHASE 3.8: Transparency only - NO execution changes
 */
export interface SafetyGuarantee {
  /** Guarantee ID */
  id: string;
  
  /** Human-readable name */
  name: string;
  
  /** Whether this guarantee is enabled or disabled */
  enabled: boolean;
  
  /** Source module that provides this guarantee */
  sourceModule: string;
  
  /** Policy version at time of check */
  policyVersion: number;
  
  /** Lock status at time of check */
  lockStatus: PolicyLockStatus;
  
  /** Additional details/explanation */
  details?: string;
  
  /** Timestamp of last check */
  timestamp: number;
}

/**
 * Safety Guarantee Category
 */
export enum SafetyGuaranteeCategory {
  /** Transaction submission controls */
  SUBMISSION = 'SUBMISSION',
  
  /** Fund movement controls */
  FUNDS = 'FUNDS',
  
  /** Private rail controls */
  PRIVATE_RAIL = 'PRIVATE_RAIL',
  
  /** Relayer controls */
  RELAYER = 'RELAYER',
  
  /** Signing capabilities */
  SIGNING = 'SIGNING',
  
  /** RPC capabilities */
  RPC = 'RPC',
}

/**
 * Safety Snapshot
 * 
 * Immutable snapshot of safety guarantees at a specific point in time.
 * Recorded in transaction receipts.
 * 
 * PHASE 3.8: ADDS VISIBILITY ONLY
 */
export interface SafetySnapshot {
  /** When snapshot was taken */
  readonly timestamp: number;
  
  /** Policy version at time of snapshot */
  readonly policyVersion: number;
  
  /** Policy lock status at time of snapshot */
  readonly policyLockStatus: PolicyLockStatus;
  
  /** Whether transaction submission is blocked */
  readonly submissionBlocked: boolean;
  
  /** Whether private rail is available */
  readonly privateRailAvailable: boolean;
  
  /** Whether funds movement is allowed */
  readonly fundsMovementAllowed: boolean;
  
  /** Whether relayers are allowed */
  readonly relayersAllowed: boolean;
  
  /** Whether signing is enabled (scoped, auditable) */
  readonly signingEnabled: boolean;
  
  /** Whether read-only RPC is enabled */
  readonly readOnlyRpcEnabled: boolean;
  
  /** Source modules for guarantees */
  readonly sourceModules: {
    submission: string;
    privateRail: string;
    funds: string;
    relayers: string;
    signing: string;
    rpc: string;
  };
}

/**
 * Safety Guarantee Summary
 * 
 * Summary of all safety guarantees for UI display.
 */
export interface SafetyGuaranteeSummary {
  /** All guarantees */
  guarantees: SafetyGuarantee[];
  
  /** Safety snapshot */
  snapshot: SafetySnapshot;
  
  /** Whether any guarantee has changed since last check */
  hasChanged: boolean;
  
  /** Warning message if guarantees changed */
  warningMessage?: string;
  
  /** Timestamp of summary */
  timestamp: number;
}

// ============ Formal Invariants & Kill-Switch (Phase 3.9) ============

/**
 * Invariant ID
 * 
 * Unique identifier for each formal invariant.
 */
export enum InvariantId {
  /** No submission when policy locked */
  NO_SUBMISSION_WHEN_POLICY_LOCKED = 'NO_SUBMISSION_WHEN_POLICY_LOCKED',
  
  /** No funds movement ever in Phase 3 */
  NO_FUNDS_MOVEMENT_PHASE_3 = 'NO_FUNDS_MOVEMENT_PHASE_3',
  
  /** No private rail execution without policy unlock */
  NO_PRIVATE_RAIL_WITHOUT_UNLOCK = 'NO_PRIVATE_RAIL_WITHOUT_UNLOCK',
  
  /** Read-only RPC only */
  READ_ONLY_RPC_ONLY = 'READ_ONLY_RPC_ONLY',
  
  /** No submission methods reachable */
  NO_SUBMISSION_METHODS = 'NO_SUBMISSION_METHODS',
  
  /** Kill-switch must override all checks */
  KILL_SWITCH_OVERRIDES_ALL = 'KILL_SWITCH_OVERRIDES_ALL',
}

/**
 * Invariant definition
 */
export interface Invariant {
  /** Invariant ID */
  id: InvariantId;
  
  /** Human-readable description */
  description: string;
  
  /** Version of invariant (increments on changes) */
  version: number;
  
  /** When invariant was defined */
  definedAt: number;
}

/**
 * Invariant check result
 */
export interface InvariantCheckResult {
  /** Whether invariant passed */
  passed: boolean;
  
  /** Invariant ID */
  invariantId: InvariantId;
  
  /** Invariant version */
  invariantVersion: number;
  
  /** Error message if failed */
  error?: string;
  
  /** Timestamp of check */
  timestamp: number;
}

/**
 * Invariant violation error
 * 
 * Thrown when an invariant check fails.
 */
export class InvariantViolationError extends Error {
  readonly invariantId: InvariantId;
  readonly invariantVersion: number;
  readonly timestamp: number;
  
  constructor(
    message: string,
    invariantId: InvariantId,
    invariantVersion: number
  ) {
    super(message);
    this.name = 'InvariantViolationError';
    this.invariantId = invariantId;
    this.invariantVersion = invariantVersion;
    this.timestamp = Date.now();
  }
}

/**
 * Kill-switch state
 */
export enum KillSwitchState {
  /** Kill-switch is inactive */
  INACTIVE = 'INACTIVE',
  
  /** Kill-switch is active */
  ACTIVE = 'ACTIVE',
}

/**
 * Kill-switch activation record
 */
export interface KillSwitchActivation {
  /** Activation ID */
  readonly activationId: string;
  
  /** Reason for activation */
  readonly reason: string;
  
  /** Author of activation */
  readonly author: string;
  
  /** When activated */
  readonly activatedAt: number;
  
  /** Current state */
  readonly state: KillSwitchState;
  
  /** Whether activation was deactivated */
  deactivatedAt?: number;
}

/**
 * Kill-switch status
 */
export interface KillSwitchStatus {
  /** Current state */
  state: KillSwitchState;
  
  /** Current activation (if active) */
  activation?: KillSwitchActivation;
  
  /** Total activations */
  totalActivations: number;
  
  /** Timestamp */
  timestamp: number;
}

/**
 * Invariant state
 */
export interface InvariantState {
  /** Invariant version */
  version: number;
  
  /** All invariants */
  invariants: Invariant[];
  
  /** Last check results */
  lastChecks: Map<InvariantId, InvariantCheckResult>;
  
  /** Kill-switch status */
  killSwitch: KillSwitchStatus;
  
  /** Timestamp */
  timestamp: number;
}

// ============ Phase Freeze & Safety Report (Phase 3.10) ============

/**
 * Phase freeze status
 */
export enum PhaseFreezeStatus {
  /** Phase is not frozen (can be modified) */
  NOT_FROZEN = 'NOT_FROZEN',
  
  /** Phase is frozen (read-only) */
  FROZEN = 'FROZEN',
}

/**
 * Phase freeze record
 */
export interface PhaseFreezeRecord {
  /** Freeze ID */
  readonly freezeId: string;
  
  /** Phase that was frozen */
  readonly phase: string;
  
  /** When frozen */
  readonly frozenAt: number;
  
  /** Who froze it */
  readonly frozenBy: string;
  
  /** Reason for freeze */
  readonly reason: string;
  
  /** Current status */
  readonly status: PhaseFreezeStatus;
}

/**
 * Safety Report
 * 
 * Machine-generated report of system safety state.
 * Deterministic output (same state → same report).
 */
export interface SafetyReport {
  /** Report version */
  readonly version: string;
  
  /** When report was generated */
  readonly generatedAt: number;
  
  /** Phase number */
  readonly phase: string;
  
  /** Enabled capabilities */
  readonly enabledCapabilities: {
    signing: boolean;
    readOnlyRpc: boolean;
    dryRun: boolean;
    receiptGeneration: boolean;
  };
  
  /** Disabled capabilities */
  readonly disabledCapabilities: {
    submission: boolean;
    privateRailExecution: boolean;
    fundsMovement: boolean;
    relayer: boolean;
    zkProofs: boolean;
  };
  
  /** Policy state */
  readonly policyState: {
    version: number;
    locked: boolean;
    lockStatus: PolicyLockStatus;
    flags: {
      allowSubmission: boolean;
      allowPrivateRail: boolean;
      allowRelayer: boolean;
      allowZkProofs: boolean;
      allowFundMovement: boolean;
    };
  };
  
  /** Invariants */
  readonly invariants: {
    id: InvariantId;
    version: number;
    description: string;
  }[];
  
  /** Kill-switch status */
  readonly killSwitch: {
    state: KillSwitchState;
    totalActivations: number;
  };
  
  /** RPC capabilities */
  readonly rpcCapabilities: {
    readOnly: boolean;
    allowedMethods: string[];
    blockedMethods: string[];
  };
  
  /** Safety snapshot */
  readonly safetySnapshot: {
    submissionBlocked: boolean;
    privateRailAvailable: boolean;
    fundsMovementAllowed: boolean;
    signingEnabled: boolean;
    readOnlyRpcEnabled: boolean;
  };
  
  /** Report hash (SHA-256 of deterministic JSON) */
  readonly reportHash: string;
}

/**
 * Attestation metadata
 */
export interface AttestationMetadata {
  /** Attestation version */
  readonly version: string;
  
  /** When generated */
  readonly generatedAt: number;
  
  /** Safety report hash */
  readonly safetyReportHash: string;
  
  /** Invariant version */
  readonly invariantVersion: number;
  
  /** Phase freeze status */
  readonly phaseFrozen: boolean;
}

// ============ IPC Channels ============

export const TX_IPC_CHANNELS = {
  /** Create new simulated transaction */
  TX_CREATE: 'tx:create',
  
  /** Get transaction by ID */
  TX_GET: 'tx:get',
  
  /** Advance transaction state */
  TX_ADVANCE: 'tx:advance',
  
  /** Abort transaction */
  TX_ABORT: 'tx:abort',
  
  /** Run full dry-run pipeline */
  TX_DRY_RUN: 'tx:dryRun',
  
  /** Get transaction receipt data */
  TX_RECEIPT: 'tx:receipt',
  
  // Phase 3.1: Wallet Adapter channels
  
  /** Connect wallet for scope */
  WALLET_CONNECT: 'wallet:connect',
  
  /** Disconnect wallet for scope */
  WALLET_DISCONNECT: 'wallet:disconnect',
  
  /** Sign single transaction (NO submission) */
  WALLET_SIGN: 'wallet:sign',
  
  /** Sign multiple transactions (NO submission) */
  WALLET_SIGN_ALL: 'wallet:signAll',
  
  /** Get wallet connection status */
  WALLET_STATUS: 'wallet:status',
  
  /** Revoke wallet scope */
  WALLET_REVOKE: 'wallet:revoke',
  
  // Phase 3.3: Intent channels
  
  /** Create user intent */
  INTENT_CREATE: 'intent:create',
  
  /** Confirm user intent */
  INTENT_CONFIRM: 'intent:confirm',
  
  /** Get intent by ID */
  INTENT_GET: 'intent:get',
  
  /** Get intent for transaction */
  INTENT_GET_FOR_TX: 'intent:getForTx',
  
  /** Revoke intent */
  INTENT_REVOKE: 'intent:revoke',
  
  /** Validate intent for action */
  INTENT_VALIDATE: 'intent:validate',
} as const;


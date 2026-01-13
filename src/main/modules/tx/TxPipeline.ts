/**
 * Liminal - Transaction Pipeline
 * 
 * Orchestrates the full transaction pipeline.
 * 
 * PHASE 3.0 RULES:
 * - DRY-RUN ONLY
 * - NO real Solana RPC calls
 * - NO actual execution
 * - NO funds movement
 * 
 * PHASE 3.1 ADDITIONS:
 * - Scoped signing (per-origin, per-context)
 * - TX_SIGN state
 * - STILL NO sendTransaction
 * - STILL NO RPC submission
 * 
 * PHASE 3.2 ADDITIONS:
 * - TxSubmissionGate - HARD BLOCK on all submissions
 * - All submission attempts are rejected
 * - Rejections recorded in receipt
 * 
 * PHASE 3.3 ADDITIONS:
 * - UserIntent - Explicit user consent layer
 * - Intent confirmation required before signing (if enforced)
 * - Intent ALWAYS required before submission (future phases)
 * - STILL NO transaction submission
 * 
 * PHASE 3.4 ADDITIONS:
 * - Read-Only RPC connectivity
 * - Fetch blockhash/slot during dry-run
 * - STILL NO transaction submission (gate remains effective)
 * 
 * PHASE 3.5 ADDITIONS:
 * - RPC Privacy Routing
 * - Purpose-based endpoint selection
 * - Route rotation on identity change
 * - STILL NO transaction submission
 */

import { ContextId } from '../../../shared/types';
import type { RiskLevel } from '../../../shared/ai-types';
import {
  TxState,
  TxObject,
  SimulatedTxPayload,
  TxReceiptData,
  SigningResult,
  SubmissionAttemptResult,
  UserIntent,
  IntentType,
  IntentStatus,
  CreateIntentOptions,
  IntentConfirmationResult,
  IntentValidation,
  RpcReadOnlyResponse,
  BlockhashResponse,
  SlotResponse,
  RpcPurpose,
  RpcRouteContext,
  RouteSelectionResult,
  RouteRotationReason,
  PolicyLockStatus,
  InvariantId,
  SubmissionResult,
} from '../../../shared/tx-types';
import { getTxStateMachine, TxStateMachine } from './TxStateMachine';
import { getTxClassifier, TxClassifier } from './TxClassifier';
import { getTxRiskScorer, TxRiskScorer } from './TxRiskScorer';
import { getStrategySelector, StrategySelector } from './StrategySelector';
import { getDryRunExecutor, DryRunExecutor } from './DryRunExecutor';
import { getAIPrivacyAgent } from '../ai';
import { getLiminalWalletAdapter, LiminalWalletAdapter } from '../wallet';
import { getTxSubmissionGate, TxSubmissionGate } from './TxSubmissionGate';
import { getIntentManager, IntentManager } from './IntentManager';
import { getReadOnlyRpcClient, ReadOnlySolanaRpcClient, getRpcRouteManager, RpcRouteManager, getSolanaRpcSubmitClient, SolanaRpcSubmitClient } from '../rpc';
import { getTxPersistence } from './TxPersistence';
import { getTxAuditLogger, AuditStage } from './TxAuditLogger';
import { getExecutionPolicyManager, ExecutionPolicyManager } from '../policy';
import { getSafetyGuaranteeManager, SafetyGuaranteeManager } from '../safety';
import { getInvariantManager, InvariantManager } from '../invariants';
import { getPhaseFreeze } from '../freeze';
import { getSafetyReportGenerator } from '../freeze/SafetyReportGenerator';
import { isProd } from '../../config/env';

/**
 * Transaction Pipeline
 * 
 * Coordinates all transaction processing modules.
 * 
 * Phase 3.0: Dry-run simulation
 * Phase 3.1: Scoped signing (NO submission)
 * Phase 3.2: Submission gate (HARD BLOCK)
 * Phase 3.3: User intent & consent layer
 * Phase 3.4: Read-only RPC (blockhash/slot fetching)
 * Phase 3.5: RPC privacy routing
 * 
 * This pipeline NEVER sends real transactions.
 */
export class TxPipeline {
  private stateMachine: TxStateMachine;
  private classifier: TxClassifier;
  private riskScorer: TxRiskScorer;
  private strategySelector: StrategySelector;
  private dryRunExecutor: DryRunExecutor;
  private walletAdapter: LiminalWalletAdapter;
  private submissionGate: TxSubmissionGate;
  private intentManager: IntentManager;
  private rpcClient: ReadOnlySolanaRpcClient;
  private routeManager: RpcRouteManager;
  private rpcSubmitClient: SolanaRpcSubmitClient;
  private auditLogger = getTxAuditLogger();
  private persistence = getTxPersistence();
  
  /** Last fetched blockhash per transaction */
  private txBlockhash: Map<string, { blockhash: string; endpointId: string; latencyMs: number; routeId: string }> = new Map();
  
  /** Last fetched slot per transaction */
  private txSlot: Map<string, { slot: number; endpointId: string; latencyMs: number; routeId: string }> = new Map();
  
  /** Route selection results per transaction + purpose */
  private txRoutes: Map<string, Map<RpcPurpose, RouteSelectionResult>> = new Map();
  
  constructor() {
    this.stateMachine = getTxStateMachine();
    this.classifier = getTxClassifier();
    this.riskScorer = getTxRiskScorer();
    this.strategySelector = getStrategySelector();
    this.dryRunExecutor = getDryRunExecutor();
    this.walletAdapter = getLiminalWalletAdapter();
    this.submissionGate = getTxSubmissionGate();
    this.intentManager = getIntentManager();
    const useMockRpc = !isProd();
    this.rpcClient = getReadOnlyRpcClient(useMockRpc); // Mock in dev/test, real in prod
    this.routeManager = getRpcRouteManager();
    this.rpcSubmitClient = getSolanaRpcSubmitClient(useMockRpc); // Mock in dev/test, real in prod
    this.restoreFromPersistence();
  }
  
  /**
   * Create a new transaction
   * 
   * PHASE 3.9: Enforces invariants before creating transaction
   * 
   * @param contextId - Context ID
   * @param payload - Simulated transaction payload
   * @returns Created transaction object
   */
  createTransaction(contextId: ContextId, payload: SimulatedTxPayload): TxObject {
    // Phase 3.9: Enforce invariants at entry point
    getInvariantManager().enforceKillSwitch('createTransaction');
    getInvariantManager().enforceInvariant(InvariantId.NO_SUBMISSION_WHEN_POLICY_LOCKED);
    
    const tx = this.stateMachine.createTransaction(contextId, payload);
    this.logAudit('CREATE', tx);
    this.persistSnapshot();
    return tx;
  }
  
  /**
   * Run the full dry-run pipeline
   * 
   * Advances through all states and returns the final transaction object.
   * This is a SIMULATION ONLY - no real execution occurs.
   * 
   * @param txId - Transaction ID
   * @param originTrust - Origin trust level (0-100)
   * @returns Final transaction object
   */
  async runDryRunPipeline(txId: string, originTrust: number = 50): Promise<TxObject> {
    // Get transaction
    let tx = this.stateMachine.getTransaction(txId);
    if (!tx) {
      throw new Error(`Transaction not found: ${txId}`);
    }
    
    // Validate starting state
    if (tx.state !== TxState.TX_NEW) {
      throw new Error(`Transaction must be in TX_NEW state, got: ${tx.state}`);
    }
    
    try {
      // Step 1: Classify
      tx = this.stateMachine.transitionTo(txId, TxState.TX_CLASSIFY, 'Starting classification');
      const classification = this.classifier.classify(tx.payload);
      tx = this.stateMachine.updateTransaction(txId, { classification });
      
      // Step 2: Risk Score
      tx = this.stateMachine.transitionTo(txId, TxState.TX_RISK_SCORE, 'Scoring risk');
      
      // Get context risk from AI (read-only)
      let contextRisk: RiskLevel = 'MEDIUM'; // Default
      try {
        const aiAgent = getAIPrivacyAgent();
        const aiClassification = await aiAgent.classify(tx.contextId, false);
        if (aiClassification) {
          contextRisk = aiClassification.riskLevel;
        }
      } catch {
        // AI not available, use default
      }
      
      const riskScore = this.riskScorer.score({
        originTrust,
        contextRisk,
        txType: classification.type,
        estimatedAmount: tx.payload.estimatedAmount,
        knownDestination: false, // Simplified for now
        instructionCount: tx.payload.instructionCount,
      });
      tx = this.stateMachine.updateTransaction(txId, { riskScore });
      
      // Step 3: Strategy Selection
      tx = this.stateMachine.transitionTo(txId, TxState.TX_STRATEGY_SELECT, 'Selecting strategy');
      const strategySelection = this.strategySelector.select(
        tx.payload,
        riskScore,
        originTrust
      );
      tx = this.stateMachine.updateTransaction(txId, { strategySelection });
      
      // Step 4: Prepare
      tx = this.stateMachine.transitionTo(txId, TxState.TX_PREPARE, 'Preparing transaction');
      
      // Validate payload
      const validation = this.dryRunExecutor.validatePayload(tx.payload);
      if (!validation.valid) {
        tx = this.stateMachine.abort(txId, `Validation failed: ${validation.errors.join(', ')}`);
        return tx;
      }
      
      // Step 5: Dry-Run
      tx = this.stateMachine.transitionTo(txId, TxState.TX_DRY_RUN, 'Executing dry-run');
      const dryRunResult = this.dryRunExecutor.execute(tx.payload, strategySelection);
      tx = this.stateMachine.updateTransaction(txId, { dryRunResult });
      
      // Step 6: Complete
      if (dryRunResult.success) {
        tx = this.stateMachine.transitionTo(
          txId,
          TxState.TX_SIMULATED_CONFIRM,
          'Dry-run completed successfully'
        );
      } else {
        tx = this.stateMachine.abort(
          txId,
          dryRunResult.error || 'Dry-run failed'
        );
      }
      
      return tx;
    } catch (error) {
      // Abort on any error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      try {
        return this.stateMachine.abort(txId, errorMessage);
      } catch {
        // Already terminal, just get and return
        return this.stateMachine.getTransaction(txId)!;
      }
    } finally {
      this.persistSnapshot();
    }
  }
  
  /**
   * Sign a transaction after successful dry-run
   * 
   * PHASE 3.1: Signing ONLY - NO submission
   * 
   * @param txId - Transaction ID to sign
   * @returns Updated transaction object
   */
  async signTransaction(txId: string): Promise<TxObject> {
    const tx = this.stateMachine.getTransaction(txId);
    if (!tx) {
      throw new Error(`Transaction not found: ${txId}`);
    }
    
    // Validate state - must be TX_DRY_RUN with successful dry-run
    if (tx.state !== TxState.TX_DRY_RUN) {
      throw new Error(`Transaction must be in TX_DRY_RUN state for signing, got: ${tx.state}`);
    }
    
    if (!tx.dryRunResult?.success) {
      throw new Error('Cannot sign: dry-run was not successful');
    }
    
    try {
      // Transition to TX_SIGN
      let updated = this.stateMachine.transitionTo(txId, TxState.TX_SIGN, 'Signing transaction');
      
      // Perform signing (NO submission)
      const signingResult = await this.walletAdapter.signTransaction(txId);
      
      // Update transaction with signing result
      updated = this.stateMachine.updateTransaction(txId, { signingResult });
      
      // Complete - transition to SIMULATED_CONFIRM
      if (signingResult.success) {
        updated = this.stateMachine.transitionTo(
          txId,
          TxState.TX_SIMULATED_CONFIRM,
          'Transaction signed successfully (NOT submitted)'
        );
      } else {
        updated = this.stateMachine.abort(
          txId,
          signingResult.error || 'Signing failed'
        );
      }
      
      this.logAudit('SIGN_COMPLETE', updated);
      return updated;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown signing error';
      try {
        return this.stateMachine.abort(txId, errorMessage);
      } catch {
        return this.stateMachine.getTransaction(txId)!;
      }
    } finally {
      this.persistSnapshot();
    }
  }
  
  /**
   * Run dry-run pipeline with optional signing
   * 
   * @param txId - Transaction ID
   * @param originTrust - Origin trust level (0-100)
   * @param sign - Whether to sign after dry-run
   * @returns Final transaction object
   */
  async runPipelineWithSigning(
    txId: string,
    originTrust: number = 50,
    sign: boolean = false
  ): Promise<TxObject> {
    // Run dry-run pipeline
    let tx = await this.runDryRunPipeline(txId, originTrust);
    
    // If signing requested and dry-run succeeded
    if (sign && tx.state === TxState.TX_DRY_RUN && tx.dryRunResult?.success) {
      // Ensure wallet is connected
      const connected = this.walletAdapter.isConnected(tx.payload.origin, tx.contextId);
      if (!connected) {
        throw new Error('Wallet not connected for this origin and context');
      }
      
      tx = await this.signTransaction(txId);
    } else if (tx.state === TxState.TX_DRY_RUN && tx.dryRunResult?.success) {
      // No signing requested, complete without signing
      tx = this.stateMachine.transitionTo(
        txId,
        TxState.TX_SIMULATED_CONFIRM,
        'Dry-run completed (unsigned)'
      );
    }
    
    this.logAudit('DRY_RUN_COMPLETE', tx);
    this.persistSnapshot();
    return tx;
  }
  
  /**
   * Attempt to submit a transaction
   * 
   * PHASE 3.2: THIS ALWAYS FAILS.
   * The submission gate blocks ALL submission attempts.
   * 
   * @param txId - Transaction ID
   * @returns Rejection result (NEVER returns success)
   */
  attemptSubmission(txId: string): SubmissionAttemptResult {
    const tx = this.stateMachine.getTransaction(txId);
    
    // Gate always rejects, but we pass tx for detailed reason code
    const result = this.submissionGate.attemptSubmission(txId, tx);
    
    // Record the attempt in the transaction
    if (tx) {
      this.stateMachine.updateTransaction(txId, { submissionAttempt: result });
    }
    
    return result;
  }
  
  /**
   * Check if submission would be allowed (preemptive check)
   * 
   * PHASE 3.2: THIS ALWAYS RETURNS FALSE.
   * 
   * @param txId - Transaction ID
   * @returns false (always)
   */
  wouldAllowSubmission(txId: string): boolean {
    return this.submissionGate.wouldAllowSubmission(txId);
  }
  
  /**
   * Get submission gate status
   */
  getSubmissionGateStatus() {
    return this.submissionGate.getStatus();
  }
  
  /**
   * Get transaction by ID
   */
  getTransaction(txId: string): TxObject | undefined {
    return this.stateMachine.getTransaction(txId);
  }
  
  /**
   * Get all transactions for a context
   */
  getContextTransactions(contextId: ContextId): TxObject[] {
    return this.stateMachine.getContextTransactions(contextId);
  }
  
  /**
   * Abort a transaction
   */
  abortTransaction(txId: string, reason: string): TxObject {
    const tx = this.stateMachine.abort(txId, reason);
    this.persistSnapshot();
    return tx;
  }
  
  /**
   * Get receipt data for a completed transaction
   */
  getReceiptData(txId: string): TxReceiptData | null {
    const tx = this.stateMachine.getTransaction(txId);
    if (!tx) return null;
    
    // Only return receipt for terminal states
    if (
      tx.state !== TxState.TX_SIMULATED_CONFIRM &&
      tx.state !== TxState.TX_CONFIRMED &&
      tx.state !== TxState.TX_FAILED &&
      tx.state !== TxState.TX_ABORTED
    ) {
      return null;
    }
    
    return {
      txId: tx.txId,
      type: tx.classification?.type || 'UNKNOWN' as any,
      riskLevel: tx.riskScore?.level || 'MEDIUM',
      riskScore: tx.riskScore?.score || 0,
      strategy: tx.strategySelection?.strategy || 'S0_NORMAL' as any,
      dryRunSuccess: tx.dryRunResult?.success || false,
      dryRunTimestamp: tx.dryRunResult?.timestamp || tx.updatedAt,
      isSimulation: true,
      // Phase 3.1 additions
      signed: tx.signingResult?.success || false,
      signerScope: tx.signingResult?.success ? {
        origin: tx.signingResult.signerScope.origin,
        contextId: tx.signingResult.signerScope.contextId,
      } : undefined,
      submitted: tx.submissionResult?.success || false,
      // Phase 3.2 additions
      submissionAttempted: !!tx.submissionAttempt?.wasAttempt,
      submissionBlocked: tx.submissionAttempt ? true : undefined,
      blockReasonCode: tx.submissionAttempt?.reasonCode,
      // Phase 3.3 additions
      intentId: tx.intentId,
      intentType: tx.intentId ? this.intentManager.getIntent(tx.intentId)?.intentType : undefined,
      intentConfirmed: tx.intentId ? this.intentManager.getIntent(tx.intentId)?.status === IntentStatus.CONFIRMED ||
                                     this.intentManager.getIntent(tx.intentId)?.status === IntentStatus.CONSUMED : undefined,
      intentExpired: tx.intentId ? this.intentManager.getIntent(tx.intentId)?.status === IntentStatus.EXPIRED : undefined,
      // Phase 3.4 additions
      rpcEndpointId: this.txBlockhash.get(tx.txId)?.endpointId || this.txSlot.get(tx.txId)?.endpointId,
      rpcLatencyMs: this.txBlockhash.get(tx.txId)?.latencyMs || this.txSlot.get(tx.txId)?.latencyMs,
      blockhashFetched: this.txBlockhash.get(tx.txId)?.blockhash,
      slotFetched: this.txSlot.get(tx.txId)?.slot,
      // Phase 3.5 additions
      rpcRouteId: this.txBlockhash.get(tx.txId)?.routeId || this.txSlot.get(tx.txId)?.routeId,
      rpcPurpose: this.getPrimaryRpcPurpose(tx.txId),
      endpointReused: this.wasEndpointReused(tx.txId),
      // Phase 3.6 additions
      privateRailAvailable: this.getPrivateRailInfo().available,
      privateRailReason: this.getPrivateRailInfo().available ? undefined : this.getPrivateRailInfo().reason,
      privateRailStatus: this.getPrivateRailInfo().status,
      // Phase 3.7 additions
      policyVersion: this.getPolicyState().version,
      policyLockStatus: this.getPolicyState().lockStatus,
      policyAllowsSubmission: this.getPolicyState().flags.allowSubmission,
      policyAllowsPrivateRail: this.getPolicyState().flags.allowPrivateRail,
      // Phase 3.8 additions
      safetySnapshot: this.getSafetySnapshot(),
      // Phase 3.9 additions
      invariantVersion: this.getInvariantState().version,
      invariantCheckPassed: this.checkInvariantsPassed(),
      killSwitchActive: this.getInvariantState().killSwitch.state === 'ACTIVE',
      // Phase 3.10 additions
      phaseFrozen: this.getPhaseFreezeStatus(),
      safetyReportHash: this.getSafetyReportHash(),
      attestationVersion: this.getAttestationVersion(),
      // Phase 4.0 additions
      submissionResult: tx.submissionResult,
    };
  }
  
  /**
   * Get invariant state for receipt
   */
  private getInvariantState() {
    return getInvariantManager().getState();
  }
  
  /**
   * Check if invariants passed (for receipt)
   */
  private checkInvariantsPassed(): boolean {
    try {
      getInvariantManager().enforceAllInvariants();
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Get phase freeze status for receipt
   */
  private getPhaseFreezeStatus(): boolean {
    return getPhaseFreeze().isFrozen();
  }
  
  /**
   * Get safety report hash for receipt
   */
  private getSafetyReportHash(): string {
    return getSafetyReportGenerator().generateReport().reportHash;
  }
  
  /**
   * Get attestation version for receipt
   */
  private getAttestationVersion(): string {
    return getSafetyReportGenerator().getAttestationMetadata().version;
  }
  
  /**
   * Get safety snapshot for receipt
   * 
   * PHASE 3.8: Immutable snapshot of safety guarantees
   */
  private getSafetySnapshot() {
    return getSafetyGuaranteeManager().getSnapshot();
  }
  
  /**
   * Get private rail info from strategy selector
   */
  getPrivateRailInfo() {
    return this.strategySelector.getPrivateRailInfo();
  }
  
  /**
   * Get execution policy state
   */
  getPolicyState() {
    return getExecutionPolicyManager().getPolicyState();
  }
  
  /**
   * Get the execution policy manager
   */
  getPolicyManager(): ExecutionPolicyManager {
    return getExecutionPolicyManager();
  }
  
  /**
   * Get safety guarantee manager
   * 
   * PHASE 3.8: For UI access to safety guarantees
   */
  getSafetyGuaranteeManager(): SafetyGuaranteeManager {
    return getSafetyGuaranteeManager();
  }
  
  /**
   * Get primary RPC purpose for a transaction (for receipt)
   */
  private getPrimaryRpcPurpose(txId: string): RpcPurpose | undefined {
    const txRouteMap = this.txRoutes.get(txId);
    if (!txRouteMap || txRouteMap.size === 0) return undefined;
    
    // Prefer BLOCKHASH, then SLOT
    if (txRouteMap.has(RpcPurpose.BLOCKHASH)) return RpcPurpose.BLOCKHASH;
    if (txRouteMap.has(RpcPurpose.SLOT)) return RpcPurpose.SLOT;
    
    // Return first available
    return txRouteMap.keys().next().value;
  }
  
  /**
   * Check if endpoint was reused for this transaction
   */
  private wasEndpointReused(txId: string): boolean | undefined {
    const txRouteMap = this.txRoutes.get(txId);
    if (!txRouteMap || txRouteMap.size === 0) return undefined;
    
    for (const result of txRouteMap.values()) {
      if (result.endpointReused) return true;
    }
    return false;
  }
  
  // ============ Phase 3.4 & 3.5: RPC Methods ============
  
  /**
   * Fetch latest blockhash for a transaction with route context
   * 
   * This is READ-ONLY - does NOT submit any transaction.
   * Uses privacy routing to select appropriate endpoint.
   * 
   * @param txId - Transaction ID
   * @param origin - Optional origin (defaults to tx origin)
   * @returns Blockhash response with route info
   */
  async fetchBlockhash(txId: string, origin?: string): Promise<RpcReadOnlyResponse<BlockhashResponse> & { routeId?: string }> {
    const tx = this.stateMachine.getTransaction(txId);
    const txOrigin = origin || tx?.payload.origin || 'unknown';
    const contextId = tx?.contextId || 'unknown';
    
    // Get or create route for this purpose
    const routeResult = this.routeManager.getOrCreateRoute(
      contextId,
      txOrigin,
      RpcPurpose.BLOCKHASH
    );
    
    // Store route result for receipt
    this.recordRouteForTx(txId, RpcPurpose.BLOCKHASH, routeResult);
    
    // Get the endpoint for this route
    const endpoint = this.rpcClient.getPool().getEndpoint(routeResult.route.endpointId);
    
    // Make the RPC call
    const response = await this.rpcClient.getLatestBlockhash(endpoint);
    
    if (response.success && response.data) {
      this.txBlockhash.set(txId, {
        blockhash: response.data.blockhash,
        endpointId: response.endpointId,
        latencyMs: response.latencyMs,
        routeId: routeResult.route.routeId,
      });
    }
    
    return {
      ...response,
      routeId: routeResult.route.routeId,
    };
  }
  
  /**
   * Fetch current slot for a transaction with route context
   * 
   * This is READ-ONLY - does NOT submit any transaction.
   * Uses privacy routing to select appropriate endpoint.
   * 
   * @param txId - Transaction ID
   * @param origin - Optional origin (defaults to tx origin)
   * @returns Slot response with route info
   */
  async fetchSlot(txId: string, origin?: string): Promise<RpcReadOnlyResponse<SlotResponse> & { routeId?: string }> {
    const tx = this.stateMachine.getTransaction(txId);
    const txOrigin = origin || tx?.payload.origin || 'unknown';
    const contextId = tx?.contextId || 'unknown';
    
    // Get or create route for this purpose
    const routeResult = this.routeManager.getOrCreateRoute(
      contextId,
      txOrigin,
      RpcPurpose.SLOT
    );
    
    // Store route result for receipt
    this.recordRouteForTx(txId, RpcPurpose.SLOT, routeResult);
    
    // Get the endpoint for this route
    const endpoint = this.rpcClient.getPool().getEndpoint(routeResult.route.endpointId);
    
    // Make the RPC call
    const response = await this.rpcClient.getSlot(endpoint);
    
    if (response.success && response.data) {
      this.txSlot.set(txId, {
        slot: response.data.slot,
        endpointId: response.endpointId,
        latencyMs: response.latencyMs,
        routeId: routeResult.route.routeId,
      });
    }
    
    return {
      ...response,
      routeId: routeResult.route.routeId,
    };
  }
  
  /**
   * Record route for a transaction + purpose
   */
  private recordRouteForTx(txId: string, purpose: RpcPurpose, result: RouteSelectionResult): void {
    let txRouteMap = this.txRoutes.get(txId);
    if (!txRouteMap) {
      txRouteMap = new Map();
      this.txRoutes.set(txId, txRouteMap);
    }
    txRouteMap.set(purpose, result);
  }
  
  /**
   * Get the RPC client (for testing/advanced usage)
   */
  getRpcClient(): ReadOnlySolanaRpcClient {
    return this.rpcClient;
  }
  
  /**
   * Set RPC mock mode
   */
  setRpcMockMode(useMock: boolean): void {
    this.rpcClient.setMockMode(useMock);
  }
  
  // ============ Phase 3.5: Route Management ============
  
  /**
   * Get the route manager
   */
  getRouteManager(): RpcRouteManager {
    return this.routeManager;
  }
  
  /**
   * Rotate routes for a context
   * 
   * Called on identity rotation to ensure new endpoints are used.
   * 
   * @param contextId - Context ID
   * @param reason - Rotation reason
   * @returns Number of routes rotated
   */
  rotateContextRoutes(contextId: ContextId, reason: RouteRotationReason): number {
    return this.routeManager.rotateContextRoutes(contextId, reason);
  }
  
  /**
   * Check if purposes are using different endpoints in a context
   */
  arePurposesSeparated(contextId: ContextId): boolean {
    return this.routeManager.arePurposesSeparated(contextId);
  }
  
  /**
   * Get route for a transaction + purpose
   */
  getRouteForTx(txId: string, purpose: RpcPurpose): RouteSelectionResult | undefined {
    return this.txRoutes.get(txId)?.get(purpose);
  }
  
  /**
   * Get all routes for a transaction
   */
  getRoutesForTx(txId: string): Map<RpcPurpose, RouteSelectionResult> | undefined {
    return this.txRoutes.get(txId);
  }
  
  // ============ Phase 3.3: Intent Methods ============
  
  /**
   * Create a user intent for a transaction
   * 
   * @param options - Intent creation options
   * @returns Created intent
   */
  createIntent(options: CreateIntentOptions): UserIntent {
    const intent = this.intentManager.createIntent(options);
    
    // Link intent to transaction
    const tx = this.stateMachine.getTransaction(options.txId);
    if (tx) {
      this.stateMachine.updateTransaction(options.txId, { intentId: intent.intentId });
    }
    
    return intent;
  }
  
  /**
   * Confirm a user intent
   * 
   * @param intentId - Intent ID to confirm
   * @returns Confirmation result
   */
  confirmIntent(intentId: string): IntentConfirmationResult {
    return this.intentManager.confirmIntent(intentId);
  }
  
  /**
   * Revoke a user intent
   * 
   * @param intentId - Intent ID to revoke
   * @returns Whether revocation was successful
   */
  revokeIntent(intentId: string): boolean {
    return this.intentManager.revokeIntent(intentId);
  }
  
  /**
   * Get intent by ID
   * 
   * @param intentId - Intent ID
   * @returns Intent or undefined
   */
  getIntent(intentId: string): UserIntent | undefined {
    return this.intentManager.getIntent(intentId);
  }
  
  /**
   * Get intent for a transaction
   * 
   * @param txId - Transaction ID
   * @returns Intent or undefined
   */
  getIntentForTx(txId: string): UserIntent | undefined {
    return this.intentManager.getIntentForTx(txId);
  }
  
  /**
   * Validate intent for signing
   * 
   * @param txId - Transaction ID
   * @returns Validation result
   */
  validateIntentForSigning(txId: string): IntentValidation {
    return this.intentManager.validateForSigning(txId);
  }
  
  /**
   * Validate intent for submission
   * 
   * Note: Submission is STILL BLOCKED in Phase 3.3.
   * 
   * @param txId - Transaction ID
   * @returns Validation result
   */
  validateIntentForSubmission(txId: string): IntentValidation {
    return this.intentManager.validateForSubmission(txId);
  }
  
  /**
   * Set whether to enforce intent before signing
   * 
   * @param enforce - Whether to enforce
   */
  setEnforceIntentForSigning(enforce: boolean): void {
    this.intentManager.setEnforceIntentForSigning(enforce);
  }
  
  /**
   * Submit transaction to Solana network
   * 
   * PHASE 4.0: Real transaction submission
   * 
   * Must do, in order:
   * 1. Enforce KillSwitch
   * 2. Enforce InvariantManager
   * 3. Validate SIGN_AND_SUBMIT intent (confirmed, not expired)
   * 4. Validate signed payload hash == dry-run hash
   * 5. Call TxSubmissionGate → must return allowed:true
   * 6. Reject if strategy == S3_PRIVACY_RAIL
   * 7. Call SolanaRpcSubmitClient.sendAndConfirmRawTransaction
   * 8. Record: signature, slot, endpointId, routeId, confirmation status
   * 9. Transition state accordingly
   * 
   * @param txId - Transaction ID to submit
   * @returns Updated transaction object
   */
  async submitTransaction(txId: string): Promise<TxObject> {
    const tx = this.stateMachine.getTransaction(txId);
    if (!tx) {
      throw new Error(`Transaction not found: ${txId}`);
    }
    
    // Check current state - must be TX_SIMULATED_CONFIRM
    if (tx.state !== TxState.TX_SIMULATED_CONFIRM) {
      // If already in a terminal state, just return it
      if (this.stateMachine.isTerminal(tx.txId)) {
        this.persistSnapshot();
        return tx;
      }
      const aborted = this.stateMachine.abort(txId, `Transaction is in state ${tx.state}, must be TX_SIMULATED_CONFIRM`);
      this.persistSnapshot();
      return aborted;
    }
    
    // 1. Enforce KillSwitch (propagates)
    const invariantManager = getInvariantManager();
    invariantManager.enforceKillSwitch('submitTransaction');
    
    // 2. Enforce InvariantManager (propagates)
    invariantManager.enforceInvariant(InvariantId.NO_SUBMISSION_WHEN_POLICY_LOCKED);
    
    // 3. Validate SIGN_AND_SUBMIT intent (confirmed, not expired)
    const intentValidation = this.intentManager.validateForSubmission(txId);
    if (!intentValidation.valid) {
      this.persistSnapshot();
      return tx; // remain at TX_SIMULATED_CONFIRM, no submission
    }
    
    // 4. Validate signed payload hash == dry-run hash
    if (!tx.signingResult?.success) {
      this.persistSnapshot();
      return tx;
    }
    
    if (!tx.signingResult.payloadConsistent) {
      this.persistSnapshot();
      return tx;
    }
    
    if (tx.signingResult.payloadHash !== tx.signingResult.dryRunHash) {
      this.persistSnapshot();
      return tx;
    }
    
    // 5. Call TxSubmissionGate → must return allowed:true (may throw on safety)
    const gateResult = this.submissionGate.attemptSubmission(txId, tx);
    if (!gateResult.allowed) {
      // Update transaction with submission attempt result
      this.stateMachine.updateTransaction(txId, {
        submissionAttempt: gateResult,
      });
      this.persistSnapshot();
      return tx;
    }
    
    // 6. Reject if strategy == S3_PRIVACY_RAIL
    if (tx.strategySelection?.strategy === 'S3_PRIVACY_RAIL') {
      this.persistSnapshot();
      return tx;
    }
    
    // 7. Transition to TX_SUBMIT
    let updatedTx = this.stateMachine.transitionTo(txId, TxState.TX_SUBMIT, 'Submitting transaction');
    this.logAudit('SUBMIT_ATTEMPT', updatedTx);
    
    // 8. Get signed payload
    if (!tx.signingResult.signedPayload) {
      const failed = this.stateMachine.transitionTo(txId, TxState.TX_FAILED, 'No signed payload available');
      this.logAudit('SUBMIT_FAILED', failed);
      this.persistSnapshot();
      return failed;
    }
    
    try {
      // 9. Call SolanaRpcSubmitClient.sendAndConfirmRawTransaction
      const submissionResult = await this.rpcSubmitClient.sendAndConfirmRawTransaction(
        tx.signingResult.signedPayload,
        tx.contextId,
        tx.payload.origin
      );
      
      // 10. Record submission result
      updatedTx = this.stateMachine.updateTransaction(txId, {
        submissionResult,
      });
      
      // 11. Transition state accordingly
      if (submissionResult.success && submissionResult.signature && submissionResult.slot) {
        updatedTx = this.stateMachine.transitionTo(
          txId,
          TxState.TX_CONFIRMED,
          `Transaction confirmed: ${submissionResult.signature}`
        );
        this.logAudit('SUBMIT_CONFIRMED', updatedTx);
      } else {
        updatedTx = this.stateMachine.transitionTo(
          txId,
          TxState.TX_FAILED,
          submissionResult.error || 'Submission failed'
        );
        this.logAudit('SUBMIT_FAILED', updatedTx);
      }
      
      return updatedTx;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Record deterministic failure submission result
      const failureResult: SubmissionResult = {
        submissionId: `sub_fail_${Date.now()}`,
        success: false,
        rpcEndpointId: 'unknown',
        rpcRouteId: undefined,
        timestamp: Date.now(),
        error: errorMessage,
      };
      this.stateMachine.updateTransaction(txId, { submissionResult: failureResult });
      
      try {
        const failedTx = this.stateMachine.transitionTo(
          txId,
          TxState.TX_FAILED,
          errorMessage
        );
        this.logAudit('SUBMIT_FAILED', failedTx);
        return failedTx;
      } catch {
        const existing = this.stateMachine.getTransaction(txId)!;
        this.logAudit('SUBMIT_FAILED', existing);
        return existing;
      }
    } finally {
      this.persistSnapshot();
    }
  }
  
  /**
   * Get whether intent is enforced for signing
   */
  isIntentEnforcedForSigning(): boolean {
    return this.intentManager.isIntentEnforcedForSigning();
  }
  
  /**
   * Clear all transactions for a context
   */
  clearContext(contextId: ContextId): number {
    // Also clear intents and routes for the context
    this.intentManager.clearContext(contextId);
    this.routeManager.clearContext(contextId);
    
    // Clear tx-specific route data for transactions in this context
    const txs = this.stateMachine.getContextTransactions(contextId);
    for (const tx of txs) {
      this.txRoutes.delete(tx.txId);
      this.txBlockhash.delete(tx.txId);
      this.txSlot.delete(tx.txId);
    }
    
    return this.stateMachine.clearContext(contextId);
  }
  
  /**
   * Clear all transactions
   */
  clearAll(): void {
    this.intentManager.clear();
    this.routeManager.clear();
    this.stateMachine.clear();
    this.txBlockhash.clear();
    this.txSlot.clear();
    this.txRoutes.clear();
    this.persistSnapshot();
  }

  /**
   * Best-effort audit log for submission lifecycle stages.
   */
  private logAudit(stage: AuditStage, tx: TxObject): void {
    try {
      this.auditLogger.record({
        stage,
        txId: tx.txId,
        contextId: tx.contextId,
        state: tx.state,
      });
    } catch {
      // logging is best-effort; never throw
    }
  }

  /**
   * Persist current transactions to storage.
   */
  private persistSnapshot(): void {
    try {
      const snapshot = {
        transactions: this.stateMachine.getAllTransactions(),
      };
      this.persistence.save(snapshot);
    } catch {
      // Persistence is best-effort; ignore failures to avoid behavior changes.
    }
  }

  /**
   * Restore transactions from storage into the state machine.
   */
  private restoreFromPersistence(): void {
    try {
      const snapshot = this.persistence.load();
      if (snapshot && Array.isArray(snapshot.transactions)) {
        this.stateMachine.hydrate(snapshot.transactions);
      }
    } catch {
      // If restore fails, continue with empty in-memory state.
    }
  }
}

// Singleton instance
let txPipeline: TxPipeline | null = null;

/**
 * Get the TxPipeline singleton
 */
export function getTxPipeline(): TxPipeline {
  if (!txPipeline) {
    txPipeline = new TxPipeline();
  }
  return txPipeline;
}

/**
 * Reset the TxPipeline singleton (for testing)
 */
export function resetTxPipeline(): void {
  if (txPipeline) {
    txPipeline.clearAll();
  }
  txPipeline = null;
}


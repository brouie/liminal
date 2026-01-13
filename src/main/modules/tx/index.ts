/**
 * Liminal - Transaction Modules
 * 
 * Exports for transaction pipeline components.
 * 
 * PHASE 3.0: DRY-RUN ONLY
 * - NO real Solana RPC calls
 * - NO signing
 * - NO actual execution
 */

export {
  TxStateMachine,
  getTxStateMachine,
  resetTxStateMachine,
  InvalidTxStateTransitionError,
  TxNotFoundError,
} from './TxStateMachine';

export { TxClassifier, getTxClassifier } from './TxClassifier';

export { TxRiskScorer, getTxRiskScorer } from './TxRiskScorer';

export { StrategySelector, getStrategySelector } from './StrategySelector';

export { DryRunExecutor, getDryRunExecutor } from './DryRunExecutor';

export { TxPipeline, getTxPipeline, resetTxPipeline } from './TxPipeline';
export { getTxAuditLogger, resetTxAuditLogger } from './TxAuditLogger';

export {
  TxSubmissionGate,
  getTxSubmissionGate,
  resetTxSubmissionGate,
  SubmissionBlockedError,
  createBlockingProxy,
  assertNoSubmissionMethods,
  assertSubmissionBlocked,
  type BlockedSubmissionResult,
} from './TxSubmissionGate';

export {
  IntentManager,
  getIntentManager,
  resetIntentManager,
  IntentNotFoundError,
  IntentExpiredError,
  IntentAlreadyConsumedError,
  IntentImmutableError,
} from './IntentManager';


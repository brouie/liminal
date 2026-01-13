/**
 * AI IPC Handlers
 * 
 * Handles communication between main and renderer for AI features.
 * 
 * PHASE 2 RULES:
 * - All AI operations are READ-ONLY
 * - AI does NOT affect enforcement
 * - AI output is DISPLAY ONLY
 * 
 * PHASE 2.2 ADDITION:
 * - Policy simulation is PREVIEW ONLY
 * - Simulation does NOT affect enforcement
 * 
 * NO Solana, NO wallets, NO transactions.
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { AI_IPC_CHANNELS, SimulationMode } from '../../shared/ai-types';
import { ContextId } from '../../shared/types';
import { getAIPrivacyAgent } from '../modules/ai/AIPrivacyAgent';

export function setupAIIpcHandlers(): void {
  const aiAgent = getAIPrivacyAgent();

  // ============ Telemetry ============

  /**
   * Get telemetry snapshot for a context
   * READ-ONLY operation
   */
  ipcMain.handle(
    AI_IPC_CHANNELS.TELEMETRY_GET,
    async (_event: IpcMainInvokeEvent, contextId: ContextId) => {
      return aiAgent.getTelemetry(contextId);
    }
  );

  // ============ Classification ============

  /**
   * Get AI classification for a context
   * READ-ONLY operation - does not affect enforcement
   */
  ipcMain.handle(
    AI_IPC_CHANNELS.CLASSIFY,
    async (_event: IpcMainInvokeEvent, contextId: ContextId, forceRefresh?: boolean) => {
      return aiAgent.classify(contextId, forceRefresh);
    }
  );

  /**
   * Subscribe to classification updates for a context
   */
  ipcMain.on(
    AI_IPC_CHANNELS.CLASSIFICATION_SUBSCRIBE,
    (event, contextId: ContextId) => {
      const unsubscribe = aiAgent.subscribe(contextId, (classification) => {
        event.sender.send(AI_IPC_CHANNELS.CLASSIFICATION_UPDATE, classification);
      });

      // Clean up when renderer is destroyed
      event.sender.once('destroyed', () => {
        unsubscribe();
      });
    }
  );

  // ============ Classifier Info ============

  /**
   * Get list of available classifiers
   * READ-ONLY operation
   */
  ipcMain.handle(
    AI_IPC_CHANNELS.CLASSIFIERS_LIST,
    async () => {
      return aiAgent.getAvailableClassifiers();
    }
  );

  // ============ Phase 2.2: Policy Simulation (PREVIEW ONLY) ============

  /**
   * Get AI classification with policy simulation preview
   * READ-ONLY operation - simulation does NOT affect enforcement
   */
  ipcMain.handle(
    AI_IPC_CHANNELS.CLASSIFY_WITH_SIMULATION,
    async (_event: IpcMainInvokeEvent, contextId: ContextId, forceRefresh?: boolean) => {
      return aiAgent.classifyWithSimulation(contextId, forceRefresh);
    }
  );

  /**
   * Run policy simulation only (no classification)
   * PURE FUNCTION - no side effects
   * Output is PREVIEW ONLY - does NOT affect enforcement
   */
  ipcMain.handle(
    AI_IPC_CHANNELS.SIMULATE,
    async (_event: IpcMainInvokeEvent, contextId: ContextId, mode?: SimulationMode) => {
      if (mode) {
        return aiAgent.simulateMode(contextId, mode);
      }
      return aiAgent.simulateAllModes(contextId);
    }
  );

  // ============ Phase 2.4: Trace Operations (AUDIT ONLY) ============

  /**
   * Get most recent trace for a context
   * READ-ONLY - for audit purposes
   */
  ipcMain.handle(
    AI_IPC_CHANNELS.TRACE_GET,
    async (_event: IpcMainInvokeEvent, contextId: ContextId, traceId?: string) => {
      if (traceId) {
        return aiAgent.getTraceById(contextId, traceId);
      }
      return aiAgent.getLatestTrace(contextId);
    }
  );

  /**
   * List all traces for a context
   * READ-ONLY - for audit purposes
   */
  ipcMain.handle(
    AI_IPC_CHANNELS.TRACE_LIST,
    async (_event: IpcMainInvokeEvent, contextId: ContextId) => {
      return aiAgent.listTraces(contextId);
    }
  );

  /**
   * Export trace as JSON
   * Manual export only - no auto-export
   */
  ipcMain.handle(
    AI_IPC_CHANNELS.TRACE_EXPORT,
    async (_event: IpcMainInvokeEvent, contextId: ContextId, traceId: string) => {
      const storedTrace = aiAgent.getTraceById(contextId, traceId);
      if (!storedTrace) {
        return null;
      }
      return aiAgent.exportTrace(storedTrace.trace);
    }
  );
}


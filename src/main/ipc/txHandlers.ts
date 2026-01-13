/**
 * Liminal - Transaction IPC Handlers
 * 
 * IPC handlers for transaction pipeline operations.
 * 
 * PHASE 3.0: DRY-RUN ONLY
 * - NO real Solana RPC calls
 * - NO signing
 * - NO actual execution
 */

import { ipcMain } from 'electron';
import { TX_IPC_CHANNELS, SimulatedTxPayload } from '../../shared/tx-types';
import { ContextId } from '../../shared/types';
import { getTxPipeline } from '../modules/tx';

/**
 * Setup transaction IPC handlers
 */
export function setupTxIpcHandlers(): void {
  const pipeline = getTxPipeline();
  
  /**
   * Create a new simulated transaction
   */
  ipcMain.handle(
    TX_IPC_CHANNELS.TX_CREATE,
    async (_event, contextId: ContextId, payload: SimulatedTxPayload) => {
      try {
        const tx = pipeline.createTransaction(contextId, payload);
        return { success: true, data: tx };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );
  
  /**
   * Get transaction by ID
   */
  ipcMain.handle(TX_IPC_CHANNELS.TX_GET, async (_event, txId: string) => {
    try {
      const tx = pipeline.getTransaction(txId);
      if (!tx) {
        return { success: false, error: 'Transaction not found' };
      }
      return { success: true, data: tx };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });
  
  /**
   * Run full dry-run pipeline
   */
  ipcMain.handle(
    TX_IPC_CHANNELS.TX_DRY_RUN,
    async (_event, txId: string, originTrust: number = 50) => {
      try {
        const tx = await pipeline.runDryRunPipeline(txId, originTrust);
        return { success: true, data: tx };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );
  
  /**
   * Abort a transaction
   */
  ipcMain.handle(
    TX_IPC_CHANNELS.TX_ABORT,
    async (_event, txId: string, reason: string) => {
      try {
        const tx = pipeline.abortTransaction(txId, reason);
        return { success: true, data: tx };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );
  
  /**
   * Get transaction receipt data
   */
  ipcMain.handle(TX_IPC_CHANNELS.TX_RECEIPT, async (_event, txId: string) => {
    try {
      const receipt = pipeline.getReceiptData(txId);
      if (!receipt) {
        return { success: false, error: 'Receipt not available' };
      }
      return { success: true, data: receipt };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });
}


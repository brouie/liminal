/**
 * Liminal - Wallet IPC Handlers
 * 
 * IPC handlers for wallet adapter operations.
 * 
 * PHASE 3.1: Signing ONLY
 * - NO sendTransaction
 * - NO RPC submission
 * - NO funds movement
 */

import { ipcMain } from 'electron';
import { TX_IPC_CHANNELS } from '../../shared/tx-types';
import { ContextId } from '../../shared/types';
import { getLiminalWalletAdapter } from '../modules/wallet';
import { getTxPipeline } from '../modules/tx';

/**
 * Setup wallet IPC handlers
 */
export function setupWalletIpcHandlers(): void {
  const walletAdapter = getLiminalWalletAdapter();
  const pipeline = getTxPipeline();
  
  /**
   * Connect wallet for scope
   */
  ipcMain.handle(
    TX_IPC_CHANNELS.WALLET_CONNECT,
    async (_event, origin: string, contextId: ContextId) => {
      try {
        const result = await walletAdapter.connect(origin, contextId);
        return { success: result.success, data: result, error: result.error };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );
  
  /**
   * Disconnect wallet for scope
   */
  ipcMain.handle(
    TX_IPC_CHANNELS.WALLET_DISCONNECT,
    async (_event, origin: string, contextId: ContextId) => {
      try {
        walletAdapter.disconnect(origin, contextId);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );
  
  /**
   * Sign single transaction (NO submission)
   */
  ipcMain.handle(
    TX_IPC_CHANNELS.WALLET_SIGN,
    async (_event, txId: string) => {
      try {
        const tx = await pipeline.signTransaction(txId);
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
   * Sign multiple transactions (NO submission)
   */
  ipcMain.handle(
    TX_IPC_CHANNELS.WALLET_SIGN_ALL,
    async (_event, txIds: string[]) => {
      try {
        const results = await walletAdapter.signAllTransactions(txIds);
        return { success: true, data: results };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );
  
  /**
   * Get wallet connection status
   */
  ipcMain.handle(
    TX_IPC_CHANNELS.WALLET_STATUS,
    async (_event, origin: string, contextId: ContextId) => {
      try {
        const connected = walletAdapter.isConnected(origin, contextId);
        const scope = walletAdapter.getScope(origin, contextId);
        return { success: true, data: { connected, scope } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );
  
  /**
   * Revoke wallet scope
   */
  ipcMain.handle(
    TX_IPC_CHANNELS.WALLET_REVOKE,
    async (_event, target: { origin?: string; contextId?: ContextId }) => {
      try {
        if (target.contextId) {
          walletAdapter.revokeContext(target.contextId);
        }
        if (target.origin) {
          walletAdapter.revokeOrigin(target.origin);
        }
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );
}


/**
 * IPC Handlers
 * 
 * Handles communication between main and renderer processes.
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS, ProxyConfig, ContextId } from '../../shared/types';
import { getContextManager } from '../modules/ContextManager';
import { getProxyManager } from '../modules/ProxyManager';
import { getReceiptStore } from '../modules/ReceiptStore';
import { getMainWindow } from '../windows/mainWindow';
import { setupTxIpcHandlers } from './txHandlers';
import { setupWalletIpcHandlers } from './walletHandlers';

export function setupIpcHandlers(): void {
  const contextManager = getContextManager();
  const proxyManager = getProxyManager();
  const receiptStore = getReceiptStore();
  const mainWindow = getMainWindow();

  // ============ Context Management ============

  ipcMain.handle(IPC_CHANNELS.CONTEXT_CREATE, async (_event: IpcMainInvokeEvent, proxyConfig?: ProxyConfig) => {
    return contextManager.createContext(proxyConfig);
  });

  ipcMain.handle(IPC_CHANNELS.CONTEXT_DESTROY, async (_event: IpcMainInvokeEvent, contextId: ContextId) => {
    proxyManager.removeContext(contextId);
    receiptStore.deleteReceipt(contextId);
    return contextManager.destroyContext(contextId);
  });

  ipcMain.handle(IPC_CHANNELS.CONTEXT_ROTATE, async (_event: IpcMainInvokeEvent, contextId: ContextId, newProxy?: ProxyConfig) => {
    try {
      // Rotate identity in context manager
      // This handles the full state machine cycle: ACTIVE -> ROTATING -> DRAINING -> POLICY_EVAL -> ROUTE_SET -> ACTIVE
      const context = await contextManager.rotateIdentity(contextId, newProxy);
      if (!context) return null;

      // Clear receipt (rotateIdentity already clears session data and updates proxy)
      receiptStore.clearReceipt(contextId, newProxy);

      return context;
    } catch (error) {
      console.error('Failed to rotate identity:', error);
      return null;
    }
  });

  ipcMain.handle(IPC_CHANNELS.CONTEXT_GET, async (_event: IpcMainInvokeEvent, contextId: ContextId) => {
    return contextManager.getContext(contextId);
  });

  ipcMain.handle(IPC_CHANNELS.CONTEXT_LIST, async () => {
    return contextManager.getAllContexts();
  });

  // ============ Proxy Management ============

  ipcMain.handle(IPC_CHANNELS.PROXY_SET, async (_event: IpcMainInvokeEvent, contextId: ContextId, config: ProxyConfig) => {
    const validation = proxyManager.validateConfig(config);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }
    // setProxy now enforces state check (must be in CTX_ROUTE_SET)
    return proxyManager.setProxy(contextId, config);
  });

  ipcMain.handle(IPC_CHANNELS.PROXY_GET, async (_event: IpcMainInvokeEvent, contextId: ContextId) => {
    return proxyManager.getProxy(contextId);
  });

  // ============ Receipt Management ============

  ipcMain.handle(IPC_CHANNELS.RECEIPT_GET, async (_event: IpcMainInvokeEvent, contextId: ContextId) => {
    return receiptStore.getReceipt(contextId);
  });

  // Subscribe to receipt updates for a context
  ipcMain.on(IPC_CHANNELS.RECEIPT_SUBSCRIBE, (event, contextId: ContextId) => {
    const unsubscribe = receiptStore.subscribe(contextId, (receipt) => {
      event.sender.send(IPC_CHANNELS.RECEIPT_UPDATE, receipt);
    });

    // Clean up when renderer is destroyed
    event.sender.once('destroyed', () => {
      unsubscribe();
    });
  });

  // ============ Tab Management ============

  ipcMain.handle(IPC_CHANNELS.TAB_CREATE, async (_event: IpcMainInvokeEvent, url?: string) => {
    return mainWindow.createTab(url || 'about:blank');
  });

  ipcMain.handle(IPC_CHANNELS.TAB_CLOSE, async (_event: IpcMainInvokeEvent, tabId: number) => {
    return mainWindow.closeTab(tabId);
  });

  ipcMain.handle(IPC_CHANNELS.TAB_NAVIGATE, async (_event: IpcMainInvokeEvent, tabId: number, url: string) => {
    return mainWindow.navigateTab(tabId, url);
  });

  // ============ Navigation ============

  ipcMain.handle(IPC_CHANNELS.NAV_BACK, async (_event: IpcMainInvokeEvent, tabId: number) => {
    return mainWindow.goBack(tabId);
  });

  ipcMain.handle(IPC_CHANNELS.NAV_FORWARD, async (_event: IpcMainInvokeEvent, tabId: number) => {
    return mainWindow.goForward(tabId);
  });

  ipcMain.handle(IPC_CHANNELS.NAV_RELOAD, async (_event: IpcMainInvokeEvent, tabId: number) => {
    return mainWindow.reload(tabId);
  });

  // ============ Transaction Pipeline (Phase 3.0 - DRY-RUN ONLY) ============
  setupTxIpcHandlers();
  
  // ============ Wallet Adapter (Phase 3.1 - SIGNING ONLY) ============
  setupWalletIpcHandlers();
}


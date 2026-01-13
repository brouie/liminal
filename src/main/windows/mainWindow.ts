/**
 * Main Window Management
 * 
 * Creates and manages the main browser window.
 * Integrates with the Context State Machine for proper lifecycle management.
 * 
 * Privacy Hardening (Phase 1.2):
 * - Injects fingerprint protection scripts into each BrowserView
 * 
 * NO AI, NO Solana, NO wallets.
 */

import { BrowserWindow, BrowserView, WebContents } from 'electron';
import { join } from 'path';
import { getContextManager } from '../modules/ContextManager';
import { getInterceptor } from '../modules/Interceptor';
import { getReceiptStore } from '../modules/ReceiptStore';
import { getProxyManager } from '../modules/ProxyManager';
import { getFingerprintProtection } from '../modules/FingerprintProtection';
import { ContextId, Tab, ContextState } from '../../shared/types';

interface ManagedTab {
  view: BrowserView;
  contextId: ContextId;
  tab: Tab;
}

export class MainWindow {
  private window: BrowserWindow | null = null;
  private tabs: Map<number, ManagedTab> = new Map();
  private activeTabId: number | null = null;

  /**
   * Create the main browser window
   */
  createWindow(): BrowserWindow {
    this.window = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 800,
      minHeight: 600,
      title: 'Liminal',
      backgroundColor: '#0a0a0f',
      webPreferences: {
        preload: join(__dirname, '../preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
      frame: false,
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#0a0a0f',
        symbolColor: '#ffffff',
        height: 40,
      },
    });

    // Load the renderer
    this.window.loadFile(join(__dirname, '../../renderer/index.html'));

    // Handle window close
    this.window.on('closed', () => {
      this.window = null;
      this.tabs.clear();
    });

    return this.window;
  }

  /**
   * Get the main window instance
   */
  getWindow(): BrowserWindow | null {
    return this.window;
  }

  /**
   * Create a new tab with isolated context
   * Follows the state machine flow: NEW -> POLICY_EVAL -> ROUTE_SET -> ACTIVE
   */
  async createTab(url: string = 'about:blank'): Promise<Tab | null> {
    if (!this.window) return null;

    const contextManager = getContextManager();
    const interceptor = getInterceptor();
    const receiptStore = getReceiptStore();
    const proxyManager = getProxyManager();

    // Step 1: Create isolated context (starts in CTX_NEW state)
    const context = contextManager.createContext();
    const session = contextManager.getSession(context.id);

    if (!session) {
      console.error('Failed to get session for new context');
      contextManager.setError(context.id, 'Failed to create session');
      return null;
    }

    try {
      // Step 2: Initialize context (NEW -> POLICY_EVAL -> ROUTE_SET)
      await contextManager.initializeContext(context.id);

      // Step 3: Set proxy in ROUTE_SET state (using internal method during initialization)
      await proxyManager.setProxyInternal(context.id, context.proxy);

      // Step 4: Activate context (ROUTE_SET -> ACTIVE)
      contextManager.activateContext(context.id);
    } catch (error) {
      console.error('Failed to initialize context:', error);
      contextManager.setError(context.id, String(error));
      return null;
    }

    // Create receipt for this context
    receiptStore.createReceipt(context.id, context.proxy);

    // Attach interceptor to session (will now allow requests since context is ACTIVE)
    interceptor.attachToSession(session, context.id, (webContentsId: number) => {
      const managedTab = Array.from(this.tabs.values()).find(
        t => t.view.webContents.id === webContentsId
      );
      return managedTab?.tab.url || null;
    });

    // Create BrowserView with isolated session
    const view = new BrowserView({
      webPreferences: {
        session,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    const tabId = view.webContents.id;

    // ========== Fingerprint Protection Injection ==========
    // Inject fingerprint protection script before any page JavaScript runs
    const fingerprintProtection = getFingerprintProtection();
    const injectionScript = fingerprintProtection.generateInjectionScript(context.id);
    
    // Inject on every navigation (before DOM is ready)
    view.webContents.on('did-start-navigation', () => {
      view.webContents.executeJavaScript(injectionScript).catch((err) => {
        // May fail on about:blank or chrome:// URLs, which is expected
        if (!err.message?.includes('about:blank')) {
          console.error('Failed to inject fingerprint protection:', err);
        }
      });
    });

    // Create tab state
    const tab: Tab = {
      id: tabId,
      contextId: context.id,
      url,
      title: 'New Tab',
      loading: true,
      active: false,
    };

    // Register tab with context
    contextManager.addTabToContext(context.id, tabId);

    // Store managed tab
    this.tabs.set(tabId, { view, contextId: context.id, tab });

    // Handle navigation events
    view.webContents.on('did-start-loading', () => {
      const managedTab = this.tabs.get(tabId);
      if (managedTab) {
        managedTab.tab.loading = true;
        this.notifyTabUpdate(managedTab.tab);
      }
    });

    view.webContents.on('did-stop-loading', () => {
      const managedTab = this.tabs.get(tabId);
      if (managedTab) {
        managedTab.tab.loading = false;
        this.notifyTabUpdate(managedTab.tab);
      }
    });

    view.webContents.on('did-navigate', (_event, navUrl) => {
      const managedTab = this.tabs.get(tabId);
      if (managedTab) {
        managedTab.tab.url = navUrl;
        this.notifyTabUpdate(managedTab.tab);
      }
    });

    view.webContents.on('did-navigate-in-page', (_event, navUrl) => {
      const managedTab = this.tabs.get(tabId);
      if (managedTab) {
        managedTab.tab.url = navUrl;
        this.notifyTabUpdate(managedTab.tab);
      }
    });

    view.webContents.on('page-title-updated', (_event, title) => {
      const managedTab = this.tabs.get(tabId);
      if (managedTab) {
        managedTab.tab.title = title;
        this.notifyTabUpdate(managedTab.tab);
      }
    });

    // Navigate to URL (only works now because context is in ACTIVE state)
    if (url !== 'about:blank') {
      view.webContents.loadURL(url);
    }

    // Activate this tab in the UI
    this.activateTab(tabId);

    return tab;
  }

  /**
   * Activate a tab (show it in the window)
   */
  activateTab(tabId: number): boolean {
    if (!this.window) return false;

    const managedTab = this.tabs.get(tabId);
    if (!managedTab) return false;

    // Deactivate previous tab
    if (this.activeTabId !== null) {
      const prevTab = this.tabs.get(this.activeTabId);
      if (prevTab) {
        prevTab.tab.active = false;
        this.window.removeBrowserView(prevTab.view);
      }
    }

    // Activate new tab
    managedTab.tab.active = true;
    this.activeTabId = tabId;
    this.window.addBrowserView(managedTab.view);
    
    // Position the view (leaving space for toolbar and receipt panel)
    this.updateViewBounds();

    return true;
  }

  /**
   * Update view bounds based on window size
   */
  updateViewBounds(): void {
    if (!this.window || this.activeTabId === null) return;

    const managedTab = this.tabs.get(this.activeTabId);
    if (!managedTab) return;

    const bounds = this.window.getContentBounds();
    const toolbarHeight = 90; // Top toolbar area
    const receiptPanelWidth = 320; // Right side receipt panel

    managedTab.view.setBounds({
      x: 0,
      y: toolbarHeight,
      width: bounds.width - receiptPanelWidth,
      height: bounds.height - toolbarHeight,
    });
  }

  /**
   * Close a tab
   */
  closeTab(tabId: number): boolean {
    const managedTab = this.tabs.get(tabId);
    if (!managedTab) return false;

    const contextManager = getContextManager();
    const receiptStore = getReceiptStore();

    // Remove from context
    contextManager.removeTabFromContext(managedTab.contextId, tabId);

    // Clean up context if no more tabs use it
    const context = contextManager.getContext(managedTab.contextId);
    if (context && context.tabIds.length === 0) {
      contextManager.destroyContext(managedTab.contextId);
      receiptStore.deleteReceipt(managedTab.contextId);
    }

    // Remove view from window if active
    if (this.window && this.activeTabId === tabId) {
      this.window.removeBrowserView(managedTab.view);
      this.activeTabId = null;

      // Activate another tab if available
      const remainingTabs = Array.from(this.tabs.keys()).filter(id => id !== tabId);
      if (remainingTabs.length > 0) {
        this.activateTab(remainingTabs[0]);
      }
    }

    // Destroy the view
    (managedTab.view.webContents as any).destroy?.();
    this.tabs.delete(tabId);

    return true;
  }

  /**
   * Navigate a tab to a URL
   */
  navigateTab(tabId: number, url: string): boolean {
    const managedTab = this.tabs.get(tabId);
    if (!managedTab) return false;

    // Ensure URL has protocol
    let navigateUrl = url;
    if (!url.match(/^https?:\/\//i) && !url.startsWith('about:')) {
      if (url.includes('.') && !url.includes(' ')) {
        navigateUrl = `https://${url}`;
      } else {
        // Treat as search query
        navigateUrl = `https://duckduckgo.com/?q=${encodeURIComponent(url)}`;
      }
    }

    managedTab.view.webContents.loadURL(navigateUrl);
    return true;
  }

  /**
   * Navigation controls
   */
  goBack(tabId: number): boolean {
    const managedTab = this.tabs.get(tabId);
    if (!managedTab) return false;
    if (managedTab.view.webContents.canGoBack()) {
      managedTab.view.webContents.goBack();
      return true;
    }
    return false;
  }

  goForward(tabId: number): boolean {
    const managedTab = this.tabs.get(tabId);
    if (!managedTab) return false;
    if (managedTab.view.webContents.canGoForward()) {
      managedTab.view.webContents.goForward();
      return true;
    }
    return false;
  }

  reload(tabId: number): boolean {
    const managedTab = this.tabs.get(tabId);
    if (!managedTab) return false;
    managedTab.view.webContents.reload();
    return true;
  }

  /**
   * Get all tabs
   */
  getAllTabs(): Tab[] {
    return Array.from(this.tabs.values()).map(t => t.tab);
  }

  /**
   * Get active tab
   */
  getActiveTab(): Tab | null {
    if (this.activeTabId === null) return null;
    return this.tabs.get(this.activeTabId)?.tab || null;
  }

  /**
   * Get tab by ID
   */
  getTab(tabId: number): Tab | null {
    return this.tabs.get(tabId)?.tab || null;
  }

  /**
   * Notify renderer of tab update
   */
  private notifyTabUpdate(tab: Tab): void {
    if (this.window) {
      this.window.webContents.send('tab:update', tab);
    }
  }

  /**
   * Handle window resize
   */
  setupResizeHandler(): void {
    if (!this.window) return;

    this.window.on('resize', () => {
      this.updateViewBounds();
    });
  }
}

// Singleton instance
let instance: MainWindow | null = null;

export function getMainWindow(): MainWindow {
  if (!instance) {
    instance = new MainWindow();
  }
  return instance;
}


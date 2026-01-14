import { app, BrowserWindow, ipcMain, BrowserView } from 'electron';
import path from 'path';
import fs from 'fs';
import { isProd } from '../main/config/env';
import { submitTransaction, getTransactionStatus, getReceipt } from '../main/api';
import { getInvariantManager } from '../main/modules/invariants';
import { getExecutionPolicyManager } from '../main/modules/policy';

type TabInfo = {
  id: string;
  partition: string;
  view: BrowserView;
  url: string;
};

type PersistedSession = {
  activeTabId?: string;
  tabs: { id: string; partition: string; url: string }[];
};

const tabs = new Map<string, TabInfo>();
let mainWindow: BrowserWindow | null = null;
let tabCounter = 0;
let activeTabId: string | null = null;

function sessionFilePath(): string {
  const dir = process.env.LIMINAL_BROWSER_SESSION_PATH || app.getPath('userData');
  return path.join(dir, 'browser-session.json');
}

function persistSession(): void {
  try {
    const data: PersistedSession = {
      activeTabId: activeTabId || undefined,
      tabs: Array.from(tabs.values()).map(t => ({
        id: t.id,
        partition: t.partition,
        url: t.url,
      })),
    };
    fs.writeFileSync(sessionFilePath(), JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    // best effort
  }
}

function restoreSession(): PersistedSession | null {
  try {
    const raw = fs.readFileSync(sessionFilePath(), 'utf-8');
    return JSON.parse(raw) as PersistedSession;
  } catch {
    return null;
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => {
    mainWindow?.webContents.send('liminal:block', { reason: 'window.open blocked' });
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      event.preventDefault();
      mainWindow?.webContents.send('liminal:block', { reason: 'Navigation blocked (non-https)', url });
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function setActiveTab(tabId: string) {
  if (!mainWindow) return;
  const tab = tabs.get(tabId);
  if (!tab) return;
  activeTabId = tabId;
  mainWindow.setBrowserView(tab.view);
  tab.view.setBounds({
    x: 0,
    y: 72,
    width: mainWindow.getContentBounds().width,
    height: mainWindow.getContentBounds().height - 72,
  });
  tab.view.setAutoResize({ width: true, height: true });
  persistSession();
}

function createContext(initialUrl = 'https://example.com/', presetId?: string, presetPartition?: string) {
  if (!mainWindow) return null;
  const contextId = presetId || `ctx_${++tabCounter}`;
  const partition = presetPartition || `persist:${contextId}`;
  const view = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      partition,
    },
  });
  view.webContents.setWindowOpenHandler(() => {
    mainWindow?.webContents.send('liminal:block', { reason: 'window.open blocked', contextId });
    return { action: 'deny' };
  });
  view.webContents.on('will-navigate', (event, url) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      event.preventDefault();
      mainWindow?.webContents.send('liminal:block', { reason: 'Navigation blocked (non-https)', url, contextId });
    }
  });
  view.webContents.loadURL(initialUrl);

  tabs.set(contextId, { id: contextId, partition, view, url: initialUrl });
  setActiveTab(contextId);
  return { contextId, partition, url: initialUrl };
}

function closeContext(contextId: string) {
  const info = tabs.get(contextId);
  if (!info) return false;
  tabs.delete(contextId);
  if (mainWindow) {
    mainWindow.removeBrowserView(info.view);
  }
  if (activeTabId === contextId) {
    const next = tabs.keys().next().value || null;
    activeTabId = next;
    if (next) {
      setActiveTab(next);
    }
  }
  persistSession();
  return true;
}

function listContexts() {
  return Array.from(tabs.values()).map(c => ({
    id: c.id,
    partition: c.partition,
    url: c.url,
    active: c.id === activeTabId,
  }));
}

function ensureHttps(url: string): { ok: boolean; url?: string; error?: string } {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      return { ok: false, error: 'Only HTTPS is allowed' };
    }
    return { ok: true, url: parsed.toString() };
  } catch {
    return { ok: false, error: 'Invalid URL' };
  }
}

async function navigate(contextId: string, url: string) {
  const tab = tabs.get(contextId);
  if (!tab) return { ok: false, error: 'Context not found' };
  const validated = ensureHttps(url);
  if (!validated.ok || !validated.url) {
    return { ok: false, error: validated.error || 'Invalid URL' };
  }
  try {
    await tab.view.webContents.loadURL(validated.url);
    tab.url = validated.url;
    persistSession();
    return { ok: true, url: validated.url };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Navigation failed' };
  }
}

function goBack(contextId: string) {
  const tab = tabs.get(contextId);
  if (!tab) return { ok: false, error: 'Context not found' };
  if (tab.view.webContents.canGoBack()) {
    tab.view.webContents.goBack();
  }
  return { ok: true };
}

function goForward(contextId: string) {
  const tab = tabs.get(contextId);
  if (!tab) return { ok: false, error: 'Context not found' };
  if (tab.view.webContents.canGoForward()) {
    tab.view.webContents.goForward();
  }
  return { ok: true };
}

function reload(contextId: string) {
  const tab = tabs.get(contextId);
  if (!tab) return { ok: false, error: 'Context not found' };
  tab.view.webContents.reload();
  return { ok: true };
}

function getBrowserStatus() {
  const invariantState = getInvariantManager().getState();
  const policyManager: any = getExecutionPolicyManager() as any;
  const policyState = typeof policyManager.getPolicyState === 'function'
    ? policyManager.getPolicyState()
    : policyManager.policy;
  return {
    activeTabId,
    contexts: listContexts(),
    killSwitch: invariantState.killSwitch?.state,
    invariantVersion: invariantState.version,
    policy: policyState
      ? {
          lockStatus: policyState.lockStatus,
          allowSubmission: policyState.flags?.allowSubmission,
          allowPrivateRail: policyState.flags?.allowPrivateRail,
        }
      : undefined,
  };
}

function setupIpc() {
  ipcMain.handle('liminal:createContext', () => {
    const ctx = createContext();
    return ctx || { error: 'Failed to create context' };
  });

  ipcMain.handle('liminal:closeContext', (_event, contextId: string) => closeContext(contextId));
  ipcMain.handle('liminal:listContexts', () => listContexts());
  ipcMain.handle('liminal:setActiveContext', (_event, contextId: string) => {
    setActiveTab(contextId);
    return { ok: true };
  });
  ipcMain.handle('liminal:navigate', (_event, payload: { contextId: string; url: string }) =>
    navigate(payload.contextId, payload.url)
  );
  ipcMain.handle('liminal:back', (_event, contextId: string) => goBack(contextId));
  ipcMain.handle('liminal:forward', (_event, contextId: string) => goForward(contextId));
  ipcMain.handle('liminal:reload', (_event, contextId: string) => reload(contextId));
  ipcMain.handle('liminal:getBrowserStatus', () => getBrowserStatus());

  ipcMain.handle('liminal:submitTransaction', async (_event, txId: string) => submitTransaction(txId));
  ipcMain.handle('liminal:getTransactionStatus', (_event, txId: string) => getTransactionStatus(txId));
  ipcMain.handle('liminal:getReceipt', (_event, txId: string) => getReceipt(txId));
}

app.whenReady().then(() => {
  if (!process.env.LIMINAL_ENV && !process.env.NODE_ENV) {
    process.env.LIMINAL_ENV = isProd() ? 'production' : 'development';
  }
  setupIpc();
  createMainWindow();

  // Restore session if present
  const session = restoreSession();
  if (session && session.tabs.length > 0) {
    session.tabs.forEach(tab => {
      const created = createContext(tab.url, tab.id, tab.partition);
      if (created) {
        const info = tabs.get(created.contextId);
        if (info) {
          info.url = tab.url;
        }
      }
    });
    if (session.activeTabId && tabs.has(session.activeTabId)) {
      setActiveTab(session.activeTabId);
    } else if (tabs.size > 0) {
      const firstTabId = tabs.keys().next().value;
      if (firstTabId) setActiveTab(firstTabId);
    }
  } else {
    createContext();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

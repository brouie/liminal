import { app, BrowserWindow, ipcMain, BrowserView } from 'electron';
import path from 'path';
import { isProd } from '../main/config/env';
import { submitTransaction, getTransactionStatus, getReceipt } from '../main/api';

type ContextInfo = {
  id: string;
  partition: string;
  view: BrowserView;
};

const contexts = new Map<string, ContextInfo>();
let mainWindow: BrowserWindow | null = null;
let contextCounter = 0;

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

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      event.preventDefault();
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function createContext() {
  if (!mainWindow) return null;
  const contextId = `ctx_${++contextCounter}`;
  const partition = `persist:${contextId}`;
  const view = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      partition,
    },
  });
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  view.webContents.on('will-navigate', (event, url) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      event.preventDefault();
    }
  });
  view.webContents.loadURL('https://example.com/');

  contexts.set(contextId, { id: contextId, partition, view });
  mainWindow.setBrowserView(view);
  view.setBounds({ x: 0, y: 40, width: mainWindow.getContentBounds().width, height: mainWindow.getContentBounds().height - 40 });
  view.setAutoResize({ width: true, height: true });
  return { contextId, partition };
}

function closeContext(contextId: string) {
  const info = contexts.get(contextId);
  if (!info) return false;
  contexts.delete(contextId);
  if (mainWindow) {
    mainWindow.removeBrowserView(info.view);
  }
  return true;
}

function listContexts() {
  return Array.from(contexts.values()).map(c => ({ id: c.id, partition: c.partition }));
}

function setupIpc() {
  ipcMain.handle('liminal:createContext', () => {
    const ctx = createContext();
    return ctx || { error: 'Failed to create context' };
  });

  ipcMain.handle('liminal:closeContext', (_event, contextId: string) => closeContext(contextId));
  ipcMain.handle('liminal:listContexts', () => listContexts());

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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

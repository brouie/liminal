/**
 * Liminal - Main Process Entry Point
 * 
 * Privacy-native browser execution environment.
 * 
 * Phase 1: Privacy execution runtime
 * Phase 2: AI observation layer (READ-ONLY)
 * 
 * NO Solana, NO wallets, NO transactions yet.
 */

import { app, BrowserWindow } from 'electron';
import { getMainWindow } from './windows/mainWindow';
import { setupIpcHandlers } from './ipc/handlers';
import { setupAIIpcHandlers } from './ipc/aiHandlers';
import { getInterceptor } from './modules/Interceptor';
import { getAIPrivacyAgent } from './modules/ai/AIPrivacyAgent';

// Disable hardware acceleration for more consistent behavior
app.disableHardwareAcceleration();

// Security: Disable navigation to file:// URLs
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.protocol === 'file:') {
      event.preventDefault();
    }
  });

  // Prevent new windows from being opened
  contents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
});

// Initialize when Electron is ready
app.whenReady().then(() => {
  console.log('Liminal starting...');

  // Initialize interceptor (loads blocklist)
  getInterceptor();

  // Initialize AI Privacy Agent (Phase 2 - READ-ONLY observation)
  getAIPrivacyAgent();

  // Set up IPC handlers
  setupIpcHandlers();
  setupAIIpcHandlers();

  // Create main window
  const mainWindow = getMainWindow();
  const window = mainWindow.createWindow();
  mainWindow.setupResizeHandler();

  // Create initial tab
  mainWindow.createTab('https://duckduckgo.com');

  // Handle macOS dock click
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow.createWindow();
    }
  });

  console.log('Liminal ready.');
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Security: Prevent external protocol handlers
app.on('open-url', (event) => {
  event.preventDefault();
});


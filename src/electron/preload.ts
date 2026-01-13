import { contextBridge, ipcRenderer } from 'electron';

const api = {
  // Tabs / contexts
  createContext: () => ipcRenderer.invoke('liminal:createContext'),
  closeContext: (contextId: string) => ipcRenderer.invoke('liminal:closeContext', contextId),
  listContexts: () => ipcRenderer.invoke('liminal:listContexts'),
  setActiveContext: (contextId: string) => ipcRenderer.invoke('liminal:setActiveContext', contextId),
  navigate: (contextId: string, url: string) => ipcRenderer.invoke('liminal:navigate', { contextId, url }),
  back: (contextId: string) => ipcRenderer.invoke('liminal:back', contextId),
  forward: (contextId: string) => ipcRenderer.invoke('liminal:forward', contextId),
  reload: (contextId: string) => ipcRenderer.invoke('liminal:reload', contextId),
  getBrowserStatus: () => ipcRenderer.invoke('liminal:getBrowserStatus'),
  onBlock: (callback: (payload: { reason: string; contextId?: string; url?: string }) => void) => {
    ipcRenderer.on('liminal:block', (_event, payload) => callback(payload));
  },

  // Submission API passthrough
  submitTransaction: (txId: string) => ipcRenderer.invoke('liminal:submitTransaction', txId),
  getTransactionStatus: (txId: string) => ipcRenderer.invoke('liminal:getTransactionStatus', txId),
  getReceipt: (txId: string) => ipcRenderer.invoke('liminal:getReceipt', txId),
};

export type LiminalPreloadApi = typeof api;

contextBridge.exposeInMainWorld('liminal', api);

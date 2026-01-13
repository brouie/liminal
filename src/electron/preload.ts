import { contextBridge, ipcRenderer } from 'electron';

const api = {
  createContext: () => ipcRenderer.invoke('liminal:createContext'),
  closeContext: (contextId: string) => ipcRenderer.invoke('liminal:closeContext', contextId),
  listContexts: () => ipcRenderer.invoke('liminal:listContexts'),
  submitTransaction: (txId: string) => ipcRenderer.invoke('liminal:submitTransaction', txId),
  getTransactionStatus: (txId: string) => ipcRenderer.invoke('liminal:getTransactionStatus', txId),
  getReceipt: (txId: string) => ipcRenderer.invoke('liminal:getReceipt', txId),
};

export type LiminalPreloadApi = typeof api;

contextBridge.exposeInMainWorld('liminal', api);

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getShockers: () => ipcRenderer.invoke('shockhub:getShockers'),
  control: (shocks) => ipcRenderer.invoke('shockhub:control', shocks),
  emergencyStop: () => ipcRenderer.invoke('shockhub:emergencyStop'),
  getLeagueLiveData: () => ipcRenderer.invoke('league:getLiveData'),
  getOscStatus: () => ipcRenderer.invoke('osc:status'),
  getActionLogs: () => ipcRenderer.invoke('logs:getActions'),
  getDebugLogs: () => ipcRenderer.invoke('debug:getLogs'),
  clearActionLogs: () => ipcRenderer.invoke('logs:clearActions'),
  clearDebugLogs: () => ipcRenderer.invoke('debug:clearLogs'),
  exportActionLogs: (payload) => ipcRenderer.invoke('logs:exportActions', payload),

  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (cfg) => ipcRenderer.invoke('config:set', cfg),
  testApiKey: (apiKey) => ipcRenderer.invoke('config:testApiKey', apiKey),
  exportConfig: () => ipcRenderer.invoke('config:export'),
  importConfig: () => ipcRenderer.invoke('config:import'),
  resetConfig: () => ipcRenderer.invoke('config:reset')
});
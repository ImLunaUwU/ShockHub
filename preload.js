const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getShockers: () => ipcRenderer.invoke('openshock:getShockers'),
  control: (shocks) => ipcRenderer.invoke('openshock:control', shocks),
  emergencyStop: () => ipcRenderer.invoke('openshock:emergencyStop'),

  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (cfg) => ipcRenderer.invoke('config:set', cfg)
});
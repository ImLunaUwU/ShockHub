import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  loadConfig: () => ipcRenderer.invoke("config:load"),
  saveConfig: (cfg) => ipcRenderer.invoke("config:save", cfg),

  getShockers: () => ipcRenderer.invoke("openshock:getShockers"),
  execute: (data) => ipcRenderer.invoke("openshock:execute", data)
});
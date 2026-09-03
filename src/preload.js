import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('taskApi', {
  listWeek: (weekStart) => ipcRenderer.invoke('tasks:list-week', weekStart)
});

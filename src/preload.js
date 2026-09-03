import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('taskApi', {
  tasks: {
    create: (input) => ipcRenderer.invoke('tasks:create', input),
    listWeek: (weekStart) => ipcRenderer.invoke('tasks:list-week', weekStart)
  },
  sessions: {
    start: (input) => ipcRenderer.invoke('sessions:start', input),
    finish: (input) => ipcRenderer.invoke('sessions:finish', input),
    recordProgress: (input) => ipcRenderer.invoke('sessions:record-progress', input),
    listHistory: (taskId) => ipcRenderer.invoke('sessions:list-history', taskId)
  },
  reports: {
    progress: (filter) => ipcRenderer.invoke('reports:progress', filter)
  }
});

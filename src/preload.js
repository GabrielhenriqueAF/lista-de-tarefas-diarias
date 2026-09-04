const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, value) => ipcRenderer.invoke(channel, value);

contextBridge.exposeInMainWorld('routineApi', {
  activities: {
    create: (input) => invoke('activities:create', input),
    update: (input) => invoke('activities:update', input),
    archive: (id) => invoke('activities:archive', id),
    list: () => invoke('activities:list')
  },
  fronts: {
    create: (input) => invoke('fronts:create', input),
    update: (input) => invoke('fronts:update', input),
    list: (activityId) => invoke('fronts:list', activityId)
  },
  rules: {
    create: (input) => invoke('rules:create', input),
    update: (input) => invoke('rules:update', input),
    listWeek: (weekStart) => invoke('rules:list-week', weekStart)
  },
  blocks: {
    start: (input) => invoke('blocks:start', input),
    finish: (input) => invoke('blocks:finish', input),
    listToday: (date) => invoke('blocks:list-today', date),
    listHistory: (frontId) => invoke('blocks:list-history', frontId),
    listChecklist: (blockId) => invoke('blocks:list-checklist', blockId),
    toggleChecklist: (input) => invoke('blocks:toggle-checklist', input)
  },
  track: {
    create: (input) => invoke('track:create', input),
    complete: (input) => invoke('track:complete', input),
    list: (frontId) => invoke('track:list', frontId)
  },
  reports: {
    dashboard: (filter) => invoke('reports:dashboard', filter)
  },
  settings: {
    getTheme: () => invoke('settings:get-theme'),
    setTheme: (theme) => invoke('settings:set-theme', theme)
  },
  google: {
    connect: () => invoke('google:connect'),
    status: () => invoke('google:status'),
    syncNow: () => invoke('google:sync-now')
  }
});

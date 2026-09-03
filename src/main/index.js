import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from './database.js';
import { registerIpcHandlers } from './ipc.js';
import { createSessionRepository } from './session-repository.js';
import { createTaskRepository } from './task-repository.js';

const directory = path.dirname(fileURLToPath(import.meta.url));

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(directory, '../preload.js')
    }
  });

  window.loadFile(path.join(directory, '../renderer/index.html'));
}

app.whenReady().then(() => {
  const databasePath = path.join(app.getPath('userData'), 'lista-de-tarefas-diarias.db');
  const database = createDatabase(databasePath);
  const repositories = {
    tasks: createTaskRepository(database),
    sessions: createSessionRepository(database)
  };

  registerIpcHandlers(ipcMain, repositories);
  createWindow();
});
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());

import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createActivityRepository } from './activity-repository.js';
import { createDailyBackup } from './backup-service.js';
import { createBlockRepository } from './block-repository.js';
import { createDatabase } from './database.js';
import { createFrontRepository } from './front-repository.js';
import { registerIpcHandlers } from './ipc.js';
import { createReportRepository } from './report-repository.js';
import { createRoutineRepository } from './routine-repository.js';
import { createSettingsRepository } from './settings-repository.js';
import { createTemplateRepository } from './template-repository.js';
import { createTrackRepository } from './track-repository.js';

const directory = path.dirname(fileURLToPath(import.meta.url));

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
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
  createDailyBackup(databasePath, path.join(app.getPath('userData'), 'backups'));
  const rules = createRoutineRepository(database);
  const repositories = {
    activities: createActivityRepository(database),
    fronts: createFrontRepository(database),
    rules,
    blocks: createBlockRepository(database),
    templates: createTemplateRepository(rules),
    track: createTrackRepository(database),
    settings: createSettingsRepository(database),
    reports: createReportRepository(database)
  };
  registerIpcHandlers(ipcMain, repositories);
  createWindow();
});

app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());

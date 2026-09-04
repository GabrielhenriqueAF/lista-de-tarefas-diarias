import { app, BrowserWindow, ipcMain, Menu, safeStorage, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createActivityRepository } from './activity-repository.js';
import { createDailyBackup } from './backup-service.js';
import { createBlockRepository } from './block-repository.js';
import { createDatabase } from './database.js';
import { createFrontRepository } from './front-repository.js';
import { createGoogleAuth } from './google/google-auth.js';
import { createGoogleController } from './google/google-controller.js';
import { registerIpcHandlers } from './ipc.js';
import { createReportRepository } from './report-repository.js';
import { createRoutineRepository } from './routine-repository.js';
import { createSettingsRepository } from './settings-repository.js';
import { createTemplateRepository } from './template-repository.js';
import { createTrackRepository } from './track-repository.js';
import { createSyncRepository } from './sync-repository.js';
import { desktopWindowOptions } from './window-options.js';

const directory = path.dirname(fileURLToPath(import.meta.url));

function createWindow() {
  const window = new BrowserWindow(desktopWindowOptions(path.join(directory, '../preload.js')));
  window.loadFile(path.join(directory, '../renderer/index.html'));
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const userDataDirectory = app.getPath('userData');
  const databasePath = path.join(userDataDirectory, 'lista-de-tarefas-diarias.db');
  const backupDirectory = path.join(userDataDirectory, 'backups');
  const database = createDatabase(databasePath, {
    beforeLegacyReset: () => createDailyBackup(databasePath, backupDirectory)
  });
  createDailyBackup(databasePath, backupDirectory);
  const syncQueue = createSyncRepository(database);
  const settings = createSettingsRepository(database);
  const activities = createActivityRepository(database);
  const rules = createRoutineRepository(database, { syncQueue });
  const blocks = createBlockRepository(database, { syncQueue });
  const google = createGoogleController({
    auth: createGoogleAuth({
      credentialsPath: path.join(userDataDirectory, 'credentials.json'),
      tokenPath: path.join(userDataDirectory, 'google-token.json'),
      safeStorage,
      openExternal: (url) => shell.openExternal(url)
    }),
    settings,
    queue: syncQueue,
    activities,
    rules,
    blocks
  });
  const repositories = {
    activities,
    fronts: createFrontRepository(database),
    rules,
    blocks,
    templates: createTemplateRepository(rules),
    track: createTrackRepository(database),
    settings,
    reports: createReportRepository(database),
    google
  };
  registerIpcHandlers(ipcMain, repositories);
  createWindow();
});

app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());

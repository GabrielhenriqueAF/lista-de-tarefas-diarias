import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export function createDailyBackup(databasePath, backupDirectory, now = new Date()) {
  mkdirSync(backupDirectory, { recursive: true });
  const target = path.join(backupDirectory, `rotina-${now.toISOString().slice(0, 10)}.db`);
  if (!existsSync(target)) {
    copyFileSync(databasePath, target);
  }
  return target;
}

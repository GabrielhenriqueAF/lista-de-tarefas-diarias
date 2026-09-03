import Database from 'better-sqlite3';
import { hasLegacySchema, runMigrations, schemaVersion } from './migrations.js';

export function createDatabase(filename, { beforeLegacyReset } = {}) {
  const database = new Database(filename);
  database.pragma('foreign_keys = ON');
  if (beforeLegacyReset && hasLegacySchema(database)) {
    beforeLegacyReset();
  }
  runMigrations(database);
  return database;
}

export { schemaVersion };

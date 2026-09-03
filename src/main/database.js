import Database from 'better-sqlite3';
import { runMigrations, schemaVersion } from './migrations.js';

export function createDatabase(filename) {
  const database = new Database(filename);
  database.pragma('foreign_keys = ON');
  runMigrations(database);
  return database;
}

export { schemaVersion };

import Database from 'better-sqlite3';

export function createDatabase(filename) {
  const database = new Database(filename);
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      color TEXT NOT NULL,
      monthly_goal_minutes INTEGER,
      archived INTEGER NOT NULL DEFAULT 0,
      google_event_id TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS weekly_schedules (
      id INTEGER PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES tasks(id),
      weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      subtask_title TEXT,
      updated_at TEXT NOT NULL
    );
  `);
  return database;
}

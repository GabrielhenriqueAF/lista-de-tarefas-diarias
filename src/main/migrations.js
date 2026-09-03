const ROUTINE_SCHEMA_SQL = `
  CREATE TABLE activities (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL,
    weekly_goal_minutes INTEGER,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE fronts (
    id INTEGER PRIMARY KEY,
    activity_id INTEGER NOT NULL REFERENCES activities(id),
    name TEXT NOT NULL,
    current_point TEXT NOT NULL DEFAULT '',
    next_step TEXT NOT NULL DEFAULT '',
    default_weekday INTEGER CHECK (default_weekday BETWEEN 0 AND 6),
    weekly_goal_minutes INTEGER,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE recurrence_rules (
    id INTEGER PRIMARY KEY,
    activity_id INTEGER NOT NULL REFERENCES activities(id),
    front_id INTEGER REFERENCES fronts(id),
    title TEXT NOT NULL,
    weekdays TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    checklist_template TEXT NOT NULL DEFAULT '[]',
    active INTEGER NOT NULL DEFAULT 1,
    google_event_id TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE blocks (
    id INTEGER PRIMARY KEY,
    recurrence_rule_id INTEGER REFERENCES recurrence_rules(id),
    activity_id INTEGER NOT NULL REFERENCES activities(id),
    front_id INTEGER REFERENCES fronts(id),
    date TEXT NOT NULL,
    title TEXT NOT NULL,
    planned_start_at TEXT NOT NULL,
    planned_end_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    status TEXT NOT NULL CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
    finish_reason TEXT,
    note TEXT NOT NULL DEFAULT '',
    continuation_point TEXT NOT NULL DEFAULT '',
    google_event_id TEXT,
    google_recurring_event_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (recurrence_rule_id, date)
  );

  CREATE TABLE block_checklist_items (
    id INTEGER PRIMARY KEY,
    block_id INTEGER NOT NULL REFERENCES blocks(id),
    position INTEGER NOT NULL,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    UNIQUE (block_id, position)
  );

  CREATE TABLE track_items (
    id INTEGER PRIMARY KEY,
    front_id INTEGER NOT NULL REFERENCES fronts(id),
    position INTEGER NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (front_id, position)
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE sync_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE sync_queue (
    id INTEGER PRIMARY KEY,
    operation TEXT NOT NULL,
    payload TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX blocks_by_date ON blocks(date);
  CREATE INDEX blocks_by_front ON blocks(front_id, date DESC);
`;

const LEGACY_TABLES = ['progress_entries', 'sessions', 'weekly_schedules', 'tasks'];

export function schemaVersion(database) {
  const row = database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get();
  return row.version ?? 0;
}

export function hasLegacySchema(database) {
  const placeholders = LEGACY_TABLES.map(() => '?').join(', ');
  return Boolean(database.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name IN (${placeholders})
    LIMIT 1
  `).get(...LEGACY_TABLES));
}

export function runMigrations(database) {
  database.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  if (schemaVersion(database) >= 1) return;

  database.transaction(() => {
    database.exec(`
      DROP TABLE IF EXISTS progress_entries;
      DROP TABLE IF EXISTS sessions;
      DROP TABLE IF EXISTS weekly_schedules;
      DROP TABLE IF EXISTS tasks;
    `);
    database.exec(ROUTINE_SCHEMA_SQL);
    database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)').run(new Date().toISOString());
  })();
}

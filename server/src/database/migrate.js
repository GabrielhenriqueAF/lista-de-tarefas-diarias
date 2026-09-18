import { readFile } from 'node:fs/promises';

const defaultMigrations = Object.freeze([
  Object.freeze({
    version: 1,
    file: new URL('./migrations/001_identity_and_workspaces.sql', import.meta.url)
  })
]);

export async function runMigrations(client, migrations = defaultMigrations) {
  await client.query('BEGIN');

  try {
    await client.query('SELECT pg_advisory_xact_lock($1)', [987654321]);
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');

    for (const migration of migrations) {
      const applied = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [migration.version]);
      if (applied.rows.length === 0) {
        const sql = typeof migration.sql === 'string' ? migration.sql : await readFile(migration.file, 'utf8');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [migration.version]);
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

import { readFile } from 'node:fs/promises';

const migrations = [
  {
    version: 1,
    file: new URL('./migrations/001_identity_and_workspaces.sql', import.meta.url)
  }
];
const migrationLockKey = 987654321;

export async function runMigrations(client) {
  await client.query('BEGIN');

  try {
    await client.query(`SELECT pg_advisory_xact_lock(${migrationLockKey})`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    for (const migration of migrations) {
      const applied = await client.query(
        'SELECT version FROM schema_migrations WHERE version = $1',
        [migration.version]
      );

      if (applied.rows.length === 0) {
        await client.query(await readFile(migration.file, 'utf8'));
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [migration.version]
        );
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

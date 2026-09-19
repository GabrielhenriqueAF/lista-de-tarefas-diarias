import { expect, it } from 'vitest';
import { runMigrationCommand } from '../../src/database/migrate-cli.js';
import { createIntegrationPool } from './test-database.js';

it('runs the migration command against the disposable PostgreSQL database', async () => {
  const resetPool = createIntegrationPool();
  try {
    await resetPool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  } finally {
    await resetPool.end();
  }

  const migrationPool = createIntegrationPool();
  const exitCode = await runMigrationCommand({
    env: {
      NODE_ENV: 'test',
      PORT: '0',
      DATABASE_URL: process.env.DATABASE_URL,
      SESSION_SECRET: 'integration-session-secret-with-more-than-thirty-two-characters',
    },
    poolFactory: () => migrationPool,
  });
  expect(exitCode).toBe(0);

  const verificationPool = createIntegrationPool();
  try {
    expect((await verificationPool.query('SELECT version FROM schema_migrations')).rows)
      .toEqual([{ version: 1 }]);
    expect((await verificationPool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspace_members'"))
      .rowCount).toBe(1);
  } finally {
    await verificationPool.end();
  }
});

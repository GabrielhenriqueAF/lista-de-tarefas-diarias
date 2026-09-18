import { afterEach, beforeEach, expect, it } from 'vitest';
import { runMigrations } from '../../src/database/migrate.js';
import { createIntegrationPool } from './test-database.js';

let pool;
const clients = [];
const pools = [];

beforeEach(async () => {
  pool = createIntegrationPool();
  pools.push(pool);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
});

afterEach(async () => {
  // Destroy leased connections even after assertion failures, releasing all locks.
  for (const client of clients.splice(0)) client.release(true);
  try {
    if (pool) await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  } finally {
    pool = undefined;
    const results = await Promise.allSettled(pools.splice(0).map((item) => item.end()));
    if (results.some((result) => result.status === 'rejected')) {
      throw new Error('Falha ao encerrar os pools de integração.');
    }
  }
});

it('waits for Daymint advisory lock before a second migration runner proceeds', async () => {
  const second = createIntegrationPool();
  pools.push(second);
  const lock = await pool.connect();
  clients.push(lock);
  const runner = await second.connect();
  clients.push(runner);
  await lock.query('SELECT pg_advisory_lock($1)', [987654321]);

  let settled = false;
  // Handle a rejection immediately while still checking its result after unlocking.
  const pending = runMigrations(runner).then(
    () => { settled = true; return true; },
    () => { settled = true; return false; },
  );
  try {
    // Observe the actual PostgreSQL lock wait rather than relying on a fixed sleep.
    await expect.poll(async () => {
      const result = await lock.query(
        `SELECT count(*)::integer AS count FROM pg_locks
         WHERE pid = $1 AND locktype = 'advisory' AND NOT granted`,
        [runner.processID],
      );
      return result.rows[0].count;
    }, { timeout: 3_000 }).toBe(1);
    expect(settled).toBe(false);
  } finally {
    await lock.query('SELECT pg_advisory_unlock($1)', [987654321]);
    expect(await pending).toBe(true);
  }
  const versions = await runner.query('SELECT version FROM schema_migrations WHERE version = 1');
  expect(versions.rowCount).toBe(1);
});

it('rolls back a failing migration and leaves no schema record', async () => {
  const client = await pool.connect();
  clients.push(client);
  // Preserve the migration ledger so the rollback check can query it afterward.
  await runMigrations(client);
  const migrations = [{
    version: 999,
    name: 'rollback_probe',
    sql: 'CREATE TABLE rollback_probe (id integer); SELECT missing_function();',
  }];

  await expect(runMigrations(client, migrations)).rejects.toMatchObject({ code: '42883' });
  await expect(client.query('SELECT * FROM rollback_probe')).rejects.toMatchObject({ code: '42P01' });
  expect((await client.query('SELECT * FROM schema_migrations WHERE version = 999')).rowCount).toBe(0);
});

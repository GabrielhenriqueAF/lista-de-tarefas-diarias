import { afterEach, describe, expect, it } from 'vitest';
import { DataType, newDb } from 'pg-mem';
import { runMigrations } from '../../src/database/migrate.js';
import { withTransaction } from '../../src/database/pool.js';

function createPgMemClient({ onAdvisoryLock = () => {} } = {}) {
  const db = newDb({ noAstCoverageCheck: true });
  db.public.registerFunction({
    name: 'pg_advisory_xact_lock',
    args: [DataType.integer],
    returns: DataType.integer,
    implementation: (key) => {
      onAdvisoryLock(key);
      return 1;
    }
  });
  const { Client } = db.adapters.createPg();
  return new Client();
}

describe('runMigrations', () => {
  let client;

  afterEach(async () => {
    await client?.end();
  });

  it('creates identity tables and records migration 001 once', async () => {
    client = createPgMemClient();
    await client.connect();

    await runMigrations(client);
    await runMigrations(client);

    expect(await client.query('SELECT version FROM schema_migrations')).toMatchObject({
      rows: [{ version: 1 }]
    });
    expect(await client.query("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspace_members'"))
      .toMatchObject({ rows: [{ name: 'workspace_members' }] });
  });

  it('acquires a transaction-scoped advisory lock before migrating', async () => {
    const locks = [];
    client = createPgMemClient({ onAdvisoryLock: (key) => locks.push(key) });
    await client.connect();

    await runMigrations(client);

    expect(locks).toEqual([987654321]);
  });

  it('rolls back an injected migration when its SQL fails', async () => {
    const statements = [];
    const failingSql = 'SELECT missing_function();';
    const client = {
      query: async (statement) => {
        statements.push(statement);
        if (statement === failingSql) throw new Error('forced migration failure');
        return { rows: [] };
      },
    };
    const migrations = [{
      version: 999,
      name: 'fails_after_table',
      sql: failingSql,
    }];

    await expect(runMigrations(client, migrations)).rejects.toThrow();
    expect(statements).toContain('BEGIN');
    expect(statements).toContain('ROLLBACK');
    expect(statements).not.toContain('COMMIT');
  });
});

describe('withTransaction', () => {
  it('rolls back failed work and releases the checked-out client', async () => {
    const statements = [];
    const client = {
      query: async (statement) => {
        statements.push(statement);
      },
      release: () => {
        statements.push('RELEASE');
      }
    };
    const pool = { connect: async () => client };

    await expect(withTransaction(pool, async () => {
      throw new Error('migration failed');
    })).rejects.toThrow('migration failed');

    expect(statements).toEqual(['BEGIN', 'ROLLBACK', 'RELEASE']);
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';
import { runMigrations } from '../../src/database/migrate.js';
import { withTransaction } from '../../src/database/pool.js';

function createPgMemClient() {
  const db = newDb({ noAstCoverageCheck: true });
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

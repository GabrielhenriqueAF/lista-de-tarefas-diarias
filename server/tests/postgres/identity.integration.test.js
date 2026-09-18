import { afterEach, beforeEach, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { runMigrations } from '../../src/database/migrate.js';
import { createIdentityRepository } from '../../src/identity/identity-repository.js';
import { createIdentityService } from '../../src/identity/identity-service.js';
import { createWorkspaceRepository } from '../../src/workspaces/workspace-repository.js';
import { createIntegrationPool } from './test-database.js';

let pool;
const apps = [];

beforeEach(async () => {
  pool = createIntegrationPool();
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const client = await pool.connect();
  try { await runMigrations(client); } finally { client.release(); }
});

afterEach(async () => {
  const closedApps = await Promise.allSettled(apps.splice(0).map((app) => app.close()));
  try {
    if (pool) await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  } finally {
    if (pool) await pool.end();
    pool = undefined;
  }
  if (closedApps.some((result) => result.status === 'rejected')) {
    throw new Error('Falha ao encerrar os aplicativos de integração.');
  }
});

it('rolls back registration when a workspace membership trigger rejects the insert', async () => {
  await pool.query(`
    CREATE FUNCTION reject_membership() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'integration membership rejection'; END;
    $$;
    CREATE TRIGGER reject_membership BEFORE INSERT ON workspace_members
    FOR EACH ROW EXECUTE FUNCTION reject_membership();
  `);
  const service = createIdentityService({ repository: createIdentityRepository(pool) });
  const email = 'rollback@example.test';
  await expect(service.register({
    email, displayName: 'Teste rollback', password: 'integration-test-only',
    workspaceName: 'Workspace rollback',
  })).rejects.toMatchObject({ code: 'P0001' });

  const relatedCounts = await pool.query(`
    SELECT
      (SELECT count(*)::integer FROM users WHERE email = $1) AS users,
      (SELECT count(*)::integer FROM workspaces WHERE owner_id IN
        (SELECT id FROM users WHERE email = $1)) AS workspaces,
      (SELECT count(*)::integer FROM workspace_members WHERE user_id IN
        (SELECT id FROM users WHERE email = $1)) AS members,
      (SELECT count(*)::integer FROM sessions WHERE user_id IN
        (SELECT id FROM users WHERE email = $1)) AS sessions
  `, [email]);
  expect(relatedCounts.rows[0]).toEqual({ users: 0, workspaces: 0, members: 0, sessions: 0 });
  // Also detect orphan rows that an email join could otherwise hide.
  for (const table of ['users', 'workspaces', 'workspace_members', 'sessions']) {
    expect((await pool.query(`SELECT count(*)::integer AS count FROM ${table}`)).rows[0].count).toBe(0);
  }
});

it('returns database readiness and a generic unavailable response', async () => {
  const options = {
    config: { nodeEnv: 'test' },
    repositories: {
      identity: createIdentityRepository(pool),
      workspace: createWorkspaceRepository(pool),
    },
  };
  const readyApp = createApp({ ...options, readinessCheck: () => pool.query('SELECT 1') });
  apps.push(readyApp);
  const unavailableApp = createApp({
    ...options,
    readinessCheck: () => { throw new Error('private diagnostic must not escape'); },
  });
  apps.push(unavailableApp);

  const ready = await readyApp.inject({ method: 'GET', url: '/ready' });
  expect(ready.statusCode).toBe(200);
  expect(ready.json()).toEqual({ status: 'ready' });
  const unavailable = await unavailableApp.inject({ method: 'GET', url: '/ready' });
  expect(unavailable.statusCode).toBe(503);
  expect(unavailable.json()).toEqual({
    error: { code: 'DATABASE_UNAVAILABLE', message: 'Banco de dados indisponível.' },
  });
});

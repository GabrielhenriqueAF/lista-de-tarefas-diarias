# Daymint Foundation: Identity and Workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure Node API foundation where people can create accounts, authenticate, own Workspaces, and receive membership-scoped access.

**Architecture:** Keep the existing Electron source tree intact and create `server/` as a separate ESM Fastify service. PostgreSQL is accessed only behind repositories; route handlers call services and never write SQL. Authentication uses an opaque random session token whose SHA-256 digest, never the token itself, is stored in PostgreSQL.

**Tech Stack:** Node.js 24, Fastify, PostgreSQL, `pg`, `argon2`, Vitest, `pg-mem` for migration/repository tests.

**Spec:** `docs/superpowers/specs/2026-09-17-daymint-platform-design.md`

## Global Constraints

- Preserve `src/main`, `src/renderer`, and SQLite behavior until the remote-routine migration plan is executed.
- Ignore `node_modules/`, `.env`, `.env.*`, local database files, and backups; commit only `.env.example`.
- Every Workspace resource is loaded through an authenticated membership check.
- Store password hashes and session-token digests only; never log passwords, raw tokens, payment secrets, or payment data.
- The server is ESM and all route behavior is covered by Vitest tests before implementation is accepted.

---

### Task 1: Create the server workspace and safe configuration boundary

**Files:**
- Create: `.gitignore`
- Create: `.env.example`
- Create: `server/package.json`
- Create: `server/src/config.js`
- Create: `server/src/app.js`
- Create: `server/tests/config.test.js`
- Create: `server/tests/app.test.js`

**Interfaces:**
- Produces `loadConfig(env): { nodeEnv, port, databaseUrl, sessionSecret }`.
- Produces `createApp({ config, repositories }): FastifyInstance`.
- Consumes no Electron modules; the server must start independently.

- [ ] **Step 1: Write failing configuration and health-route tests**

```js
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';

it('rejects a missing session secret outside test mode', () => {
  expect(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://db' }))
    .toThrow('SESSION_SECRET is required');
});

it('returns health without exposing configuration', async () => {
  const app = createApp({ config: { nodeEnv: 'test' }, repositories: {} });
  const response = await app.inject({ method: 'GET', url: '/health' });
  expect(response.json()).toEqual({ status: 'ok' });
  await app.close();
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- --run tests/config.test.js tests/app.test.js` from `server/`.

Expected: FAIL because the server package, config module, and app module do not exist.

- [ ] **Step 3: Add the minimum server workspace and implementation**

Use these scripts in `server/package.json`:

```json
{
  "type": "module",
  "scripts": { "dev": "node --watch src/index.js", "start": "node src/index.js", "test": "vitest" },
  "dependencies": { "argon2": "^0.44.0", "fastify": "^5.0.0", "pg": "^8.13.0" },
  "devDependencies": { "pg-mem": "^3.0.0", "vitest": "^5.0.0" }
}
```

`loadConfig` must permit `SESSION_SECRET='test-session-secret'` only when `NODE_ENV === 'test'`; production and development require non-empty `DATABASE_URL` and `SESSION_SECRET`. `createApp` must register `GET /health` and centralize domain errors as `{ error: { code, message } }` without stack traces.

- [ ] **Step 4: Add repository safeguards**

Create `.gitignore` with exactly these secret/dependency protections in addition to existing project artifacts:

```gitignore
node_modules/
.env
.env.*
!.env.example
*.sqlite
*.sqlite3
*.db
backups/
```

Create `.env.example` with names only:

```dotenv
NODE_ENV=development
PORT=3030
DATABASE_URL=postgres://daymint:daymint@127.0.0.1:5432/daymint
SESSION_SECRET=replace-with-a-long-random-secret
```

- [ ] **Step 5: Run the focused server tests and the existing desktop suite**

Run: `npm test -- --run` from `server/`, then `npm test -- --run` from the repository root.

Expected: both commands exit 0.

- [ ] **Step 6: Commit the foundation workspace**

```bash
git add .gitignore .env.example server/package.json server/src/config.js server/src/app.js server/tests/config.test.js server/tests/app.test.js
git commit -m "feat: scaffold Daymint API safely"
```

### Task 2: Create PostgreSQL migrations for identity and Workspaces

**Files:**
- Create: `server/src/database/pool.js`
- Create: `server/src/database/migrate.js`
- Create: `server/src/database/migrations/001_identity_and_workspaces.sql`
- Create: `server/tests/database/migrate.test.js`

**Interfaces:**
- Produces `createPool(connectionString): Pool` and `runMigrations(client): Promise<void>`.
- Produces database tables `schema_migrations`, `users`, `sessions`, `workspaces`, and `workspace_members`.
- Later tasks consume `withTransaction(pool, callback)` and the four table names.

- [ ] **Step 1: Write a failing migration test against an in-memory PostgreSQL adapter**

```js
it('creates identity tables and records migration 001 once', async () => {
  const client = createPgMemClient();
  await runMigrations(client);
  await runMigrations(client);
  expect(await client.query("SELECT version FROM schema_migrations")).toMatchObject({ rows: [{ version: 1 }] });
  expect(await client.query("SELECT to_regclass('public.workspace_members') AS name"))
    .toMatchObject({ rows: [{ name: 'workspace_members' }] });
});
```

- [ ] **Step 2: Run the migration test and verify it fails**

Run: `npm test -- --run tests/database/migrate.test.js` from `server/`.

Expected: FAIL because `runMigrations` and the SQL migration do not exist.

- [ ] **Step 3: Implement an idempotent migration runner and migration 001**

The migration must create:

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_digest TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE workspaces (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE workspace_members (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
```

Record version 1 in `schema_migrations` in the same transaction as the schema changes.

- [ ] **Step 4: Run migrations tests and inspect duplicate safety**

Run: `npm test -- --run tests/database/migrate.test.js` from `server/`.

Expected: PASS and exactly one migration record.

- [ ] **Step 5: Commit the identity schema**

```bash
git add server/src/database server/tests/database/migrate.test.js
git commit -m "feat: add Daymint identity schema"
```

### Task 3: Implement registration, login, authenticated sessions, and logout

**Files:**
- Create: `server/src/identity/identity-repository.js`
- Create: `server/src/identity/identity-service.js`
- Create: `server/src/identity/identity-routes.js`
- Create: `server/tests/identity/identity-service.test.js`
- Create: `server/tests/identity/identity-routes.test.js`
- Modify: `server/src/app.js`

**Interfaces:**
- Produces `register({ email, displayName, password, workspaceName })`.
- Produces `login({ email, password })`, `authenticate(bearerToken)`, and `logout(bearerToken)`.
- `register` returns `{ user, workspace, token, expiresAt }`; `authenticate` returns `{ userId, sessionId }`.

- [ ] **Step 1: Write failing service tests for a complete account lifecycle**

```js
it('creates Gabriel, Rotina Gabriel, owner membership, and a usable opaque token', async () => {
  const result = await service.register({
    email: 'gabriel@example.test', displayName: 'Gabriel', password: 'strong-test-password', workspaceName: 'Rotina Gabriel'
  });
  expect(result.workspace.name).toBe('Rotina Gabriel');
  expect(await service.authenticate(result.token)).toMatchObject({ userId: result.user.id });
  expect(repository.sessionStoresRawToken(result.token)).toBe(false);
});
```

- [ ] **Step 2: Run identity tests and verify they fail**

Run: `npm test -- --run tests/identity` from `server/`.

Expected: FAIL because the identity modules do not exist.

- [ ] **Step 3: Implement the identity service**

Use `argon2.hash(password)` and `argon2.verify(hash, password)`. Normalize email with `trim().toLowerCase()`. Generate a raw session token with `randomBytes(32).toString('base64url')`, persist only `createHash('sha256').update(rawToken).digest('hex')`, and expire it after 30 days. Registration must create user, Workspace, and owner membership in one database transaction.

- [ ] **Step 4: Implement routes and auth decoration**

Register:

```text
POST /auth/register
POST /auth/login
POST /auth/logout
GET /auth/me
```

Require `Authorization: Bearer <token>` for `/auth/me` and `/auth/logout`. Invalid, revoked, and expired tokens return HTTP 401 with `{ error: { code: 'UNAUTHENTICATED', message: 'Sessão inválida ou expirada.' } }`.

- [ ] **Step 5: Run focused tests and the full server suite**

Run: `npm test -- --run tests/identity`, then `npm test -- --run` from `server/`.

Expected: PASS. Confirm duplicate email returns HTTP 409 and an incorrect password returns HTTP 401.

- [ ] **Step 6: Commit identity behavior**

```bash
git add server/src/identity server/src/app.js server/tests/identity
git commit -m "feat: add Daymint account authentication"
```

### Task 4: Implement Workspace membership and authorization guard

**Files:**
- Create: `server/src/workspaces/workspace-repository.js`
- Create: `server/src/workspaces/workspace-service.js`
- Create: `server/src/workspaces/workspace-routes.js`
- Create: `server/tests/workspaces/workspace-service.test.js`
- Create: `server/tests/workspaces/workspace-routes.test.js`
- Modify: `server/src/app.js`

**Interfaces:**
- Produces `listForUser(userId)`, `createForUser({ userId, name })`, and `requireMembership({ userId, workspaceId, minimumRole })`.
- Exposes `GET /workspaces`, `POST /workspaces`, and `GET /workspaces/:workspaceId`.
- Later routine and billing routes consume `request.requireWorkspaceMembership(workspaceId, 'member')`.

- [ ] **Step 1: Write failing tests for membership isolation**

```js
it('does not disclose Ana workspace to Gabriel', async () => {
  const ana = await createUserWithWorkspace('Ana workspace');
  const gabriel = await createUserWithWorkspace('Rotina Gabriel');
  await expect(service.requireMembership({ userId: gabriel.user.id, workspaceId: ana.workspace.id, minimumRole: 'member' }))
    .rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
});
```

- [ ] **Step 2: Run workspace tests and verify they fail**

Run: `npm test -- --run tests/workspaces` from `server/`.

Expected: FAIL because Workspace repository and service do not exist.

- [ ] **Step 3: Implement membership-scoped Workspace access**

Create new Workspaces with the caller as `owner`. `GET /workspaces/:workspaceId` must respond with 404 for a non-member rather than revealing the Workspace exists. Add the Fastify request decorator only after `authenticate` has completed.

- [ ] **Step 4: Run all server and existing desktop tests**

Run: `npm test -- --run` from `server/`, then `npm test -- --run` from the repository root.

Expected: both commands exit 0; existing Electron behavior remains unchanged.

- [ ] **Step 5: Commit Workspace isolation**

```bash
git add server/src/workspaces server/src/app.js server/tests/workspaces
git commit -m "feat: add workspace membership isolation"
```

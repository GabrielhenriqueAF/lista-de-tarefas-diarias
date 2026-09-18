# Daymint Security Hardening and PostgreSQL Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the local Daymint API and provide a repeatable Docker-backed PostgreSQL test suite without changing the Electron and SQLite application behavior.

**Architecture:** Keep the existing Fastify server as a loopback-only process, but make its configuration, PostgreSQL pool lifecycle, readiness response, and authentication boundary explicit and tested. Add a separate Docker Compose profile and Vitest configuration for real PostgreSQL behavior; the ordinary fast test suites remain Docker-free and exclude that profile.

**Tech Stack:** Node.js ESM, Fastify 5, `@fastify/rate-limit` 11.2 or later, `pg`, Argon2, PostgreSQL 16 Alpine, Docker Compose, Vitest, pg-mem, PowerShell.

**Spec:** `docs/superpowers/specs/2026-09-18-daymint-security-postgres-design.md`

## Global Constraints

- Keep Electron, the existing SQLite storage, current account model, session-token design, and Workspace isolation behavior unchanged.
- The API listens only on `127.0.0.1`; configure Fastify with `trustProxy: false` and never add CORS in this delivery.
- In development and production, `PORT` must be an integer from `1` through `65535`; test mode alone accepts `0`.
- Limit Fastify request bodies to exactly `8 * 1024` bytes.
- Version `.env.example` and `.env.integration.example` with safe placeholder values only; never stage `.env`, `.env.*.local`, `node_modules`, a Docker volume, database dump, token, or credential.
- Add `@fastify/rate-limit` at version `^11.2.0` or a later compatible Fastify 5 release; this version includes the IPv6 keying advisory fix.
- Register and login each allow five attempts per minute per remote IP. Use generic Portuguese errors for `429`, `503`, and database unavailability.
- Passwords retain their submitted bytes and are valid only at `12..128` characters. Email is at most 254 characters; display and Workspace names are non-empty and at most 120 characters.
- Permit at most two concurrent Argon2 jobs in this Node.js process. Saturation must fail immediately; it must not create a queue.
- `GET /health` is liveness only. `GET /ready` queries PostgreSQL through an injected readiness function and never exposes provider failures.
- Production migrations always use the immutable default migration list. An optional migration list is permitted only through the migration runner interface for tests.
- The ordinary server and root Vitest commands must not require Docker or a database. Only `scripts/test-postgres.ps1` creates and destroys the Compose database.
- Do not push to GitHub in this phase. Commit source and documentation changes only after their focused and full tests pass.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `server/src/config.js` | Parse environment variables and reject unsafe server configuration before listening. |
| `server/src/database/pool.js` | Create a PostgreSQL pool with a safe idle-error listener and retain the transaction helper. |
| `server/src/database/migrate.js` | Export immutable production migrations and run them transactionally under the advisory lock. |
| `server/src/database/migrate-cli.js` | Run and close the real migration pool from `npm run db:migrate` without leaking failures. |
| `server/src/app.js` | Configure Fastify’s network boundary, construct dependencies, and expose liveness/readiness routes. |
| `server/src/identity/auth-work-limiter.js` | Provide a small, testable, non-queuing limiter around expensive authentication jobs. |
| `server/src/identity/identity-service.js` | Validate credential and account fields before password hashing, then use the limiter. |
| `server/src/identity/identity-routes.js` | Apply independent route rate limits to registration and login. |
| `server/tests/**/*.test.js` | Docker-free unit, service, and HTTP tests for every new boundary. |
| `compose.integration.yml` | Launch one isolated PostgreSQL 16 test database bound only to `127.0.0.1:55432`. |
| `.env.integration.example` | Document the test database variables with non-secret sample values. |
| `server/vitest.postgres.config.js` | Select only real PostgreSQL tests. |
| `server/tests/postgres/*.test.js` | Demonstrate behavior that pg-mem cannot prove: advisory locks and real rollback semantics. |
| `scripts/test-postgres.ps1` | Start, test, and always remove the Compose database. |
| `docs/postgres-integration-tests.md` | Explain the local, safe workflow and recovery steps to a learner. |

## Task 1: Make configuration, pool errors, readiness, and migrations explicit

**Files:**
- Create: `server/src/database/migrate-cli.js`
- Create: `server/tests/config.test.js`
- Create: `server/tests/database/pool.test.js`
- Create: `server/tests/database/migrate-cli.test.js`
- Modify: `.env.example`
- Modify: `server/package.json`
- Modify: `server/src/config.js`
- Modify: `server/src/app.js`
- Modify: `server/src/database/pool.js`
- Modify: `server/src/database/migrate.js`
- Modify: `server/tests/app.test.js`
- Modify: `server/tests/database/migrate.test.js`

**Interfaces:**
- Consumes: existing `loadConfig(env)`, `createPool(connectionString)`, `runMigrations(client)`, and Fastify app construction.
- Produces: `loadConfig(env)` returning `{ nodeEnv: string, port: number, databaseUrl: string, sessionSecret: string }`; `createPool(connectionString, { onIdleError } = {})`; `runMigrations(client, migrations = defaultMigrations)`; `createApp({ config, repositories, readinessCheck } = {})`; and `runMigrationCommand({ env, poolFactory, migrate, writeError } = {})` resolving to an exit code of `0` or `1`.

- [ ] **Step 1: Add failing configuration and pool-boundary tests**

Create `server/tests/config.test.js` with exact invalid port cases and zero-only-in-test behavior:

```js
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const env = {
  NODE_ENV: 'test',
  PORT: '0',
  DATABASE_URL: 'postgres://user:password@127.0.0.1:5432/daymint',
  SESSION_SECRET: 'a-session-secret-with-more-than-thirty-two-characters',
};

describe('loadConfig', () => {
  for (const port of ['', 'abc', '-1', '65536']) {
    it(`rejects PORT=${JSON.stringify(port)}`, () => {
      expect(() => loadConfig({ ...env, PORT: port })).toThrow('PORT');
    });
  }

  it('rejects zero outside test mode', () => {
    expect(() => loadConfig({ ...env, NODE_ENV: 'development', PORT: '0' })).toThrow('PORT');
  });

  it('accepts zero in test mode', () => {
    expect(loadConfig(env).port).toBe(0);
  });
});
```

Create `server/tests/database/pool.test.js` to emit an idle error from a fake pool and prove that only its code reaches the observer:

```js
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createPool } from '../../src/database/pool.js';

it('registers a safe listener for idle PostgreSQL errors', () => {
  const pool = new EventEmitter();
  const onIdleError = vi.fn();
  const created = createPool('postgres://ignored', {
    onIdleError,
    Pool: class { constructor() { return pool; } },
  });
  const error = Object.assign(new Error('postgres://secret@host database failed'), { code: '57P01' });

  created.emit('error', error);

  expect(created).toBe(pool);
  expect(onIdleError).toHaveBeenCalledWith({ code: '57P01' });
  expect(onIdleError.mock.calls[0][0]).not.toHaveProperty('message');
});
```

- [ ] **Step 2: Run the two new tests and confirm they fail before the behavior exists**

Run: `npm --prefix server test -- --run tests/config.test.js tests/database/pool.test.js`

Expected: FAIL because the existing port parser accepts invalid values and `createPool` has neither the options argument nor an idle-error listener.

- [ ] **Step 3: Implement exact parsing and safe pool observation**

In `server/src/config.js`, parse a decimal string only when it matches `^\d+$`, then validate the numerical range. Preserve the existing database URL and session-secret checks. Use the following helper shape so callers receive the same configuration object:

```js
function parsePort(value, nodeEnv) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new Error('PORT deve ser um inteiro válido.');
  }

  const port = Number(value);
  const minimum = nodeEnv === 'test' ? 0 : 1;
  if (!Number.isSafeInteger(port) || port < minimum || port > 65535) {
    throw new Error('PORT está fora da faixa permitida.');
  }

  return port;
}
```

In `server/src/database/pool.js`, import the real `Pool` as `PostgresPool`, allow the test-only `Pool` factory override, and attach the listener before returning the pool:

```js
import { Pool as PostgresPool } from 'pg';

export function createPool(connectionString, { onIdleError = () => {}, Pool = PostgresPool } = {}) {
  const pool = new Pool({ connectionString });
  pool.on('error', (error) => {
    onIdleError({ code: typeof error?.code === 'string' ? error.code : 'UNKNOWN' });
  });
  return pool;
}
```

Keep `withTransaction` exported with its existing behavior. Do not put raw error objects, URLs, statements, or stack traces into `onIdleError`.

- [ ] **Step 4: Add failing readiness and migration-runner tests**

Append this focused readiness contract to `server/tests/app.test.js` using the project’s existing app setup helpers:

```js
it('keeps health as liveness and exposes a safe database readiness result', async () => {
  const options = { config: { nodeEnv: 'test' }, repositories: {} };
  const readyApp = createApp({ ...options, readinessCheck: async () => {} });
  const unavailableApp = createApp({
    ...options,
    readinessCheck: async () => { throw new Error('password=secret'); },
  });

  expect((await readyApp.inject({ method: 'GET', url: '/health' })).json()).toEqual({ status: 'ok' });
  expect((await readyApp.inject({ method: 'GET', url: '/ready' })).json()).toEqual({ status: 'ready' });

  const response = await unavailableApp.inject({ method: 'GET', url: '/ready' });
  expect(response.statusCode).toBe(503);
  expect(response.json()).toEqual({
    error: { code: 'DATABASE_UNAVAILABLE', message: 'Banco de dados indisponível.' },
  });
  await readyApp.close();
  await unavailableApp.close();
});
```

Append an injected migration rollback test to `server/tests/database/migrate.test.js`:

```js
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
```

Create `server/tests/database/migrate-cli.test.js` for cleanup and sanitized output:

```js
it('closes its pool and returns one after a sanitized migration failure', async () => {
  const end = vi.fn();
  const writeError = vi.fn();
  const result = await runMigrationCommand({
    env: validEnv,
    poolFactory: () => ({ end }),
    migrate: async () => { throw Object.assign(new Error('postgres://secret'), { code: '42P01' }); },
    writeError,
  });

  expect(result).toBe(1);
  expect(end).toHaveBeenCalledOnce();
  expect(writeError).toHaveBeenCalledWith('42P01');
});
```

- [ ] **Step 5: Run the focused readiness and migration tests to confirm failure**

Run: `npm --prefix server test -- --run tests/app.test.js tests/database/migrate.test.js tests/database/migrate-cli.test.js`

Expected: FAIL because `/ready`, the injected migration list, and the migration command interface have not been created.

- [ ] **Step 6: Implement readiness, immutable default migrations, and the CLI**

In `server/src/database/migrate.js`, rename the built-in list to `defaultMigrations`, freeze the array and each migration object, and expose this exact signature. Preserve the current production migration object’s `file: new URL(...)` field and support a `sql` string only in injected test migrations:

```js
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
```

In `server/src/app.js`, construct Fastify with `bodyLimit: 8 * 1024`, `trustProxy: false`, and the existing disabled logger configuration. When this module constructs a pool, pass `onIdleError: ({ code }) => app.log.error({ code }, 'Daymint PostgreSQL pool error')`. Define readiness as `readinessCheck ?? (() => pool.query('SELECT 1'))` and add:

```js
app.get('/ready', async (_request, reply) => {
  try {
    await readinessCheck();
    return { status: 'ready' };
  } catch {
    return reply.code(503).send({
      error: { code: 'DATABASE_UNAVAILABLE', message: 'Banco de dados indisponível.' },
    });
  }
});
```

In `server/src/database/migrate-cli.js`, export `runMigrationCommand`. It loads `loadConfig(env)`, calls `poolFactory(config.databaseUrl)`, passes that pool to `migrate`, calls `pool.end()` inside `finally` when a pool was created, and sends `typeof error?.code === 'string' ? error.code : 'MIGRATION_FAILED'` to `writeError`. Its executable tail must set `process.exitCode` rather than calling `process.exit`:

```js
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runMigrationCommand({ writeError: (code) => console.error(`Falha na migração: ${code}`) });
}
```

Add this script to `server/package.json`:

```json
"db:migrate": "node src/database/migrate-cli.js"
```

Update `.env.example` to use nonworking placeholders:

```dotenv
NODE_ENV=development
PORT=3030
DATABASE_URL=postgres://replace-user:replace-password@127.0.0.1:5432/replace-database
SESSION_SECRET=replace-with-a-long-random-secret
```

- [ ] **Step 7: Run focused and full Docker-free verification**

Run: `npm --prefix server test -- --run tests/config.test.js tests/database/pool.test.js tests/database/migrate-cli.test.js tests/database/migrate.test.js tests/app.test.js`

Expected: PASS.

Run: `npm --prefix server test -- --run`

Expected: PASS with all server tests, including legacy migrations and isolation tests.

- [ ] **Step 8: Commit the independently tested server-boundary change**

```powershell
git add .env.example server/package.json server/package-lock.json server/src/config.js server/src/app.js server/src/database/pool.js server/src/database/migrate.js server/src/database/migrate-cli.js server/tests/config.test.js server/tests/app.test.js server/tests/database/pool.test.js server/tests/database/migrate.test.js server/tests/database/migrate-cli.test.js
git commit -m "feat: harden database and server boundaries"
```

### Task 2: Protect the authentication entry points before Argon2 work starts

**Files:**
- Create: `server/src/identity/auth-work-limiter.js`
- Create: `server/tests/identity/auth-work-limiter.test.js`
- Modify: `server/package.json`
- Modify: `server/package-lock.json`
- Modify: `server/src/app.js`
- Modify: `server/src/identity/identity-service.js`
- Modify: `server/src/identity/identity-routes.js`
- Modify: `server/tests/identity/identity-service.test.js`
- Modify: `server/tests/identity/identity-routes.test.js`

**Interfaces:**
- Consumes: `createApp`, the identity repository, and current register/login response contracts.
- Produces: `createAuthWorkLimiter({ maxConcurrent = 2 } = {})`, returning `{ run(work) }`; `run(work)` resolves the work result or throws an error with `code === 'AUTH_BUSY'`; `createIdentityService({ repository, now, authWorkLimiter })` uses that limiter around every Argon2 hash or verify.

- [ ] **Step 1: Add failing limiter and validation tests**

Create `server/tests/identity/auth-work-limiter.test.js` using deferred jobs to prove the third operation fails without waiting:

```js
import { describe, expect, it } from 'vitest';
import { createAuthWorkLimiter } from '../../src/identity/auth-work-limiter.js';

function deferred() {
  let resolve;
  const promise = new Promise((next) => { resolve = next; });
  return { promise, resolve };
}

it('rejects an operation immediately when two jobs are active', async () => {
  const limiter = createAuthWorkLimiter({ maxConcurrent: 2 });
  const first = deferred();
  const second = deferred();
  const firstRun = limiter.run(() => first.promise);
  const secondRun = limiter.run(() => second.promise);

  await expect(limiter.run(async () => 'third')).rejects.toMatchObject({ code: 'AUTH_BUSY' });

  first.resolve('first');
  second.resolve('second');
  await expect(Promise.all([firstRun, secondRun])).resolves.toEqual(['first', 'second']);
});
```

Add service tests that stub the password hash/verify dependency or use the project’s existing Argon2 mock seam. They must assert all of the following:

```js
await expect(service.register({ email: 'a@b.com', password: 'short', displayName: 'Ana', workspaceName: 'Casa' }))
  .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
await expect(service.register({ email: 'a'.repeat(250) + '@b.com', password: '123456789012', displayName: 'Ana', workspaceName: 'Casa' }))
  .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
await expect(service.register({ email: 'ana@example.com', password: '123456789012', displayName: 'x'.repeat(121), workspaceName: 'Casa' }))
  .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
await expect(service.register({ email: 'ana@example.com', password: '123456789012', displayName: 'Ana', workspaceName: 'x'.repeat(121) }))
  .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
```

Include a round-trip case that registers with `' leading-space!'` and confirms login only succeeds with that exact password, proving no password trim or normalization occurs.

- [ ] **Step 2: Run the limiter and validation tests to confirm failure**

Run: `npm --prefix server test -- --run tests/identity/auth-work-limiter.test.js tests/identity/identity-service.test.js`

Expected: FAIL because the limiter module and length-policy behavior do not exist.

- [ ] **Step 3: Implement the non-queuing authentication limiter and exact field validation**

Create `server/src/identity/auth-work-limiter.js`:

```js
export function createAuthWorkLimiter({ maxConcurrent = 2 } = {}) {
  let active = 0;

  return {
    async run(work) {
      if (active >= maxConcurrent) {
        const error = new Error('Authentication service is busy.');
        error.code = 'AUTH_BUSY';
        throw error;
      }

      active += 1;
      try {
        return await work();
      } finally {
        active -= 1;
      }
    },
  };
}
```

In `server/src/identity/identity-service.js`, add a `validatePassword(password)` that checks only `typeof password === 'string'` and `password.length >= 12 && password.length <= 128`; pass the original value directly to Argon2. Update existing text validation to accept a maximum length argument, trim email/display/Workspace names as the current product behavior requires, reject email after checking its 254-character maximum, and reject display/Workspace values that are empty or over 120 characters. Perform all four validations before the first `argon2.hash` call. Wrap only `argon2.hash` and `argon2.verify` in `authWorkLimiter.run`.

Map `AUTH_BUSY` in the server’s error handler to this exact public response:

```js
reply.code(503).send({
  error: { code: 'AUTH_BUSY', message: 'Serviço de autenticação temporariamente ocupado.' },
});
```

Instantiate one limiter in `createApp` and inject it into the identity service so all app requests share the same two-job cap.

- [ ] **Step 4: Add failing independent route-rate-limit tests**

In `server/tests/identity/identity-routes.test.js`, send six invalid registration requests from the same injected remote address and six invalid login requests from the same address. The first five of each route must retain their ordinary validation or unauthorized status; the sixth must be generic `429` and must not contain an email address, account existence indicator, token, or stack trace:

```js
const response = await app.inject({
  method: 'POST',
  url: '/auth/register',
  remoteAddress: '127.0.0.44',
  payload: { email: 'bad', password: 'short', displayName: 'Ana', workspaceName: 'Casa' },
});

expect(response.statusCode).toBe(429);
expect(response.json()).toEqual({
  error: { code: 'RATE_LIMITED', message: 'Muitas tentativas. Tente novamente em instantes.' },
});
```

Add a request with `x-forwarded-for: 198.51.100.8` and prove the rate-limit behavior still uses the actual remote address because `trustProxy` is false. Add an 8193-byte JSON payload case and assert Fastify rejects it before the handler performs work.

- [ ] **Step 5: Run the route tests to confirm failure**

Run: `npm --prefix server test -- --run tests/identity/identity-routes.test.js`

Expected: FAIL because the rate-limit plugin is not registered and the routes do not declare independent policies.

- [ ] **Step 6: Install and configure the Fastify 5-compatible rate-limit plugin**

Run exactly from the `server` directory so only the server manifest and lockfile change:

```powershell
npm install @fastify/rate-limit@^11.2.0
```

In `server/src/app.js`, before registering identity routes, register the plugin with a generic response builder. `createApp` remains synchronous, so call `app.register` without `await`:

```js
app.register(rateLimit, {
  global: false,
  errorResponseBuilder: () => ({
    error: { code: 'RATE_LIMITED', message: 'Muitas tentativas. Tente novamente em instantes.' },
  }),
});
```

In `server/src/identity/identity-routes.js`, attach this `config.rateLimit` object independently to the register and login route definitions:

```js
const authRateLimit = { max: 5, timeWindow: '1 minute' };
```

Each route must receive a separate object literal (`{ ...authRateLimit }`) so future route-local changes cannot mutate the other route’s policy. Keep every protected Workspace route unmodified.

- [ ] **Step 7: Run focused authentication tests and the complete server suite**

Run: `npm --prefix server test -- --run tests/identity/auth-work-limiter.test.js tests/identity/identity-service.test.js tests/identity/identity-routes.test.js`

Expected: PASS.

Run: `npm --prefix server test -- --run`

Expected: PASS, including existing session revocation and Workspace membership-isolation tests.

- [ ] **Step 8: Commit the independently tested authentication boundary**

```powershell
git add server/package.json server/package-lock.json server/src/app.js server/src/identity/auth-work-limiter.js server/src/identity/identity-service.js server/src/identity/identity-routes.js server/tests/identity/auth-work-limiter.test.js server/tests/identity/identity-service.test.js server/tests/identity/identity-routes.test.js
git commit -m "feat: protect authentication entry points"
```

### Task 3: Add the isolated real-PostgreSQL test profile and learner documentation

**Files:**
- Create: `.env.integration.example`
- Create: `compose.integration.yml`
- Create: `server/vitest.postgres.config.js`
- Create: `server/tests/postgres/test-database.js`
- Create: `server/tests/postgres/migrate.integration.test.js`
- Create: `server/tests/postgres/identity.integration.test.js`
- Create: `scripts/test-postgres.ps1`
- Create: `docs/postgres-integration-tests.md`
- Modify: `.gitignore`
- Modify: `vitest.config.js`
- Modify: `server/package.json`

**Interfaces:**
- Consumes: `runMigrations(client, migrations)`, `createApp({ readinessCheck })`, `createIdentityService`, and the existing repository implementation.
- Produces: `npm --prefix server run test:postgres`, selected only by `server/vitest.postgres.config.js`; an integration suite that requires `RUN_POSTGRES_INTEGRATION === '1'`; and `scripts/test-postgres.ps1` as the only start/test/cleanup command for the Compose database.

- [ ] **Step 1: Add the real PostgreSQL test guard and first failing integration test**

Create `server/tests/postgres/test-database.js` with a strict guard that rejects accidental execution against a development database:

```js
import { Pool } from 'pg';

export function requireIntegrationDatabase(env = process.env) {
  if (env.RUN_POSTGRES_INTEGRATION !== '1' || !env.DATABASE_URL?.includes('127.0.0.1:55432')) {
    throw new Error('Os testes PostgreSQL exigem RUN_POSTGRES_INTEGRATION=1 e o banco local da porta 55432.');
  }
  return env.DATABASE_URL;
}

export function createIntegrationPool(env = process.env) {
  return new Pool({ connectionString: requireIntegrationDatabase(env) });
}
```

Create `server/tests/postgres/migrate.integration.test.js` with this real lock test. It intentionally fails until Compose is running:

```js
it('waits for Daymint advisory lock before a second migration runner proceeds', async () => {
  const first = createIntegrationPool();
  const second = createIntegrationPool();
  const lock = await first.connect();
  const runner = await second.connect();
  await lock.query('SELECT pg_advisory_lock($1)', [987654321]);

  let settled = false;
  const pending = runMigrations(runner).finally(() => { settled = true; });
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(settled).toBe(false);

  await lock.query('SELECT pg_advisory_unlock($1)', [987654321]);
  await pending;
  const versions = await runner.query('SELECT version FROM schema_migrations WHERE version = 1');
  expect(versions.rowCount).toBe(1);

  lock.release();
  runner.release();
  await first.end();
  await second.end();
});
```

- [ ] **Step 2: Run the dedicated Vitest command and confirm it safely fails without Docker**

Add this script to `server/package.json`:

```json
"test:postgres": "vitest --config vitest.postgres.config.js --run"
```

Create `server/vitest.postgres.config.js`:

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/postgres/**/*.test.js'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
```

Run: `npm --prefix server run test:postgres`

Expected: FAIL with the explicit `RUN_POSTGRES_INTEGRATION` guard, never by connecting to a default or production database.

- [ ] **Step 3: Build the Compose profile and safe local environment template**

Modify `.gitignore` so the versioned example survives the existing `.env.*` rule:

```gitignore
.env.integration.local
!.env.integration.example
```

Create `.env.integration.example`:

```dotenv
POSTGRES_USER=daymint_test
POSTGRES_PASSWORD=replace-with-local-test-password
POSTGRES_DB=daymint_integration
POSTGRES_PORT=55432
```

Create `compose.integration.yml` with a loopback-only mapping and an explicit health check:

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    ports:
      - "127.0.0.1:${POSTGRES_PORT}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
      interval: 2s
      timeout: 3s
      retries: 30
      start_period: 2s
```

Modify the root `vitest.config.js` so fast suites never collect Docker tests:

```js
export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['server/tests/postgres/**'],
  },
});
```

- [ ] **Step 4: Add real rollback and readiness acceptance tests**

In `server/tests/postgres/migrate.integration.test.js`, reset `public` before every test with `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`. Add this exact injected-migration behavior:

```js
it('rolls back a failing migration and leaves no schema record', async () => {
  const pool = createIntegrationPool();
  const client = await pool.connect();
  const migrations = [{
    version: 999,
    name: 'rollback_probe',
    sql: 'CREATE TABLE rollback_probe (id integer); SELECT missing_function();',
  }];

  await expect(runMigrations(client, migrations)).rejects.toThrow();
  await expect(client.query('SELECT * FROM rollback_probe')).rejects.toMatchObject({ code: '42P01' });
  expect((await client.query('SELECT * FROM schema_migrations WHERE version = 999')).rowCount).toBe(0);

  client.release();
  await pool.end();
});
```

In `server/tests/postgres/identity.integration.test.js`, apply standard migrations, install a trigger that raises an exception on every `workspace_members` insert, call registration, then query `users`, `workspaces`, `workspace_members`, and `sessions` for the submitted email. Each count must be zero after the rejected request. In the same file, make an app using `readinessCheck: () => pool.query('SELECT 1')` and assert `/ready` returns `200` with `{ status: 'ready' }`; then make an app whose readiness function throws and assert the exact generic `503` object from Task 1.

Use `afterEach` cleanup that drops `public` and closes every `Pool` and Fastify app even when assertions fail. Do not print a database URL or exception message in a test failure message.

- [ ] **Step 5: Create the reliable PowerShell start/test/cleanup command**

Create `scripts/test-postgres.ps1` with this flow. It must call cleanup in `finally`, even when Vitest fails:

```powershell
param(
  [string]$EnvironmentFile = '.env.integration.local'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$composeFile = Join-Path $PSScriptRoot '..\compose.integration.yml'
$environmentPath = Join-Path $PSScriptRoot "..\$EnvironmentFile"

if (-not (Test-Path -LiteralPath $environmentPath)) {
  throw "Crie $EnvironmentFile a partir de .env.integration.example antes de executar este comando."
}

function Read-IntegrationVariables([string]$path) {
  $values = @{}
  foreach ($line in Get-Content -LiteralPath $path) {
    if ($line -match '^([A-Z_]+)=(.+)$') {
      $values[$Matches[1]] = $Matches[2]
    }
  }
  foreach ($key in 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB', 'POSTGRES_PORT') {
    if ([string]::IsNullOrWhiteSpace($values[$key])) {
      throw "A variável $key precisa de valor em $EnvironmentFile."
    }
  }
  return $values
}

$variables = Read-IntegrationVariables $environmentPath
$databaseUrl = "postgres://$($variables.POSTGRES_USER):$($variables.POSTGRES_PASSWORD)@127.0.0.1:$($variables.POSTGRES_PORT)/$($variables.POSTGRES_DB)"

try {
  docker compose --env-file $environmentPath -f $composeFile up --detach --wait db
  $env:RUN_POSTGRES_INTEGRATION = '1'
  $env:DATABASE_URL = $databaseUrl
  npm --prefix (Join-Path $PSScriptRoot '..\server') run test:postgres
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Remove-Item Env:RUN_POSTGRES_INTEGRATION -ErrorAction SilentlyContinue
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  docker compose --env-file $environmentPath -f $composeFile down --volumes --remove-orphans
}
```

The parsing function accepts only the four expected `KEY=value` lines and fails before Docker starts when one is absent. It never writes the resulting values to output.

- [ ] **Step 6: Write learner-facing PostgreSQL instructions**

Create `docs/postgres-integration-tests.md` with these exact sections and commands:

````markdown
# Testes de integração com PostgreSQL

## Antes de começar

Instale e inicie o [Docker Desktop para Windows](https://docs.docker.com/desktop/setup/install/windows-install/). Confirme os comandos:

```powershell
docker version
docker compose version
```

## Preparar o banco descartável

```powershell
Copy-Item .env.integration.example .env.integration.local
```

Abra apenas `.env.integration.local` e escolha uma senha local. Este arquivo é ignorado pelo Git. Nunca informe dados de produção e nunca use a URL de produção neste teste.

## Executar a suíte real

```powershell
.\scripts\test-postgres.ps1
```

O comando usa [`docker compose up --wait`](https://docs.docker.com/reference/cli/docker/compose/up/) para iniciar `postgres:16-alpine` em `127.0.0.1:55432`, roda somente `server/tests/postgres`, e remove contêiner, rede e volume ao terminar — inclusive se um teste falhar.

## Diagnóstico seguro

Se o Docker não iniciar, abra o Docker Desktop e execute novamente `docker version`. Se a porta 55432 estiver ocupada, altere somente `POSTGRES_PORT` em `.env.integration.local`; o script construirá a URL do banco com o novo valor. Não copie logs que contenham a URL de conexão para issues públicas.
````

O texto acima identifica o banco como descartável e local e inclui os links oficiais de instalação e do comando Compose usado pelo script.

- [ ] **Step 7: Verify the Docker-free test boundary and repository hygiene**

Run: `npm --prefix server test -- --run`

Expected: PASS without Docker because `server/tests/postgres/**` is excluded from the default profile.

Run: `npm test -- --run`

Expected: PASS without Docker because the root configuration excludes PostgreSQL integration tests.

Run: `git check-ignore -v .env.integration.local node_modules`

Expected: both paths are ignored.

Run: `git check-ignore -v .env.integration.example`

Expected: nonzero exit code because the example is versionable.

- [ ] **Step 8: Commit the local real-PostgreSQL test profile**

```powershell
git add .gitignore .env.integration.example compose.integration.yml vitest.config.js server/package.json server/vitest.postgres.config.js server/tests/postgres/test-database.js server/tests/postgres/migrate.integration.test.js server/tests/postgres/identity.integration.test.js scripts/test-postgres.ps1 docs/postgres-integration-tests.md
git commit -m "test: add isolated PostgreSQL integration profile"
```

### Task 4: Install Docker Desktop locally and run the full acceptance suite

**Files:**
- Modify: only files required to correct a test failure discovered in this task; each correction must receive a new red-green test and a separate commit.
- Test: `scripts/test-postgres.ps1`

**Interfaces:**
- Consumes: the Compose profile, local environment template, test script, and focused Vitest profile from Task 3.
- Produces: evidence that the dedicated suite ran on PostgreSQL rather than pg-mem, plus a clean worktree with no local credentials or dependency directories staged.

- [ ] **Step 1: Install or confirm Docker Desktop with the official Windows installer**

First run these read-only checks:

```powershell
docker version
docker compose version
```

If either command is unavailable, install Docker Desktop for Windows from the official documentation at `https://docs.docker.com/desktop/setup/install/windows-install/`. If the installer requests Windows administrator approval, WSL setup, or a restart, complete that user-visible step and wait until Docker Desktop reports that its engine is running. Do not substitute a cloud database or a production database.

- [ ] **Step 2: Create the ignored local test configuration**

Run from the repository root only when `.env.integration.local` does not already exist:

```powershell
Copy-Item .env.integration.example .env.integration.local
```

Set a local-only `POSTGRES_PASSWORD` in `.env.integration.local`. Keep the generated local password out of the terminal, test output, commits, screenshots, and documentation.

- [ ] **Step 3: Run the real PostgreSQL acceptance suite**

Run: `.\scripts\test-postgres.ps1`

Expected: the command waits for the `db` health check, runs exactly the PostgreSQL Vitest profile with `RUN_POSTGRES_INTEGRATION=1`, passes the advisory lock, migration rollback, registration rollback, and readiness cases, then removes the Compose resources.

- [ ] **Step 4: Investigate any failure by preserving the red-green loop**

If the command fails, first collect only non-sensitive diagnostics:

```powershell
docker compose --env-file .env.integration.local -f compose.integration.yml ps
docker compose --env-file .env.integration.local -f compose.integration.yml logs --tail 100 db
```

For a product-code defect, add a focused test demonstrating the observed behavior, run it to fail, apply the smallest correction, rerun the focused test, then rerun `.\scripts\test-postgres.ps1`. Do not weaken assertions, skip the failing integration test, expose secrets, or preserve the Docker volume as a workaround.

- [ ] **Step 5: Run all release checks before any GitHub discussion**

Run these commands after the real suite passes:

```powershell
npm --prefix server test -- --run
npm test -- --run
npm --prefix server audit --omit=dev
git status --short
git diff --check
```

Expected: both test suites pass, `npm audit --omit=dev` reports no production vulnerability, status lists no `.env.integration.local` or `node_modules` path, and `git diff --check` is silent.

- [ ] **Step 6: Commit only an actual test-driven correction, then present verification evidence**

If Task 4 made no source changes, do not create an empty commit. If it made a verified correction, stage only the source, test, and documentation paths printed by `git diff --name-only`; inspect the staged patch with `git diff --cached` and create a commit named `fix: stabilize PostgreSQL integration tests`. Confirm that the staged patch has no local environment or dependency path before the commit.

Report the exact commands and pass/fail outcomes to the user. Do not push to GitHub; request a separate authorization after they review the local result.

## Final Verification Matrix

| Check | Command | Required result |
| --- | --- | --- |
| Config, pool, readiness, migration CLI | `npm --prefix server test -- --run` | All server tests pass without Docker. |
| Existing application behavior | `npm test -- --run` | All root tests pass without Docker. |
| Real PostgreSQL behavior | `.\\scripts\\test-postgres.ps1` | Advisory lock, both rollbacks, and readiness pass against Compose PostgreSQL. |
| Production dependency review | `npm --prefix server audit --omit=dev` | No production dependency vulnerability. |
| Secret/dependency hygiene | `git status --short` and `git check-ignore -v .env.integration.local node_modules` | Local environment and dependencies are not staged or tracked. |
| Whitespace and merge safety | `git diff --check` | No output. |

# Daymint Security Hardening and Real PostgreSQL Test Design

## Objective

Harden the Daymint API before any GitHub push and add a reproducible, local PostgreSQL integration-test path. The work protects authentication and database availability while keeping the existing Electron application, SQLite storage, account model, and Workspace isolation behavior intact.

## Scope

This delivery contains five focused parts:

1. Strict application-port and request-payload validation.
2. Safe PostgreSQL pool-error handling plus a database readiness endpoint.
3. Authentication hardening: passphrase policy, request rate limits, and a bounded number of Argon2 operations.
4. An explicit migration command and real PostgreSQL integration tests.
5. Docker Compose documentation and local-only environment templates with no credentials committed to Git.

It does not expose the server publicly, add a payment provider, add CORS, change Electron or SQLite behavior, push code, or use a cloud database.

## Security Decisions

### Network and configuration boundary

- `PORT` is required to be an integer in the inclusive range `1..65535` in development and production. Test mode may use `0` to obtain an ephemeral port.
- The API continues to listen only on `127.0.0.1`; it does not trust forwarded client-address headers.
- Fastify accepts a maximum request body of `8 KiB` because the current API sends only account and Workspace fields.
- `.env.example` uses placeholders only. It must not contain an actual password, token, or production-like credential.
- `.env.integration.local` is ignored by Git. `.env.integration.example` documents variable names and safe placeholders only.

### Database availability

- `createPool(connectionString, { onIdleError })` attaches a PostgreSQL pool `error` listener immediately. The listener reports only a sanitized error code through `onIdleError`; it never logs a raw database error, connection string, password, SQL values, or stack trace.
- `createApp` supplies the pool listener with `app.log.error({ code }, 'Daymint PostgreSQL pool error')`. This prevents an unhandled idle-client error from terminating Node.js while retaining safe diagnostic context when logging is enabled.
- `GET /health` remains a liveness check and returns `{ status: 'ok' }` without contacting PostgreSQL.
- `GET /ready` runs an injected readiness check. It returns `{ status: 'ready' }` with HTTP 200 after `SELECT 1`; if PostgreSQL is unavailable, it returns HTTP 503 with `{ error: { code: 'DATABASE_UNAVAILABLE', message: 'Banco de dados indisponível.' } }` and never includes the provider error.

### Authentication hardening

- A new password is accepted only when its exact submitted value has `12..128` characters. The API does not trim or normalize passwords; spaces therefore remain significant.
- Email must be at most 254 characters. Display name and Workspace name must be non-empty and at most 120 characters. These checks run before expensive password hashing.
- Register and login are rate limited independently to 5 attempts per minute per source IP. The API returns HTTP 429 with a generic Portuguese message. `trustProxy` remains disabled, so an untrusted forwarded header cannot select the rate-limit key.
- A process-local authentication-work limiter allows at most two active Argon2 jobs. When saturated, it immediately returns HTTP 503 with a generic `AUTH_BUSY` error rather than retaining an unbounded queue. This is a local protection only; a future multi-instance deployment requires a shared rate limiter.
- The existing session design remains unchanged: Argon2 password hash, opaque 256-bit session token, SHA-256 persisted token digest, 30-day expiry, and revocation on logout.

## Migration and test architecture

### Explicit migration command

`server/src/database/migrate-cli.js` loads configuration, creates a PostgreSQL pool, runs `runMigrations`, closes the pool in `finally`, and exits nonzero after printing a sanitized failure code. `server/package.json` exposes it as `npm run db:migrate`.

`runMigrations(client, migrations = defaultMigrations)` accepts an injected migration list only for tests. Production callers use the immutable built-in migration list. This permits a real PostgreSQL rollback test without changing the migration policy.

### Local PostgreSQL integration profile

- `compose.integration.yml` defines only a `db` service using PostgreSQL 16 Alpine, with a healthcheck and no published production-facing service.
- The integration database is reached through `127.0.0.1:55432`, separate from the development example port `5432`.
- Docker variables come from `.env.integration.local`. The versioned example uses `POSTGRES_USER=daymint_test`, `POSTGRES_PASSWORD=replace-with-local-test-password`, `POSTGRES_DB=daymint_integration`, and `POSTGRES_PORT=55432` solely as placeholders.
- `server/vitest.postgres.config.js` selects only `server/tests/postgres/**/*.test.js`. This profile runs only when `RUN_POSTGRES_INTEGRATION=1` and a valid `DATABASE_URL` are supplied.
- `scripts/test-postgres.ps1` starts Compose with `--wait`, sets `RUN_POSTGRES_INTEGRATION=1` and `DATABASE_URL` for the test process, runs the dedicated Vitest profile, and calls `docker compose down --volumes --remove-orphans` in `finally` whether tests pass or fail.

### Real PostgreSQL acceptance tests

The dedicated suite resets the test schema before each case and validates real behavior that pg-mem cannot prove:

1. **Concurrent migration lock:** one connection holds Daymint's advisory lock while a second `runMigrations` call remains pending. After release, the runner completes once, version `1` appears exactly once, and the full schema exists.
2. **Migration rollback:** an injected test migration creates a table and then fails. PostgreSQL must retain neither that table nor its `schema_migrations` record.
3. **Registration rollback:** a test trigger rejects a `workspace_members` insert during registration. The real database must retain no related user, Workspace, membership, or session row.
4. **Readiness:** `/ready` succeeds against the Compose database and maps a controlled query failure to the generic 503 response.

## Test strategy

Every new behavior follows red-green-refactor:

- Configuration tests reject empty, textual, zero, negative, and too-large ports outside test mode; test mode accepts zero.
- Pool tests emit an idle error, confirm the callback receives only its code, and confirm the process-level error event is handled.
- Route and service tests cover password and field limits, rate-limit `429`, saturation `503`, generic messages, and normal successful login/registration.
- Unit tests use injected readiness and pool callbacks. PostgreSQL-only tests use Compose and never run in the default fast suite.
- The final verification runs the server suite, root suite, dependency audit, and PostgreSQL integration script after Docker Desktop is available.

## Operational guide

`docs/postgres-integration-tests.md` explains Docker Desktop installation, copying the local environment template, starting the isolated database, running the real suite, reading failures, and cleanup. It explicitly says not to use a production database, not to commit the local environment file, and not to push until all local suites pass.

## Acceptance criteria

- Invalid ports fail during configuration loading, not during `listen`.
- An idle PostgreSQL pool error does not crash the Node.js process or leak sensitive details.
- Passwords shorter than 12 or longer than 128 characters are rejected before Argon2 work starts.
- Auth rate-limit and saturation responses are generic and do not disclose account state.
- `/ready` accurately reports database readiness without exposing database errors.
- PostgreSQL real integration tests demonstrate advisory-lock waiting and real rollback semantics.
- No real credentials, `.env` file, or dependency directory is tracked by Git.
- Existing Electron/SQLite behavior and account/Workspace isolation tests remain green.

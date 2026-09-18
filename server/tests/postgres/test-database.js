import { Pool } from 'pg';

export function requireIntegrationDatabase(env = process.env) {
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { /* Reject below without exposing input. */ }
  if (env.RUN_POSTGRES_INTEGRATION !== '1'
    || !url || !['postgres:', 'postgresql:'].includes(url.protocol)
    || url.hostname !== '127.0.0.1' || url.port !== '55432'
    || url.pathname !== '/daymint_integration' || url.search || url.hash) {
    throw new Error('Os testes PostgreSQL exigem RUN_POSTGRES_INTEGRATION=1 e o banco daymint_integration em 127.0.0.1:55432.');
  }
  return env.DATABASE_URL;
}

export function createIntegrationPool(env = process.env) {
  return new Pool({
    connectionString: requireIntegrationDatabase(env),
    connectionTimeoutMillis: 3_000,
    statement_timeout: 10_000,
  });
}

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it, vi } from 'vitest';
import { runMigrationCommand } from '../../src/database/migrate-cli.js';

const validEnv = {
  NODE_ENV: 'test',
  PORT: '0',
  DATABASE_URL: 'postgres://user:password@127.0.0.1:5432/daymint',
  SESSION_SECRET: 'a-session-secret-with-more-than-thirty-two-characters',
};

function runCli(env) {
  return new Promise((resolve, reject) => {
    const cliPath = fileURLToPath(new URL('../../src/database/migrate-cli.js', import.meta.url));
    const child = spawn(process.execPath, [cliPath], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

it('closes its pool and returns one after a sanitized migration failure', async () => {
  const end = vi.fn();
  const release = vi.fn();
  const writeError = vi.fn();
  const result = await runMigrationCommand({
    env: validEnv,
    poolFactory: () => ({ connect: async () => ({ release }), end }),
    migrate: async () => { throw Object.assign(new Error('postgres://secret'), { code: '42P01' }); },
    writeError,
  });

  expect(result).toBe(1);
  expect(end).toHaveBeenCalledOnce();
  expect(writeError).toHaveBeenCalledWith('42P01');
});

it('leases one client for migrations and releases it before closing the pool', async () => {
  const release = vi.fn();
  const client = { release };
  const connect = vi.fn(async () => client);
  const end = vi.fn();
  const migrate = vi.fn(async () => {});

  const result = await runMigrationCommand({
    env: validEnv,
    poolFactory: () => ({ connect, end }),
    migrate,
  });

  expect(result).toBe(0);
  expect(connect).toHaveBeenCalledOnce();
  expect(migrate).toHaveBeenCalledWith(client);
  expect(release).toHaveBeenCalledOnce();
  expect(end).toHaveBeenCalledOnce();
  expect(release.mock.invocationCallOrder[0]).toBeLessThan(end.mock.invocationCallOrder[0]);
});

it('executes the CLI entrypoint and reports invalid configuration safely', async () => {
  const result = await runCli({ NODE_ENV: 'production', PORT: '3030' });

  expect(result.code).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toBe('Falha na migração: MIGRATION_FAILED\n');
});

it('maps a pool cleanup failure to a sanitized result', async () => {
  const end = vi.fn(async () => {
    throw Object.assign(new Error('postgres://secret'), { code: '57P01' });
  });
  const writeError = vi.fn();
  const release = vi.fn();

  const result = await runMigrationCommand({
    env: validEnv,
    poolFactory: () => ({ connect: async () => ({ release }), end }),
    migrate: async () => {},
    writeError,
  });

  expect(result).toBe(1);
  expect(end).toHaveBeenCalledOnce();
  expect(writeError).toHaveBeenCalledOnce();
  expect(writeError).toHaveBeenCalledWith('57P01');
});

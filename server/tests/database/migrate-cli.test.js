import { expect, it, vi } from 'vitest';
import { runMigrationCommand } from '../../src/database/migrate-cli.js';

const validEnv = {
  NODE_ENV: 'test',
  PORT: '0',
  DATABASE_URL: 'postgres://user:password@127.0.0.1:5432/daymint',
  SESSION_SECRET: 'a-session-secret-with-more-than-thirty-two-characters',
};

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

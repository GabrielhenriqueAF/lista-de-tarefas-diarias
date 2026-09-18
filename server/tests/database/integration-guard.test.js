import { describe, expect, it } from 'vitest';
import { requireIntegrationDatabase } from '../postgres/test-database.js';

describe('PostgreSQL integration safety boundary', () => {
  const localUrl = 'postgres://127.0.0.1:55432/daymint_integration';

  it.each([
    {},
    { DATABASE_URL: localUrl },
    { RUN_POSTGRES_INTEGRATION: 'true', DATABASE_URL: localUrl },
    { RUN_POSTGRES_INTEGRATION: '1' },
    ...[
      'postgres://127.0.0.1:5432/daymint_integration',
      'postgres://localhost:55432/daymint_integration',
      'postgres://example.test:55432/127.0.0.1:55432',
      'postgres://127.0.0.1:55432@example.test/daymint_integration',
      'postgres://127.0.0.1:55432/development',
      'postgres://127.0.0.1:55432/daymint_integration?host=example.test',
      'https://127.0.0.1:55432/daymint_integration',
      'not-a-url',
    ].map((DATABASE_URL) => ({ RUN_POSTGRES_INTEGRATION: '1', DATABASE_URL })),
  ])('rejects unsafe integration configuration %# without revealing the URL', (env) => {
    expect(() => requireIntegrationDatabase(env)).toThrow(
      'Os testes PostgreSQL exigem RUN_POSTGRES_INTEGRATION=1 e o banco daymint_integration em 127.0.0.1:55432.',
    );
  });

  it('accepts only the explicit disposable local database', () => {
    expect(requireIntegrationDatabase({
      RUN_POSTGRES_INTEGRATION: '1', DATABASE_URL: localUrl,
    })).toBe(localUrl);
  });
});

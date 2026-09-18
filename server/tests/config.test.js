import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('rejects a missing session secret outside test mode', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://db' }))
      .toThrow('SESSION_SECRET is required');
  });

  it('rejects a missing database URL outside test mode', () => {
    expect(() => loadConfig({ NODE_ENV: 'development', SESSION_SECRET: 'secret' }))
      .toThrow('DATABASE_URL is required');
  });

  it('uses safe test defaults only in test mode', () => {
    expect(loadConfig({ NODE_ENV: 'test' })).toEqual({
      nodeEnv: 'test',
      port: 3030,
      databaseUrl: undefined,
      sessionSecret: 'test-session-secret'
    });
  });

  it('rejects the test session secret outside test mode', () => {
    expect(() => loadConfig({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgres://db',
      SESSION_SECRET: 'test-session-secret'
    })).toThrow('SESSION_SECRET must not use the test session secret outside test mode');
  });
});

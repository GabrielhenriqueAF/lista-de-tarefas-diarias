import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const env = {
  NODE_ENV: 'test',
  PORT: '0',
  DATABASE_URL: 'postgres://user:password@127.0.0.1:5432/daymint',
  SESSION_SECRET: 'a-session-secret-with-more-than-thirty-two-characters',
};

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

import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('createApp', () => {
  it('returns health without exposing configuration', async () => {
    const app = createApp({ config: { nodeEnv: 'test' }, repositories: {} });
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.json()).toEqual({ status: 'ok' });
    await app.close();
  });

  it('serializes domain errors without a stack trace', async () => {
    const app = createApp({ config: { nodeEnv: 'test' }, repositories: {} });
    app.get('/domain-error', () => {
      const error = new Error('Workspace not found');
      error.code = 'WORKSPACE_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    });

    const response = await app.inject({ method: 'GET', url: '/domain-error' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: 'WORKSPACE_NOT_FOUND', message: 'Workspace not found' }
    });
    await app.close();
  });

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
});

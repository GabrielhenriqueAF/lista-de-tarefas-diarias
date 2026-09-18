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
});

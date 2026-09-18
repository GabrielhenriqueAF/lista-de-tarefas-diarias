import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createIdentityFixture, registration } from './fixture.js';

const unauthenticated = { error: { code: 'UNAUTHENTICATED', message: 'Sessão inválida ou expirada.' } };

describe('identity HTTP routes', () => {
  let app;
  let pool;

  beforeEach(async () => {
    const fixture = await createIdentityFixture();
    pool = fixture.pool;
    app = createApp({ config: { nodeEnv: 'test' }, repositories: { identity: fixture.repository } });
  });

  afterEach(async () => { await app?.close(); await pool?.end(); });

  it('registers, reads public user data, logs in, and logs out', async () => {
    const registered = await app.inject({ method: 'POST', url: '/auth/register', payload: registration });
    expect(registered.statusCode).toBe(201);
    const { token, user, workspace, expiresAt } = registered.json();
    expect(workspace.name).toBe('Rotina Gabriel');
    expect(expiresAt).toEqual(expect.any(String));
    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: `Bearer ${token}` } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toEqual({ user: { id: user.id, email: registration.email, displayName: 'Gabriel' } });
    const loggedIn = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: registration.email, password: registration.password } });
    expect(loggedIn.statusCode).toBe(200);
    expect(loggedIn.json().token).not.toBe(token);
    const logout = await app.inject({ method: 'POST', url: '/auth/logout', headers: { authorization: `Bearer ${token}` } });
    expect(logout.statusCode).toBe(204);
    const revoked = await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: `Bearer ${token}` } });
    expect(revoked.statusCode).toBe(401);
    expect(revoked.json()).toEqual(unauthenticated);
    expect(JSON.stringify([registered.json(), me.json(), loggedIn.json()])).not.toMatch(/password|password_hash|token_digest|\$argon2/);
  });

  it('returns 409 for duplicate email and 401 for an incorrect password', async () => {
    await app.inject({ method: 'POST', url: '/auth/register', payload: registration });
    const duplicate = await app.inject({ method: 'POST', url: '/auth/register', payload: { ...registration, email: ' GABRIEL@example.test ' } });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe('EMAIL_ALREADY_EXISTS');
    const incorrect = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: registration.email, password: 'incorrect-password' } });
    expect(incorrect.statusCode).toBe(401);
    expect(incorrect.json()).toEqual(unauthenticated);
  });

  it('requires a valid Bearer token for both protected routes', async () => {
    for (const [method, url] of [['GET', '/auth/me'], ['POST', '/auth/logout']]) {
      for (const authorization of [undefined, 'Basic credentials', 'Bearer invalid', `Bearer ${'a'.repeat(43)}`, `Bearer ${'a'.repeat(43)} extra`]) {
        const response = await app.inject({ method, url, headers: authorization ? { authorization } : {} });
        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual(unauthenticated);
      }
    }
  });

  it('returns 401 for expired sessions on both protected routes', async () => {
    const registered = await app.inject({ method: 'POST', url: '/auth/register', payload: registration });
    await pool.query('UPDATE sessions SET expires_at = $1', [new Date('2000-01-01T00:00:00Z')]);
    for (const [method, url] of [['GET', '/auth/me'], ['POST', '/auth/logout']]) {
      const response = await app.inject({ method, url, headers: { authorization: `Bearer ${registered.json().token}` } });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual(unauthenticated);
    }
  });

  it('rejects missing fields without exposing internal errors', async () => {
    for (const url of ['/auth/register', '/auth/login']) {
      const response = await app.inject({ method: 'POST', url, payload: {} });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
      expect(response.json()).not.toHaveProperty('stack');
    }
  });

  it('rate limits registration and login independently per remote address', async () => {
    const rateLimited = {
      error: { code: 'RATE_LIMITED', message: 'Muitas tentativas. Tente novamente em instantes.' }
    };

    for (const url of ['/auth/register', '/auth/login']) {
      for (let attempt = 1; attempt <= 6; attempt += 1) {
        const response = await app.inject({
          method: 'POST',
          url,
          remoteAddress: '127.0.0.44',
          payload: { email: 'bad', password: 'short', displayName: 'Ana', workspaceName: 'Casa' }
        });

        if (attempt <= 5) {
          expect(response.statusCode).toBe(400);
          expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
        } else {
          expect(response.statusCode).toBe(429);
          expect(response.json()).toEqual(rateLimited);
          expect(JSON.stringify(response.json())).not.toMatch(/@|exist|token|stack/i);
        }
      }
    }
  });

  it('uses the actual remote address when forwarded addresses change', async () => {
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        remoteAddress: '127.0.0.55',
        headers: { 'x-forwarded-for': `198.51.100.${attempt + 7}` },
        payload: { email: 'bad', password: 'short', displayName: 'Ana', workspaceName: 'Casa' }
      });

      expect(response.statusCode).toBe(attempt <= 5 ? 400 : 429);
    }
  });

  it('rejects an 8193-byte JSON payload before identity work begins', async () => {
    const payload = JSON.stringify({ value: 'x'.repeat(8181) });
    expect(Buffer.byteLength(payload)).toBe(8193);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { 'content-type': 'application/json' },
      payload
    });

    expect(response.statusCode).toBe(413);
  });

  it('returns the generic public response when authentication work is saturated', async () => {
    app.get('/auth-busy-contract', () => {
      const error = new Error('private saturation detail');
      error.code = 'AUTH_BUSY';
      throw error;
    });

    const response = await app.inject({ method: 'GET', url: '/auth-busy-contract' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: { code: 'AUTH_BUSY', message: 'Serviço de autenticação temporariamente ocupado.' }
    });
  });

  it('makes the authenticated identity available to subsequent protected routes', async () => {
    app.get('/identity-contract', { preHandler: app.authenticate }, (request) => request.identity);
    const registered = await app.inject({ method: 'POST', url: '/auth/register', payload: registration });
    const result = await app.inject({ method: 'GET', url: '/identity-contract', headers: { authorization: `Bearer ${registered.json().token}` } });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual({ userId: registered.json().user.id, sessionId: expect.any(String) });
  });
});

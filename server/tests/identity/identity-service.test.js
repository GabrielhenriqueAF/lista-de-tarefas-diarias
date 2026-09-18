import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import argon2 from 'argon2';
import { createIdentityService } from '../../src/identity/identity-service.js';
import { createIdentityRepository } from '../../src/identity/identity-repository.js';
import { createIdentityFixture, registration } from './fixture.js';

describe('identity lifecycle', () => {
  let pool;
  let service;
  let currentTime;

  beforeEach(async () => {
    const fixture = await createIdentityFixture();
    pool = fixture.pool;
    currentTime = new Date('2026-09-17T12:00:00Z');
    service = createIdentityService({ repository: fixture.repository, now: () => currentTime });
  });

  afterEach(async () => { await pool?.end(); });

  it('creates Gabriel, his workspace and owner membership with a usable opaque session', async () => {
    const result = await service.register({ ...registration, email: '  GABRIEL@example.test ' });
    expect(result.user).toEqual({ id: expect.any(String), email: registration.email, displayName: 'Gabriel' });
    expect(result.workspace).toMatchObject({ id: expect.any(String), name: 'Rotina Gabriel', ownerId: result.user.id });
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.expiresAt).toEqual(new Date('2026-10-17T12:00:00Z'));
    const identity = await service.authenticate(result.token);
    expect(identity).toEqual({ userId: result.user.id, sessionId: expect.any(String) });
    expect((await pool.query('SELECT * FROM workspace_members')).rows).toMatchObject([
      { workspace_id: result.workspace.id, user_id: result.user.id, role: 'owner' }
    ]);
    const user = (await pool.query('SELECT * FROM users')).rows[0];
    expect(user.password_hash).toMatch(/^\$argon2/);
    expect(await argon2.verify(user.password_hash, registration.password)).toBe(true);
    const session = (await pool.query('SELECT * FROM sessions')).rows[0];
    expect(session.token_digest).toBe(createHash('sha256').update(result.token).digest('hex'));
    expect(JSON.stringify([user, session])).not.toContain(result.token);
    expect(JSON.stringify([user, session])).not.toContain(registration.password);
  });

  it('logs in with normalized email and issues a distinct usable session', async () => {
    const registered = await service.register(registration);
    const loggedIn = await service.login({ email: ' GABRIEL@example.test ', password: registration.password });
    expect(loggedIn.user).toEqual(registered.user);
    expect(loggedIn.token).not.toBe(registered.token);
    expect(await service.authenticate(loggedIn.token)).toMatchObject({ userId: registered.user.id });
  });

  it('rejects duplicate normalized email without creating another account or workspace', async () => {
    await service.register(registration);
    await expect(service.register({ ...registration, email: ' GABRIEL@example.test ' }))
      .rejects.toMatchObject({ code: 'EMAIL_ALREADY_EXISTS', statusCode: 409 });
    for (const table of ['users', 'workspaces', 'workspace_members', 'sessions']) {
      expect((await pool.query(`SELECT * FROM ${table}`)).rows).toHaveLength(1);
    }
  });

  it('rejects wrong passwords and unknown users without issuing sessions', async () => {
    await service.register(registration);
    for (const credentials of [
      { email: registration.email, password: 'incorrect-password' },
      { email: 'missing@example.test', password: registration.password }
    ]) {
      await expect(service.login(credentials)).rejects.toMatchObject({ code: 'UNAUTHENTICATED', statusCode: 401 });
    }
    expect((await pool.query('SELECT * FROM sessions')).rows).toHaveLength(1);
  });

  it('revokes only the supplied session on logout', async () => {
    const registered = await service.register(registration);
    const loggedIn = await service.login(registration);
    await service.logout(registered.token);
    await expect(service.authenticate(registered.token)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(service.logout(registered.token)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(await service.authenticate(loggedIn.token)).toMatchObject({ userId: registered.user.id });
  });

  it('rejects expiry at exactly 30 days, unknown tokens and malformed tokens', async () => {
    const { token } = await service.register(registration);
    currentTime = new Date('2026-10-17T11:59:59.999Z');
    await expect(service.authenticate(token)).resolves.toHaveProperty('sessionId');
    currentTime = new Date('2026-10-17T12:00:00Z');
    for (const invalidToken of [token, 'a'.repeat(43), '', undefined, {}, 'invalid']) {
      await expect(service.authenticate(invalidToken)).rejects.toMatchObject({ code: 'UNAUTHENTICATED', statusCode: 401 });
    }
    await expect(service.logout(token)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('rejects incomplete account input before persistence', async () => {
    for (const invalid of [undefined, {}, { ...registration, password: '' }, { ...registration, email: 'not-email' }, { ...registration, workspaceName: ' ' }]) {
      await expect(service.register(invalid)).rejects.toMatchObject({ statusCode: 400 });
    }
    expect((await pool.query('SELECT * FROM users')).rows).toHaveLength(0);
  });

  it('validates every registration field before password hashing starts', async () => {
    const authWorkLimiter = {
      run: async () => { throw new Error('password work must not start'); }
    };
    const validatingService = createIdentityService({
      repository: createIdentityRepository(pool),
      authWorkLimiter
    });

    for (const invalid of [
      { email: 'a@b.com', password: 'short', displayName: 'Ana', workspaceName: 'Casa' },
      { email: `${'a'.repeat(250)}@b.com`, password: '123456789012', displayName: 'Ana', workspaceName: 'Casa' },
      { email: 'ana@example.com', password: '123456789012', displayName: 'x'.repeat(121), workspaceName: 'Casa' },
      { email: 'ana@example.com', password: '123456789012', displayName: 'Ana', workspaceName: 'x'.repeat(121) },
      { email: 'ana@example.com', password: 'x'.repeat(129), displayName: 'Ana', workspaceName: 'Casa' }
    ]) {
      await expect(validatingService.register(invalid))
        .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    }

    expect((await pool.query('SELECT * FROM users')).rows).toHaveLength(0);
  });

  it('preserves the submitted password exactly across registration and login', async () => {
    const password = ' leading-space!';
    const registered = await service.register({ ...registration, password });

    await expect(service.login({ email: registration.email, password: password.trim() }))
      .rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(service.login({ email: registration.email, password }))
      .resolves.toMatchObject({ user: registered.user });
  });

  it('routes registration hashing and login verification through the injected limiter', async () => {
    const busyLimiter = {
      run: async () => {
        throw Object.assign(new Error('busy'), { code: 'AUTH_BUSY' });
      }
    };
    const limitedService = createIdentityService({ repository: createIdentityRepository(pool), authWorkLimiter: busyLimiter });

    await expect(limitedService.register(registration)).rejects.toMatchObject({ code: 'AUTH_BUSY' });
    expect((await pool.query('SELECT * FROM users')).rows).toHaveLength(0);

    await service.register(registration);
    await expect(limitedService.login(registration)).rejects.toMatchObject({ code: 'AUTH_BUSY' });
    expect((await pool.query('SELECT * FROM sessions')).rows).toHaveLength(1);
  });

  it('uses one transaction for registration and rolls back on membership failure', async () => {
    // pg-mem cannot roll back, so observe the actual SQL boundary on its client.
    const statements = [];
    const client = await pool.connect();
    const transactionPool = {
      connect: async () => ({
        query: async (sql, values) => {
          statements.push(sql.trim());
          if (sql.includes('INSERT INTO workspace_members')) throw new Error('membership write failed');
          return client.query(sql, values);
        },
        release: () => { statements.push('RELEASE'); client.release(); }
      })
    };
    const failingService = createIdentityService({ repository: createIdentityRepository(transactionPool) });
    await expect(failingService.register(registration)).rejects.toThrow('membership write failed');
    expect(statements[0]).toBe('BEGIN');
    expect(statements.slice(-2)).toEqual(['ROLLBACK', 'RELEASE']);
    expect(statements).not.toContain('COMMIT');
  });
});

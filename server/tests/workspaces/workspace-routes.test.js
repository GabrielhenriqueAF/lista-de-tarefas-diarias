import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createWorkspaceRepository } from '../../src/workspaces/workspace-repository.js';
import { createIdentityFixture, registration } from '../identity/fixture.js';

describe('workspace HTTP routes', () => {
  let app;
  let pool;

  beforeEach(async () => {
    const fixture = await createIdentityFixture();
    pool = fixture.pool;
    app = createApp({
      config: { nodeEnv: 'test' },
      repositories: { identity: fixture.repository, workspace: createWorkspaceRepository(pool) }
    });
  });

  afterEach(async () => { await app?.close(); await pool?.end(); });

  async function register(input) {
    const response = await app.inject({ method: 'POST', url: '/auth/register', payload: input });
    return response.json();
  }

  it('lists and creates workspaces for the authenticated user', async () => {
    const ana = await register({ ...registration, email: 'ana@example.test', workspaceName: 'Ana workspace' });
    const headers = { authorization: `Bearer ${ana.token}` };

    const list = await app.inject({ method: 'GET', url: '/workspaces', headers });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual({ workspaces: [expect.objectContaining({ id: ana.workspace.id, role: 'owner' })] });

    const created = await app.inject({ method: 'POST', url: '/workspaces', headers, payload: { name: 'Projetos da Ana' } });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ workspace: { name: 'Projetos da Ana', ownerId: ana.user.id, role: 'owner' } });
  });

  it('returns 404 when a non-member requests another workspace', async () => {
    const ana = await register({ ...registration, email: 'ana@example.test', workspaceName: 'Ana workspace' });
    const gabriel = await register(registration);
    const response = await app.inject({
      method: 'GET',
      url: `/workspaces/${ana.workspace.id}`,
      headers: { authorization: `Bearer ${gabriel.token}` }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'WORKSPACE_NOT_FOUND' } });
  });

  it('returns 404 for an authenticated malformed workspace ID', async () => {
    const ana = await register({ ...registration, email: 'ana@example.test', workspaceName: 'Ana workspace' });
    const response = await app.inject({
      method: 'GET', url: '/workspaces/not-a-uuid',
      headers: { authorization: `Bearer ${ana.token}` }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'WORKSPACE_NOT_FOUND' } });
  });

  it('makes membership verification available after authenticate', async () => {
    app.get('/membership-contract/:workspaceId', { preHandler: app.authenticate }, async (request) =>
      request.requireWorkspaceMembership(request.params.workspaceId, 'member')
    );
    const ana = await register({ ...registration, email: 'ana@example.test', workspaceName: 'Ana workspace' });
    const response = await app.inject({
      method: 'GET', url: `/membership-contract/${ana.workspace.id}`,
      headers: { authorization: `Bearer ${ana.token}` }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ workspaceId: ana.workspace.id, userId: ana.user.id, role: 'owner' });
  });
});

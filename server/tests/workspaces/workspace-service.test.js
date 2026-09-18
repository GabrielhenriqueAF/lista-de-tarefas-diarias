import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIdentityService } from '../../src/identity/identity-service.js';
import { createWorkspaceService } from '../../src/workspaces/workspace-service.js';
import { createWorkspaceRepository } from '../../src/workspaces/workspace-repository.js';
import { createIdentityFixture, registration } from '../identity/fixture.js';

describe('workspace membership', () => {
  let pool;
  let identityService;
  let service;

  beforeEach(async () => {
    const fixture = await createIdentityFixture();
    pool = fixture.pool;
    identityService = createIdentityService({ repository: fixture.repository });
    service = createWorkspaceService({ repository: createWorkspaceRepository(pool) });
  });

  afterEach(async () => { await pool?.end(); });

  async function createUserWithWorkspace(workspaceName) {
    return identityService.register({ ...registration, email: `${workspaceName.replaceAll(' ', '.')}@example.test`, workspaceName });
  }

  it('does not disclose Ana workspace to Gabriel', async () => {
    const ana = await createUserWithWorkspace('Ana workspace');
    const gabriel = await createUserWithWorkspace('Rotina Gabriel');

    await expect(service.requireMembership({
      userId: gabriel.user.id,
      workspaceId: ana.workspace.id,
      minimumRole: 'member'
    })).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND', statusCode: 404 });
  });

  it('creates a workspace with the caller as owner and lists only their memberships', async () => {
    const ana = await createUserWithWorkspace('Ana workspace');
    const gabriel = await createUserWithWorkspace('Rotina Gabriel');
    const created = await service.createForUser({ userId: ana.user.id, name: '  Projetos da Ana  ' });

    expect(created).toMatchObject({ id: expect.any(String), name: 'Projetos da Ana', ownerId: ana.user.id, role: 'owner' });
    await expect(service.listForUser(ana.user.id)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: ana.workspace.id, role: 'owner' }),
      expect.objectContaining({ id: created.id, role: 'owner' })
    ]));
    await expect(service.listForUser(gabriel.user.id)).resolves.toEqual([
      expect.objectContaining({ id: gabriel.workspace.id, role: 'owner' })
    ]);
  });

  it('rejects blank workspace names before persistence', async () => {
    const ana = await createUserWithWorkspace('Ana workspace');
    await expect(service.createForUser({ userId: ana.user.id, name: ' ' }))
      .rejects.toMatchObject({ code: 'INVALID_INPUT', statusCode: 400 });
    expect((await pool.query('SELECT * FROM workspaces')).rows).toHaveLength(1);
  });
});

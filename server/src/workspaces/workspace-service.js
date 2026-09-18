import { randomUUID } from 'node:crypto';

function invalidInput() {
  return Object.assign(new Error('Preencha os campos obrigatórios corretamente.'), {
    code: 'INVALID_INPUT', statusCode: 400
  });
}

function workspaceNotFound() {
  return Object.assign(new Error('Workspace not found'), {
    code: 'WORKSPACE_NOT_FOUND', statusCode: 404
  });
}

function requiredText(value) {
  if (typeof value !== 'string' || !value.trim()) throw invalidInput();
  return value.trim();
}

const roleRank = { member: 1, owner: 2 };

export function createWorkspaceService({ repository }) {
  return {
    async listForUser(userId) {
      return repository.listForUser(userId);
    },

    async createForUser({ userId, name }) {
      return repository.createForUser({
        userId,
        workspace: { id: randomUUID(), name: requiredText(name) }
      });
    },

    async requireMembership({ userId, workspaceId, minimumRole }) {
      const workspace = await repository.findMembership({ userId, workspaceId });
      if (!workspace || !roleRank[minimumRole] || roleRank[workspace.role] < roleRank[minimumRole]) {
        throw workspaceNotFound();
      }
      return { ...workspace, workspaceId: workspace.id, userId };
    }
  };
}

import { withTransaction } from '../database/pool.js';

const workspaceColumns = 'w.id, w.name, w.owner_id AS "ownerId", wm.role';

export function createWorkspaceRepository(pool) {
  return {
    async listForUser(userId) {
      const result = await pool.query(
        `SELECT ${workspaceColumns}
         FROM workspaces w
         JOIN workspace_members wm ON wm.workspace_id = w.id
         WHERE wm.user_id = $1
         ORDER BY w.created_at`,
        [userId]
      );
      return result.rows;
    },

    async createForUser({ workspace, userId }) {
      return withTransaction(pool, async (client) => {
        await client.query(
          'INSERT INTO workspaces (id, name, owner_id) VALUES ($1, $2, $3)',
          [workspace.id, workspace.name, userId]
        );
        await client.query(
          "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')",
          [workspace.id, userId]
        );
        return { ...workspace, ownerId: userId, role: 'owner' };
      });
    },

    async findMembership({ userId, workspaceId }) {
      const result = await pool.query(
        `SELECT ${workspaceColumns}
         FROM workspaces w
         JOIN workspace_members wm ON wm.workspace_id = w.id
         WHERE w.id = $1 AND wm.user_id = $2`,
        [workspaceId, userId]
      );
      return result.rows[0];
    }
  };
}

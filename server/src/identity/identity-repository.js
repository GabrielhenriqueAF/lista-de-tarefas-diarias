import { withTransaction } from '../database/pool.js';

const userColumns = 'id, email, display_name AS "displayName"';

export function createIdentityRepository(pool) {
  async function insertSession(client, session) {
    await client.query(
      'INSERT INTO sessions (id, user_id, token_digest, expires_at) VALUES ($1, $2, $3, $4)',
      [session.id, session.userId, session.tokenDigest, session.expiresAt]
    );
  }

  return {
    async createAccount({ user, workspace, session }) {
      return withTransaction(pool, async (client) => {
        try {
          await client.query(
            'INSERT INTO users (id, email, display_name, password_hash) VALUES ($1, $2, $3, $4)',
            [user.id, user.email, user.displayName, user.passwordHash]
          );
        } catch (error) {
          if (error.code !== '23505' || (error.constraint && error.constraint !== 'users_email_key')) throw error;
          throw Object.assign(new Error('Este e-mail já está cadastrado.'), {
            code: 'EMAIL_ALREADY_EXISTS', statusCode: 409
          });
        }
        await client.query(
          'INSERT INTO workspaces (id, name, owner_id) VALUES ($1, $2, $3)',
          [workspace.id, workspace.name, workspace.ownerId]
        );
        await client.query(
          "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')",
          [workspace.id, user.id]
        );
        await insertSession(client, session);
      });
    },

    async findUserByEmail(email) {
      const result = await pool.query(
        `SELECT ${userColumns}, password_hash AS "passwordHash" FROM users WHERE email = $1`, [email]
      );
      return result.rows[0];
    },

    async findUserById(userId) {
      const result = await pool.query(`SELECT ${userColumns} FROM users WHERE id = $1`, [userId]);
      return result.rows[0];
    },

    async createSession(session) {
      await insertSession(pool, session);
    },

    async findActiveSession(tokenDigest, now) {
      const result = await pool.query(
        `SELECT id AS "sessionId", user_id AS "userId" FROM sessions
         WHERE token_digest = $1 AND revoked_at IS NULL AND expires_at > $2`,
        [tokenDigest, now]
      );
      return result.rows[0];
    },

    async revokeSession(tokenDigest, now) {
      const result = await pool.query(
        `UPDATE sessions SET revoked_at = $2
         WHERE token_digest = $1 AND revoked_at IS NULL AND expires_at > $2 RETURNING id`,
        [tokenDigest, now]
      );
      return result.rows.length > 0;
    }
  };
}

import { Pool as PostgresPool } from 'pg';

export function createPool(connectionString, { onIdleError = () => {}, Pool = PostgresPool } = {}) {
  const pool = new Pool({ connectionString });
  pool.on('error', (error) => {
    onIdleError({ code: typeof error?.code === 'string' ? error.code : 'UNKNOWN' });
  });
  return pool;
}

export async function withTransaction(pool, callback) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

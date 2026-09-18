import { readFile } from 'node:fs/promises';
import { newDb } from 'pg-mem';
import { createIdentityRepository } from '../../src/identity/identity-repository.js';

export const registration = {
  email: 'gabriel@example.test',
  displayName: 'Gabriel',
  password: 'strong-test-password',
  workspaceName: 'Rotina Gabriel'
};

export async function createIdentityFixture() {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  await pool.query(await readFile(new URL('../../src/database/migrations/001_identity_and_workspaces.sql', import.meta.url), 'utf8'));
  return { pool, repository: createIdentityRepository(pool) };
}

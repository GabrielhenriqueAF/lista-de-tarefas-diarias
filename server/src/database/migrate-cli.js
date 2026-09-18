import { loadConfig } from '../config.js';
import { createPool } from './pool.js';
import { runMigrations } from './migrate.js';

export async function runMigrationCommand({
  env = process.env,
  poolFactory = createPool,
  migrate = runMigrations,
  writeError = () => {}
} = {}) {
  let pool;
  let exitCode = 0;

  try {
    const config = loadConfig(env);
    pool = poolFactory(config.databaseUrl);
    await migrate(pool);
  } catch (error) {
    writeError(typeof error?.code === 'string' ? error.code : 'MIGRATION_FAILED');
    exitCode = 1;
  } finally {
    if (pool) {
      await pool.end();
    }
  }

  return exitCode;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runMigrationCommand({ writeError: (code) => console.error(`Falha na migração: ${code}`) });
}

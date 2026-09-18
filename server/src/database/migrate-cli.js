import { pathToFileURL } from 'node:url';
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
      try {
        await pool.end();
      } catch (error) {
        if (exitCode === 0) {
          writeError(typeof error?.code === 'string' ? error.code : 'MIGRATION_FAILED');
          exitCode = 1;
        }
      }
    }
  }

  return exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runMigrationCommand({ writeError: (code) => console.error(`Falha na migração: ${code}`) });
}

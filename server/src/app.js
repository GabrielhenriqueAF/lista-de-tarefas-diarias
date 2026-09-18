import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { createPool } from './database/pool.js';
import { createIdentityRepository } from './identity/identity-repository.js';
import { createAuthWorkLimiter } from './identity/auth-work-limiter.js';
import { createIdentityService } from './identity/identity-service.js';
import { registerIdentityRoutes } from './identity/identity-routes.js';
import { createWorkspaceRepository } from './workspaces/workspace-repository.js';
import { createWorkspaceService } from './workspaces/workspace-service.js';
import { registerWorkspaceRoutes } from './workspaces/workspace-routes.js';

export function createApp({ config, repositories, readinessCheck } = {}) {
  const app = Fastify({ logger: false, bodyLimit: 8 * 1024, trustProxy: false });

  app.decorate('config', config);
  app.decorate('repositories', repositories);

  app.register(rateLimit, {
    global: false,
    errorResponseBuilder: () => ({
      error: { code: 'RATE_LIMITED', message: 'Muitas tentativas. Tente novamente em instantes.' },
    }),
  });

  let identityRepository = repositories.identity;
  let workspaceRepository = repositories.workspace;
  let pool;
  if ((!identityRepository || !workspaceRepository) && config.databaseUrl) {
    pool = createPool(config.databaseUrl, {
      onIdleError: ({ code }) => app.log.error({ code }, 'Daymint PostgreSQL pool error')
    });
    identityRepository ??= createIdentityRepository(pool);
    workspaceRepository ??= createWorkspaceRepository(pool);
    app.addHook('onClose', async () => pool.end());
  }
  readinessCheck ??= () => pool.query('SELECT 1');
  const authWorkLimiter = createAuthWorkLimiter({ maxConcurrent: 2 });
  const identityService = createIdentityService({ repository: identityRepository, authWorkLimiter });
  app.decorate('identityService', identityService);
  registerIdentityRoutes(app, identityService);
  const workspaceService = createWorkspaceService({ repository: workspaceRepository });
  app.decorate('workspaceService', workspaceService);
  registerWorkspaceRoutes(app, workspaceService);

  app.setErrorHandler((error, request, reply) => {
    if (error?.error?.code === 'RATE_LIMITED') {
      return reply.code(429).send(error);
    }

    if (error.code === 'AUTH_BUSY') {
      return reply.code(503).send({
        error: { code: 'AUTH_BUSY', message: 'Serviço de autenticação temporariamente ocupado.' },
      });
    }

    if (typeof error.code === 'string' && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message }
      });
    }

    return reply.status(500).send({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' }
    });
  });

  app.get('/health', () => ({ status: 'ok' }));

  app.get('/ready', async (_request, reply) => {
    try {
      await readinessCheck();
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({
        error: { code: 'DATABASE_UNAVAILABLE', message: 'Banco de dados indisponível.' }
      });
    }
  });

  return app;
}

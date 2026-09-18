import Fastify from 'fastify';
import { createPool } from './database/pool.js';
import { createIdentityRepository } from './identity/identity-repository.js';
import { createIdentityService } from './identity/identity-service.js';
import { registerIdentityRoutes } from './identity/identity-routes.js';

export function createApp({ config, repositories }) {
  const app = Fastify({ logger: false });

  app.decorate('config', config);
  app.decorate('repositories', repositories);

  let identityRepository = repositories.identity;
  if (!identityRepository && config.databaseUrl) {
    const pool = createPool(config.databaseUrl);
    identityRepository = createIdentityRepository(pool);
    app.addHook('onClose', async () => pool.end());
  }
  const identityService = createIdentityService({ repository: identityRepository });
  app.decorate('identityService', identityService);
  registerIdentityRoutes(app, identityService);

  app.setErrorHandler((error, request, reply) => {
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

  return app;
}

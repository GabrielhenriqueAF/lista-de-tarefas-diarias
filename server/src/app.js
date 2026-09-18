import Fastify from 'fastify';

export function createApp({ config, repositories }) {
  const app = Fastify({ logger: false });

  app.decorate('config', config);
  app.decorate('repositories', repositories);

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

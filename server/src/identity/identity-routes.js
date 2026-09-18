import { unauthenticated } from './identity-service.js';

function bearerToken(request) {
  const authorization = request.headers.authorization;
  const match = typeof authorization === 'string' && /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(authorization);
  if (!match) throw unauthenticated();
  return match[1];
}

export function registerIdentityRoutes(app, service) {
  app.decorateRequest('identity', null);
  app.decorate('authenticate', async (request) => {
    request.identity = await service.authenticate(bearerToken(request));
  });

  app.post('/auth/register', async (request, reply) => {
    const result = await service.register(request.body);
    return reply.code(201).send(result);
  });

  app.post('/auth/login', async (request) => service.login(request.body));

  app.post('/auth/logout', { preHandler: app.authenticate }, async (request, reply) => {
    await service.logout(bearerToken(request));
    return reply.code(204).send();
  });

  app.get('/auth/me', { preHandler: app.authenticate }, async (request) => ({
    user: await service.getUser(request.identity.userId)
  }));
}

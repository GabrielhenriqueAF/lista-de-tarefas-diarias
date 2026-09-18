export function registerWorkspaceRoutes(app, service) {
  app.decorateRequest('requireWorkspaceMembership', null);
  const authenticate = app.authenticate;
  app.authenticate = async (request) => {
    await authenticate(request);
    request.requireWorkspaceMembership = (workspaceId, minimumRole) => service.requireMembership({
      userId: request.identity.userId, workspaceId, minimumRole
    });
  };

  app.get('/workspaces', { preHandler: app.authenticate }, async (request) => ({
    workspaces: await service.listForUser(request.identity.userId)
  }));

  app.post('/workspaces', { preHandler: app.authenticate }, async (request, reply) => {
    const workspace = await service.createForUser({ userId: request.identity.userId, name: request.body?.name });
    return reply.code(201).send({ workspace });
  });

  app.get('/workspaces/:workspaceId', { preHandler: app.authenticate }, async (request) => ({
    workspace: await request.requireWorkspaceMembership(request.params.workspaceId, 'member')
  }));
}

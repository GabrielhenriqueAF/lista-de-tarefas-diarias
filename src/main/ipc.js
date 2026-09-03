const FINISH_REASONS = new Set(['goal_completed', 'fatigue', 'interruption', 'unexpected', 'other']);

function requireId(value, label = 'Identificador') {
  if (!Number.isInteger(value)) throw new Error(`${label} inválido.`);
}

function requireName(input) {
  if (typeof input?.name !== 'string' || input.name.trim() === '') throw new Error('Nome obrigatório.');
}

export function createHandlers(repositories) {
  return {
    async createActivity(input) {
      requireName(input);
      return repositories.activities.create(input);
    },
    async updateActivity(input) {
      requireId(input?.id, 'Atividade');
      requireName(input);
      return repositories.activities.update(input);
    },
    async archiveActivity(id) {
      requireId(id, 'Atividade');
      return repositories.activities.archive(id);
    },
    async listActivities() {
      return repositories.activities.listActive();
    },
    async createFront(input) {
      requireId(input?.activityId, 'Atividade');
      requireName(input);
      return repositories.fronts.create(input);
    },
    async updateFront(input) {
      requireId(input?.id, 'Frente');
      requireName(input);
      return repositories.fronts.update(input);
    },
    async listFronts(activityId) {
      requireId(activityId, 'Atividade');
      return repositories.fronts.listByActivity(activityId);
    },
    async createRule(input) {
      requireId(input?.activityId, 'Atividade');
      return repositories.rules.create(input);
    },
    async updateRule(input) {
      requireId(input?.id, 'Regra');
      return repositories.rules.update(input);
    },
    async listWeek(weekStart) {
      if (typeof weekStart !== 'string') throw new Error('Semana inválida.');
      return repositories.rules.listWeek(weekStart);
    },
    async startBlock(input) {
      requireId(input?.id, 'Bloco');
      if (typeof input.startedAt !== 'string') throw new Error('Horário de início obrigatório.');
      return repositories.blocks.start(input);
    },
    async finishBlock(input) {
      requireId(input?.id, 'Bloco');
      if (typeof input.finishedAt !== 'string') throw new Error('Horário de fim obrigatório.');
      if (!FINISH_REASONS.has(input.finishReason)) throw new Error('Motivo de encerramento inválido');
      return repositories.blocks.finish(input);
    },
    async listToday(date) {
      if (typeof date !== 'string') throw new Error('Data inválida.');
      return repositories.blocks.listToday(date);
    },
    async listHistory(frontId) {
      requireId(frontId, 'Frente');
      return repositories.blocks.listHistory(frontId);
    },
    async listChecklist(blockId) {
      requireId(blockId, 'Bloco');
      return repositories.blocks.listChecklist(blockId);
    },
    async toggleChecklist(input) {
      requireId(input?.id, 'Checklist');
      return repositories.blocks.toggleChecklistItem(input);
    },
    async createTrackItem(input) {
      requireId(input?.frontId, 'Frente');
      return repositories.track.create(input);
    },
    async completeTrackItem(input) {
      requireId(input?.id, 'Trilha');
      return repositories.track.complete(input.id, input.completedAt);
    },
    async listTrack(frontId) {
      requireId(frontId, 'Frente');
      return repositories.track.listByFront(frontId);
    },
    async dashboardReport(filter) {
      if (typeof filter?.from !== 'string' || typeof filter.to !== 'string') throw new Error('Filtro de período inválido.');
      return repositories.reports.getDashboardReport(filter);
    },
    async getTheme() {
      return repositories.settings.getTheme();
    },
    async setTheme(theme) {
      return repositories.settings.setTheme(theme);
    },
    async connectGoogle() {
      return repositories.google.connect();
    },
    googleStatus() {
      return repositories.google.status();
    },
    async syncGoogle() {
      return repositories.google.syncNow();
    }
  };
}

export function registerIpcHandlers(ipcMain, repositories) {
  const handlers = createHandlers(repositories);
  const channels = {
    'activities:create': (_event, input) => handlers.createActivity(input),
    'activities:update': (_event, input) => handlers.updateActivity(input),
    'activities:archive': (_event, id) => handlers.archiveActivity(id),
    'activities:list': () => handlers.listActivities(),
    'fronts:create': (_event, input) => handlers.createFront(input),
    'fronts:update': (_event, input) => handlers.updateFront(input),
    'fronts:list': (_event, activityId) => handlers.listFronts(activityId),
    'rules:create': (_event, input) => handlers.createRule(input),
    'rules:update': (_event, input) => handlers.updateRule(input),
    'rules:list-week': (_event, weekStart) => handlers.listWeek(weekStart),
    'blocks:start': (_event, input) => handlers.startBlock(input),
    'blocks:finish': (_event, input) => handlers.finishBlock(input),
    'blocks:list-today': (_event, date) => handlers.listToday(date),
    'blocks:list-history': (_event, frontId) => handlers.listHistory(frontId),
    'blocks:list-checklist': (_event, blockId) => handlers.listChecklist(blockId),
    'blocks:toggle-checklist': (_event, input) => handlers.toggleChecklist(input),
    'track:create': (_event, input) => handlers.createTrackItem(input),
    'track:complete': (_event, input) => handlers.completeTrackItem(input),
    'track:list': (_event, frontId) => handlers.listTrack(frontId),
    'reports:dashboard': (_event, filter) => handlers.dashboardReport(filter),
    'settings:get-theme': () => handlers.getTheme(),
    'settings:set-theme': (_event, theme) => handlers.setTheme(theme),
    'google:connect': () => handlers.connectGoogle(),
    'google:status': () => handlers.googleStatus(),
    'google:sync-now': () => handlers.syncGoogle()
  };
  Object.entries(channels).forEach(([channel, handler]) => ipcMain.handle(channel, handler));
}

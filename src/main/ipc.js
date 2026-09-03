function requireTitle(input) {
  if (typeof input?.title !== 'string' || input.title.trim() === '') {
    throw new Error('Título obrigatório');
  }
}

function requireSessionFinish(input) {
  if (!Number.isInteger(input?.id) || typeof input.finishedAt !== 'string') {
    throw new Error('Sessão e horário de fim obrigatórios');
  }
}

function requireProgressFilter(filter) {
  if (!Number.isInteger(filter?.taskId) || typeof filter.from !== 'string' || typeof filter.to !== 'string') {
    throw new Error('Filtro de progresso inválido');
  }
}

export function createHandlers(repositories) {
  return {
    async createTask(input) {
      requireTitle(input);
      return repositories.tasks.createTask(input);
    },

    async listWeek(weekStart) {
      if (typeof weekStart !== 'string') {
        throw new Error('Semana inválida');
      }
      return repositories.tasks.listWeek(weekStart);
    },

    async listTasks() {
      return repositories.tasks.listTasks();
    },

    async saveSchedule(input) {
      if (!Number.isInteger(input?.taskId) || !Number.isInteger(input.weekday) || typeof input.startTime !== 'string' || typeof input.endTime !== 'string') {
        throw new Error('Dados de horário inválidos');
      }
      return repositories.tasks.saveSchedule(input);
    },

    async startSession(input) {
      if (!Number.isInteger(input?.taskId) || typeof input.startedAt !== 'string') {
        throw new Error('Tarefa e horário de início obrigatórios');
      }
      return repositories.sessions.startSession(input);
    },

    async finishSession(input) {
      requireSessionFinish(input);
      return repositories.sessions.finishSession(input);
    },

    async recordProgress(input) {
      if (!Number.isInteger(input?.sessionId) || typeof input.subtaskTitle !== 'string' || typeof input.progress !== 'string' || typeof input.continuationPoint !== 'string') {
        throw new Error('Dados de progresso inválidos');
      }
      return repositories.sessions.recordProgress(input);
    },

    async listHistory(taskId) {
      if (!Number.isInteger(taskId)) {
        throw new Error('Tarefa inválida');
      }
      return repositories.sessions.listHistory(taskId);
    },

    async progressReport(filter) {
      requireProgressFilter(filter);
      return repositories.sessions.getProgressReport(filter);
    }
  };
}

export function registerIpcHandlers(ipcMain, repositories) {
  const handlers = createHandlers(repositories);
  ipcMain.handle('tasks:create', (_event, input) => handlers.createTask(input));
  ipcMain.handle('tasks:list', () => handlers.listTasks());
  ipcMain.handle('tasks:list-week', (_event, weekStart) => handlers.listWeek(weekStart));
  ipcMain.handle('tasks:save-schedule', (_event, input) => handlers.saveSchedule(input));
  ipcMain.handle('sessions:start', (_event, input) => handlers.startSession(input));
  ipcMain.handle('sessions:finish', (_event, input) => handlers.finishSession(input));
  ipcMain.handle('sessions:record-progress', (_event, input) => handlers.recordProgress(input));
  ipcMain.handle('sessions:list-history', (_event, taskId) => handlers.listHistory(taskId));
  ipcMain.handle('reports:progress', (_event, filter) => handlers.progressReport(filter));
}

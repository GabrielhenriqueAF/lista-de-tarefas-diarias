import { minutesBetween } from '../shared/domain.js';

function toSession(row) {
  return {
    id: row.id,
    taskId: row.task_id,
    scheduleId: row.schedule_id,
    plannedStartAt: row.planned_start_at,
    plannedEndAt: row.planned_end_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    note: row.note
  };
}

function toHistoryEntry(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    subtaskTitle: row.subtask_title,
    progress: row.progress,
    continuationPoint: row.continuation_point,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at
  };
}

export function createSessionRepository(database) {
  const insertSession = database.prepare(`
    INSERT INTO sessions (task_id, schedule_id, planned_start_at, planned_end_at, started_at, status)
    VALUES (@taskId, @scheduleId, @plannedStartAt, @plannedEndAt, @startedAt, 'in_progress')
  `);
  const findSession = database.prepare('SELECT * FROM sessions WHERE id = ?');
  const updateSession = database.prepare(`
    UPDATE sessions
    SET finished_at = @finishedAt, note = @note, status = 'completed'
    WHERE id = @id
  `);
  const insertProgress = database.prepare(`
    INSERT INTO progress_entries (session_id, subtask_title, progress, continuation_point, created_at)
    VALUES (@sessionId, @subtaskTitle, @progress, @continuationPoint, @createdAt)
  `);
  const completedSessionsForPeriod = database.prepare(`
    SELECT * FROM sessions
    WHERE task_id = @taskId
      AND status = 'completed'
      AND finished_at IS NOT NULL
      AND date(started_at) BETWEEN @from AND @to
    ORDER BY started_at
  `);
  const historyForTask = database.prepare(`
    SELECT progress_entries.*, sessions.started_at, sessions.finished_at
    FROM progress_entries
    JOIN sessions ON sessions.id = progress_entries.session_id
    WHERE sessions.task_id = ?
    ORDER BY progress_entries.created_at DESC, progress_entries.id DESC
  `);
  const subtasksForPeriod = database.prepare(`
    SELECT DISTINCT progress_entries.subtask_title
    FROM progress_entries
    JOIN sessions ON sessions.id = progress_entries.session_id
    WHERE sessions.task_id = @taskId
      AND date(sessions.started_at) BETWEEN @from AND @to
    ORDER BY progress_entries.subtask_title
  `);

  return {
    startSession({ taskId, scheduleId = null, startedAt, plannedStartAt = null, plannedEndAt = null }) {
      const result = insertSession.run({ taskId, scheduleId, startedAt, plannedStartAt, plannedEndAt });
      return toSession(findSession.get(result.lastInsertRowid));
    },

    finishSession({ id, finishedAt, note = null }) {
      const session = findSession.get(id);
      if (!session) {
        throw new Error('Sessão não encontrada.');
      }
      if (new Date(finishedAt) < new Date(session.started_at)) {
        throw new Error('O fim não pode ser anterior ao início.');
      }
      updateSession.run({ id, finishedAt, note });
      return toSession(findSession.get(id));
    },

    recordProgress({ sessionId, subtaskTitle, progress, continuationPoint }) {
      const createdAt = new Date().toISOString();
      const result = insertProgress.run({ sessionId, subtaskTitle, progress, continuationPoint, createdAt });
      return database.prepare('SELECT * FROM progress_entries WHERE id = ?').get(result.lastInsertRowid);
    },

    listHistory(taskId) {
      return historyForTask.all(taskId).map(toHistoryEntry);
    },

    getProgressReport({ taskId, from, to }) {
      const sessions = completedSessionsForPeriod.all({ taskId, from, to });
      return {
        realMinutes: sessions.reduce((total, session) => total + minutesBetween(session.started_at, session.finished_at), 0),
        activeDays: new Set(sessions.map((session) => session.started_at.slice(0, 10))).size,
        sessions: sessions.length,
        subtasks: subtasksForPeriod.all({ taskId, from, to }).map((row) => row.subtask_title)
      };
    }
  };
}

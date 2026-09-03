import { describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/main/database.js';
import { createSessionRepository } from '../../src/main/session-repository.js';
import { createTaskRepository } from '../../src/main/task-repository.js';

describe('task repository', () => {
  it('starts with no tasks in a fresh database', () => {
    const database = createDatabase(':memory:');
    const repository = createTaskRepository(database);

    expect(repository.listTasks()).toEqual([]);

    database.close();
  });

  it('returns a Tuesday English occurrence for the selected week', () => {
    const database = createDatabase(':memory:');
    const repository = createTaskRepository(database);
    const task = repository.createTask({ title: 'Estudar inglês', color: '#2563eb' });

    repository.saveSchedule({
      taskId: task.id,
      weekday: 2,
      startTime: '05:00',
      endTime: '08:00',
      subtaskTitle: 'Writing'
    });

    expect(repository.listWeek('2026-09-07')).toMatchObject([
      {
        title: 'Estudar inglês',
        date: '2026-09-08',
        subtaskTitle: 'Writing',
        startTime: '05:00'
      }
    ]);

    database.close();
  });
});

describe('session repository', () => {
  it('uses real times in the monthly report', () => {
    const database = createDatabase(':memory:');
    const tasks = createTaskRepository(database);
    const sessions = createSessionRepository(database);
    const task = tasks.createTask({ title: 'Estudar inglês', color: '#2563eb' });
    const session = sessions.startSession({ taskId: task.id, startedAt: '2026-09-08T05:18:00' });

    sessions.finishSession({
      id: session.id,
      finishedAt: '2026-09-08T07:40:00',
      note: 'Exercício 12 concluído'
    });

    expect(sessions.getProgressReport({
      taskId: task.id,
      from: '2026-09-01',
      to: '2026-09-30'
    }).realMinutes).toBe(142);

    database.close();
  });

  it('returns the most recent subtask continuation point first', () => {
    const database = createDatabase(':memory:');
    const tasks = createTaskRepository(database);
    const sessions = createSessionRepository(database);
    const task = tasks.createTask({ title: 'Estudar inglês', color: '#2563eb' });
    const session = sessions.startSession({ taskId: task.id, startedAt: '2026-09-08T05:18:00' });

    sessions.recordProgress({
      sessionId: session.id,
      subtaskTitle: 'Writing',
      progress: 'Unidade 3',
      continuationPoint: 'Começar no exercício 13'
    });

    expect(sessions.listHistory(task.id)[0].continuationPoint).toBe('Começar no exercício 13');

    database.close();
  });
});

import { describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/main/database.js';
import { createTaskRepository } from '../../src/main/task-repository.js';

describe('task repository', () => {
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

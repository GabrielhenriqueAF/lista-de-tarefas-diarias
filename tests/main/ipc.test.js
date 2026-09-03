import { describe, expect, it } from 'vitest';
import { createHandlers } from '../../src/main/ipc.js';

describe('IPC handlers', () => {
  it('rejects an untrusted create-task payload without a title', async () => {
    const handlers = createHandlers({ tasks: {}, sessions: {} });

    await expect(handlers.createTask({ color: '#2563eb' })).rejects.toThrow('Título obrigatório');
  });

  it('allows a valid weekly schedule to reach the repository', async () => {
    const savedSchedule = { id: 1, taskId: 3, weekday: 2, startTime: '05:00', endTime: '08:00' };
    const handlers = createHandlers({
      tasks: { saveSchedule: (input) => ({ ...savedSchedule, ...input }) },
      sessions: {}
    });

    await expect(handlers.saveSchedule({ ...savedSchedule, subtaskTitle: 'Writing' })).resolves.toMatchObject({
      taskId: 3,
      weekday: 2,
      subtaskTitle: 'Writing'
    });
  });
});

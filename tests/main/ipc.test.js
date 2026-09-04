import { describe, expect, it } from 'vitest';
import { createHandlers } from '../../src/main/ipc.js';

describe('routine IPC handlers', () => {
  it('rejects an invalid finish reason before it reaches the Block repository', async () => {
    const handlers = createHandlers({ blocks: {} });

    await expect(handlers.finishBlock({
      id: 1,
      finishedAt: '2026-09-08T07:40:00',
      finishReason: 'anything'
    })).rejects.toThrow('Motivo de encerramento inválido');
  });

  it('exposes only connect, status and manual sync for Google Calendar', async () => {
    const calls = [];
    const handlers = createHandlers({
      google: {
        connect: async () => { calls.push('connect'); return { connected: true }; },
        status: () => ({ connected: false, calendarName: 'Rotina Gabriel' }),
        syncNow: async () => { calls.push('sync'); return { lastSyncedAt: '2026-09-03T12:00:00Z' }; }
      }
    });

    await expect(handlers.connectGoogle()).resolves.toEqual({ connected: true });
    expect(handlers.googleStatus()).toEqual({ connected: false, calendarName: 'Rotina Gabriel' });
    await expect(handlers.syncGoogle()).resolves.toEqual({ lastSyncedAt: '2026-09-03T12:00:00Z' });
    expect(calls).toEqual(['connect', 'sync']);
  });

  it('routes archived activity lifecycle through the Google-aware controller', async () => {
    const calls = [];
    const handlers = createHandlers({
      activities: { listArchived: () => [{ id: 2, name: 'Inglês', active: false }] },
      google: {
        archiveActivity: async (id) => { calls.push(['archive', id]); return { id, active: false }; },
        restoreActivity: async (id) => { calls.push(['restore', id]); return { id, active: true }; },
        purgeActivity: async (id) => { calls.push(['purge', id]); return { id }; }
      }
    });

    await expect(handlers.archiveActivity(2)).resolves.toMatchObject({ active: false });
    await expect(handlers.restoreActivity(2)).resolves.toMatchObject({ active: true });
    await expect(handlers.purgeActivity(2)).resolves.toEqual({ id: 2 });
    await expect(handlers.listArchivedActivities()).resolves.toMatchObject([{ id: 2 }]);
    expect(calls).toEqual([['archive', 2], ['restore', 2], ['purge', 2]]);
  });

  it('creates a one-time Block through the explicit IPC channel', async () => {
    const received = [];
    const handlers = createHandlers({
      blocks: { createAdHoc: (input) => { received.push(input); return { id: 9, ...input }; } }
    });

    await expect(handlers.createAdHocBlock({ activityId: 1, title: 'Dentista', date: '2026-10-15' })).resolves.toMatchObject({ id: 9 });
    expect(received).toEqual([{ activityId: 1, title: 'Dentista', date: '2026-10-15' }]);
  });
});

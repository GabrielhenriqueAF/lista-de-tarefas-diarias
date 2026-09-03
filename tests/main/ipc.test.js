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
});

import { describe, expect, it } from 'vitest';
import { createBlockRepository } from '../../src/main/block-repository.js';
import { createDatabase } from '../../src/main/database.js';
import { createGoogleController } from '../../src/main/google/google-controller.js';
import { createRoutineRepository } from '../../src/main/routine-repository.js';
import { createSettingsRepository } from '../../src/main/settings-repository.js';
import { createSyncRepository } from '../../src/main/sync-repository.js';

describe('Google controller', () => {
  it('keeps the calendar state private while recording the last manual sync', async () => {
    const database = createDatabase(':memory:');
    const settings = createSettingsRepository(database);
    const controller = createGoogleController({
      auth: {
        status: () => ({ configured: true, connected: true }),
        connect: async () => ({ configured: true, connected: true }),
        getCalendarApi: () => ({
          calendarList: { list: async () => ({ data: { items: [{ id: 'cal-1', summary: 'Rotina Gabriel' }] } }) },
          calendars: { insert: async () => {} },
          events: { list: async () => ({ data: { items: [], nextSyncToken: 'sync-1' } }), insert: async () => {}, patch: async () => {}, delete: async () => {} }
        })
      },
      settings,
      queue: createSyncRepository(database),
      rules: createRoutineRepository(database),
      blocks: createBlockRepository(database)
    });

    const result = await controller.syncNow();

    expect(result.lastSyncedAt).toBeTruthy();
    expect(controller.status()).toMatchObject({ configured: true, connected: true, calendarName: 'Rotina Gabriel', lastSyncedAt: result.lastSyncedAt });
    database.close();
  });
});

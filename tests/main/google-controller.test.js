import { describe, expect, it } from 'vitest';
import { createActivityRepository } from '../../src/main/activity-repository.js';
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

  it('keeps an archived activity locally when Google refuses its permanent deletion', async () => {
    const database = createDatabase(':memory:');
    const settings = createSettingsRepository(database);
    const activities = createActivityRepository(database);
    const rules = createRoutineRepository(database);
    const english = activities.create({ name: 'Inglês', color: '#2563eb' });
    const rule = rules.create({ activityId: english.id, title: 'Inglês', weekdays: [2], startTime: '05:00', endTime: '08:00' });
    rules.setGoogleEventId(rule.id, 'google-english');
    activities.archive(english.id, '2026-09-08');
    const controller = createGoogleController({
      auth: {
        status: () => ({ configured: true, connected: true }),
        getCalendarApi: () => ({
          calendarList: { list: async () => ({ data: { items: [{ id: 'cal-1', summary: 'Rotina Gabriel' }] } }) },
          calendars: { insert: async () => {} },
          events: { delete: async () => { throw new Error('Falha do Google'); } }
        })
      },
      settings,
      queue: createSyncRepository(database),
      activities,
      rules,
      blocks: createBlockRepository(database)
    });

    await expect(controller.purgeActivity(english.id)).rejects.toThrow('Falha do Google');
    expect(activities.get(english.id)).toMatchObject({ active: false });
    database.close();
  });
});

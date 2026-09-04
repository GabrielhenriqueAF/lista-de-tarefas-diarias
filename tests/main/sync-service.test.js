import { describe, expect, it } from 'vitest';
import { createActivityRepository } from '../../src/main/activity-repository.js';
import { createBlockRepository } from '../../src/main/block-repository.js';
import { createDatabase } from '../../src/main/database.js';
import { createRoutineRepository } from '../../src/main/routine-repository.js';
import { createSyncRepository } from '../../src/main/sync-repository.js';
import { createSyncService } from '../../src/main/google/sync-service.js';

describe('Google bidirectional sync', () => {
  it('cancels a linked Block when its remote event is deleted', async () => {
    const database = createDatabase(':memory:');
    const activities = createActivityRepository(database);
    const rules = createRoutineRepository(database);
    const blocks = createBlockRepository(database);
    const queue = createSyncRepository(database);
    const english = activities.create({ name: 'Inglês', category: 'Estudo', color: '#2563eb' });
    rules.create({ activityId: english.id, title: 'Inglês', weekdays: [2], startTime: '05:00', endTime: '08:00' });
    const [block] = rules.ensureBlocksForWeek('2026-09-07');
    const sync = createSyncService({
      calendarService: { ensureRoutineCalendar: async () => 'rotina-gabriel' },
      google: {
        listEvents: async () => ({ data: { items: [{
          id: 'g-1',
          status: 'cancelled',
          updated: '2026-09-04T12:00:00Z',
          extendedProperties: { private: { blockId: String(block.id) } }
        }], nextSyncToken: 'next-token' } })
      },
      queue,
      rules,
      blocks
    });

    const result = await sync.syncNow();

    expect(result).toMatchObject({ pushed: 0, cancelled: 1 });
    expect(blocks.get(block.id).status).toBe('cancelled');
    expect(queue.getState('googleSyncToken')).toBe('next-token');
    database.close();
  });

  it('pushes a queued local rule before importing remote changes', async () => {
    const calls = [];
    const completed = [];
    const saved = [];
    const queue = {
      pending: () => [{ id: 1, operation: 'upsert-rule', payload: { id: 9 } }],
      markDone: (id) => completed.push(id),
      markFailed: () => {},
      getState: () => null,
      setState: () => {}
    };
    const sync = createSyncService({
      calendarService: { ensureRoutineCalendar: async () => 'rotina-gabriel' },
      google: {
        insertEvent: async (_calendarId, event) => { calls.push(['insert', event.summary]); return { data: { id: 'g-9' } }; },
        patchEvent: async () => {},
        listEvents: async () => { calls.push(['list']); return { data: { items: [] } }; }
      },
      queue,
      rules: {
        get: () => ({ id: 9, title: 'Inglês — Writing', weekdays: [2], startTime: '05:00', endTime: '08:00', updatedAt: '2026-09-03T10:00:00Z', googleEventId: null, active: true }),
        setGoogleEventId: (id, googleEventId) => saved.push([id, googleEventId])
      },
      blocks: {}
    });

    const result = await sync.syncNow();

    expect(result.pushed).toBe(1);
    expect(calls).toEqual([['insert', 'Inglês — Writing'], ['list']]);
    expect(completed).toEqual([1]);
    expect(saved).toEqual([[9, 'g-9']]);
  });

  it('pushes a queued one-time Block with its two reminders', async () => {
    const saved = [];
    const queue = {
      pending: () => [{ id: 4, operation: 'upsert-block', payload: { id: 17 } }],
      markDone: () => {}, markFailed: () => {}, getState: () => null, setState: () => {}
    };
    const sync = createSyncService({
      calendarService: { ensureRoutineCalendar: async () => 'rotina-gabriel' },
      google: {
        insertEvent: async (_calendarId, event) => ({ data: { id: 'google-block-17', event } }),
        listEvents: async () => ({ data: { items: [] } })
      },
      queue,
      rules: {},
      blocks: {
        get: () => ({ id: 17, title: 'Simulado TOEFL', plannedStartAt: '2026-10-15T09:00:00', plannedEndAt: '2026-10-15T11:00:00', updatedAt: '2026-09-04T12:00:00Z', status: 'planned', googleEventId: null }),
        setGoogleEventId: (id, googleEventId) => saved.push([id, googleEventId])
      }
    });

    await expect(sync.syncNow()).resolves.toMatchObject({ pushed: 1 });
    expect(saved).toEqual([[17, 'google-block-17']]);
  });

  it('deletes a queued Google event and treats a missing remote event as already deleted', async () => {
    const calls = [];
    const completed = [];
    const queue = {
      pending: () => [{ id: 3, operation: 'delete-rule', payload: { googleEventId: 'g-removed' } }],
      markDone: (id) => completed.push(id),
      markFailed: () => {},
      getState: () => null,
      setState: () => {}
    };
    const sync = createSyncService({
      calendarService: { ensureRoutineCalendar: async () => 'rotina-gabriel' },
      google: {
        deleteEvent: async (_calendarId, eventId) => {
          calls.push(eventId);
          const error = new Error('Not found');
          error.code = 404;
          throw error;
        },
        listEvents: async () => ({ data: { items: [] } })
      },
      queue,
      rules: {},
      blocks: {}
    });

    await expect(sync.syncNow()).resolves.toMatchObject({ pushed: 1 });
    expect(calls).toEqual(['g-removed']);
    expect(completed).toEqual([3]);
  });

  it('imports a newer remote rule title and schedule', async () => {
    const database = createDatabase(':memory:');
    const activities = createActivityRepository(database);
    const rules = createRoutineRepository(database);
    const blocks = createBlockRepository(database);
    const queue = createSyncRepository(database);
    const english = activities.create({ name: 'Inglês', category: 'Estudo', color: '#2563eb' });
    const rule = rules.create({ activityId: english.id, title: 'Inglês — Writing', weekdays: [2], startTime: '05:00', endTime: '08:00' });
    const sync = createSyncService({
      calendarService: { ensureRoutineCalendar: async () => 'rotina-gabriel' },
      google: {
        listEvents: async () => ({ data: { items: [{
          id: 'g-rule-1',
          status: 'confirmed',
          summary: 'Inglês — Writing revisado',
          updated: '2099-09-04T12:00:00Z',
          start: { dateTime: '2026-09-08T06:00:00-03:00' },
          end: { dateTime: '2026-09-08T09:00:00-03:00' },
          extendedProperties: { private: { recurrenceRuleId: String(rule.id) } }
        }] } })
      },
      queue,
      rules,
      blocks
    });

    const result = await sync.syncNow();

    expect(result.imported).toBe(1);
    expect(rules.get(rule.id)).toMatchObject({ title: 'Inglês — Writing revisado', startTime: '06:00', endTime: '09:00' });
    database.close();
  });

  it('deactivates a deleted remote rule and cancels only its future Blocks', async () => {
    const database = createDatabase(':memory:');
    const activities = createActivityRepository(database);
    const rules = createRoutineRepository(database);
    const blocks = createBlockRepository(database);
    const queue = createSyncRepository(database);
    const english = activities.create({ name: 'Inglês', category: 'Estudo', color: '#2563eb' });
    const rule = rules.create({ activityId: english.id, title: 'Inglês', weekdays: [2], startTime: '05:00', endTime: '08:00' });
    const [block] = rules.ensureBlocksForWeek('2026-09-07');
    const sync = createSyncService({
      calendarService: { ensureRoutineCalendar: async () => 'rotina-gabriel' },
      google: { listEvents: async () => ({ data: { items: [{
        id: 'g-rule-1',
        status: 'cancelled',
        updated: '2026-09-04T12:00:00Z',
        extendedProperties: { private: { recurrenceRuleId: String(rule.id) } }
      }] } }) },
      queue,
      rules,
      blocks
    });

    const result = await sync.syncNow();

    expect(result.cancelled).toBe(1);
    expect(rules.get(rule.id).active).toBe(false);
    expect(blocks.get(block.id).status).toBe('cancelled');
    database.close();
  });
});

import { describe, expect, it } from 'vitest';
import { createCalendarService, eventForRule } from '../../src/main/google/calendar-service.js';

describe('Rotina Gabriel calendar service', () => {
  it('builds a Tuesday Writing event with two reminders', () => {
    const event = eventForRule({
      id: 8,
      title: 'Inglês — Writing',
      weekdays: [2],
      startTime: '05:00',
      endTime: '08:00',
      updatedAt: '2026-09-03T10:00:00Z'
    }, new Date('2026-09-03T12:00:00Z'));

    expect(event).toMatchObject({
      summary: 'Inglês — Writing',
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=TU'],
      reminders: {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: 60 }, { method: 'popup', minutes: 10 }]
      },
      extendedProperties: { private: { recurrenceRuleId: '8', localUpdatedAt: '2026-09-03T10:00:00Z' } }
    });
    expect(event.start).toMatchObject({ timeZone: 'America/Sao_Paulo' });
    expect(event.start.dateTime).toMatch(/-03:00$/);
  });

  it('reuses an existing calendar named Rotina Gabriel', async () => {
    const saved = [];
    const service = createCalendarService({
      google: {
        listCalendars: async () => ({ data: { items: [{ id: 'calendar-9', summary: 'Rotina Gabriel' }] } }),
        createCalendar: async () => { throw new Error('Não deveria criar outro calendário'); }
      },
      settings: { get: () => null, set: (key, value) => saved.push([key, value]) }
    });

    await expect(service.ensureRoutineCalendar()).resolves.toBe('calendar-9');
    expect(saved).toEqual([['googleCalendarId', 'calendar-9']]);
  });
});

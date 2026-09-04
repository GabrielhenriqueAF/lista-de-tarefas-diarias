const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const TIME_ZONE = 'America/Sao_Paulo';
const REMINDERS = {
  useDefault: false,
  overrides: [{ method: 'popup', minutes: 60 }, { method: 'popup', minutes: 10 }]
};

function dateForNextWeekday(weekday, now) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + ((weekday - date.getUTCDay() + 7) % 7));
  return date.toISOString().slice(0, 10);
}

function dateForFirstOccurrence(rule, now) {
  const nextDate = dateForNextWeekday(rule.weekdays[0], now);
  if (!rule.startsOn || nextDate >= rule.startsOn) return nextDate;
  return dateForNextWeekday(rule.weekdays[0], new Date(`${rule.startsOn}T12:00:00Z`));
}

function zonedDateTime(date, time) {
  return `${date}T${time}:00-03:00`;
}

function responseData(response) {
  return response?.data ?? response;
}

export function eventForRule(rule, now = new Date()) {
  const firstDate = dateForFirstOccurrence(rule, now);
  const recurrence = [`RRULE:FREQ=WEEKLY;BYDAY=${rule.weekdays.map((day) => DAY_CODES[day]).join(',')}`];
  if (rule.endsOn) recurrence[0] += `;UNTIL=${rule.endsOn.replaceAll('-', '')}T235959Z`;
  return {
    summary: rule.title,
    start: { dateTime: zonedDateTime(firstDate, rule.startTime), timeZone: TIME_ZONE },
    end: { dateTime: zonedDateTime(firstDate, rule.endTime), timeZone: TIME_ZONE },
    recurrence,
    reminders: REMINDERS,
    extendedProperties: { private: { recurrenceRuleId: String(rule.id), localUpdatedAt: rule.updatedAt } }
  };
}

export function eventForBlock(block) {
  return {
    summary: block.title,
    start: { dateTime: `${block.plannedStartAt}-03:00`, timeZone: TIME_ZONE },
    end: { dateTime: `${block.plannedEndAt}-03:00`, timeZone: TIME_ZONE },
    reminders: REMINDERS,
    extendedProperties: { private: { blockId: String(block.id), localUpdatedAt: block.updatedAt } }
  };
}

export function createCalendarService({ google, settings }) {
  return {
    async ensureRoutineCalendar() {
      const savedId = settings.get('googleCalendarId');
      if (savedId) return savedId;

      const calendarList = responseData(await google.listCalendars());
      const existing = (calendarList.items ?? []).find((calendar) => calendar.summary === 'Rotina Gabriel');
      const calendar = existing ?? responseData(await google.createCalendar('Rotina Gabriel'));
      settings.set('googleCalendarId', calendar.id);
      return calendar.id;
    }
  };
}

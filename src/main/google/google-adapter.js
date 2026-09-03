export function createGoogleAdapter(calendarApi) {
  return {
    listCalendars: () => calendarApi.calendarList.list(),
    createCalendar: (summary) => calendarApi.calendars.insert({ requestBody: { summary } }),
    listEvents: (calendarId, params) => calendarApi.events.list({ calendarId, ...params }),
    insertEvent: (calendarId, requestBody) => calendarApi.events.insert({ calendarId, requestBody }),
    patchEvent: (calendarId, eventId, requestBody) => calendarApi.events.patch({ calendarId, eventId, requestBody }),
    deleteEvent: (calendarId, eventId) => calendarApi.events.delete({ calendarId, eventId })
  };
}

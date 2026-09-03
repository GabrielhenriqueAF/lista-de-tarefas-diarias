import { createCalendarService } from './calendar-service.js';
import { createGoogleAdapter } from './google-adapter.js';
import { createSyncService } from './sync-service.js';

export function createGoogleController({ auth, settings, queue, rules, blocks }) {
  return {
    status() {
      return {
        ...auth.status(),
        calendarName: 'Rotina Gabriel',
        lastSyncedAt: queue.getState('lastGoogleSyncAt')
      };
    },

    async connect() {
      return auth.connect();
    },

    async syncNow() {
      const google = createGoogleAdapter(auth.getCalendarApi());
      const calendarService = createCalendarService({ google, settings });
      const syncService = createSyncService({ calendarService, google, queue, rules, blocks });
      const result = await syncService.syncNow();
      queue.setState('lastGoogleSyncAt', result.lastSyncedAt);
      return result;
    }
  };
}

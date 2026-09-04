import { createCalendarService } from './calendar-service.js';
import { createGoogleAdapter } from './google-adapter.js';
import { createSyncService } from './sync-service.js';

function isNotFound(error) {
  return error?.code === 404 || error?.response?.status === 404;
}

export function createGoogleController({ auth, settings, queue, rules, blocks, activities = null }) {
  function services() {
    const google = createGoogleAdapter(auth.getCalendarApi());
    const calendarService = createCalendarService({ google, settings });
    const syncService = createSyncService({ calendarService, google, queue, rules, blocks });
    return { google, calendarService, syncService };
  }

  function requireActivities() {
    if (!activities) throw new Error('Repositório de atividades indisponível.');
    return activities;
  }

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
      const { syncService } = services();
      const result = await syncService.syncNow();
      queue.setState('lastGoogleSyncAt', result.lastSyncedAt);
      return result;
    },

    async archiveActivity(id, today) {
      const result = requireActivities().archive(id, today);
      result.ruleEventIds.forEach(({ googleEventId }) => queue.enqueue('delete-rule', { googleEventId }));
      if (result.ruleEventIds.length > 0 && auth.status().connected) await this.syncNow();
      return result.activity;
    },

    async restoreActivity(id) {
      const result = requireActivities().restore(id);
      result.ruleIds.forEach((ruleId) => queue.enqueue('upsert-rule', { id: ruleId }));
      if (result.ruleIds.length > 0 && auth.status().connected) await this.syncNow();
      return result.activity;
    },

    async purgeActivity(id) {
      const activityRepository = requireActivities();
      const activity = activityRepository.get(id);
      if (!activity) throw new Error('Atividade não encontrada.');
      if (activity.active) throw new Error('Arquive a atividade antes de excluí-la definitivamente.');
      const eventIds = activityRepository.getRuleEventIds(id).map(({ googleEventId }) => googleEventId);
      if (eventIds.length > 0) {
        if (!auth.status().connected) throw new Error('Conecte sua conta do Google para remover esta atividade também da Agenda.');
        const { google, calendarService } = services();
        const calendarId = await calendarService.ensureRoutineCalendar();
        for (const eventId of eventIds) {
          try {
            await google.deleteEvent(calendarId, eventId);
          } catch (error) {
            if (!isNotFound(error)) throw error;
          }
        }
      }
      return activityRepository.purge(id);
    }
  };
}

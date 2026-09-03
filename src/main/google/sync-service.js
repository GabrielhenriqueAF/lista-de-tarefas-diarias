import { eventForRule } from './calendar-service.js';

function responseData(response) {
  return response?.data ?? response;
}

export function createSyncService({ calendarService, google, queue, rules, blocks }) {
  async function pushOperation(calendarId, operation) {
    if (operation.operation !== 'upsert-rule') {
      throw new Error(`Operação de sincronização desconhecida: ${operation.operation}`);
    }
    const rule = rules.get(operation.payload.id);
    if (!rule || !rule.active) return;
    const event = eventForRule(rule);
    if (rule.googleEventId) {
      await google.patchEvent(calendarId, rule.googleEventId, event);
    } else {
      const created = responseData(await google.insertEvent(calendarId, event));
      rules.setGoogleEventId(rule.id, created.id);
    }
  }

  function importEvent(event, summary) {
    const privateProperties = event.extendedProperties?.private ?? {};
    if (event.status === 'cancelled' && privateProperties.blockId) {
      const block = blocks.get(Number(privateProperties.blockId));
      if (block && block.status !== 'completed') {
        blocks.cancel(block.id);
        summary.cancelled += 1;
      }
      return;
    }
    if (event.status === 'cancelled' && privateProperties.recurrenceRuleId) {
      const result = rules.deactivateFromGoogle(Number(privateProperties.recurrenceRuleId));
      if (result?.cancelledBlocks) summary.cancelled += result.cancelledBlocks;
      return;
    }
    if (event.status === 'cancelled' || !privateProperties.recurrenceRuleId) return;

    const rule = rules.get(Number(privateProperties.recurrenceRuleId));
    if (!rule || !event.updated) return;
    if (new Date(event.updated) <= new Date(rule.updatedAt)) {
      summary.conflicts += 1;
      return;
    }
    const startTime = event.start?.dateTime?.slice(11, 16);
    const endTime = event.end?.dateTime?.slice(11, 16);
    if (!startTime || !endTime) return;
    rules.applyGoogleSchedule({
      id: rule.id,
      title: event.summary ?? rule.title,
      startTime,
      endTime,
      googleEventId: event.id,
      updatedAt: event.updated
    });
    summary.imported += 1;
  }

  return {
    async syncNow() {
      const calendarId = await calendarService.ensureRoutineCalendar();
      const summary = { pushed: 0, imported: 0, cancelled: 0, conflicts: 0, lastSyncedAt: new Date().toISOString() };

      for (const operation of queue.pending()) {
        try {
          await pushOperation(calendarId, operation);
          queue.markDone(operation.id);
          summary.pushed += 1;
        } catch (error) {
          queue.markFailed(operation.id, error);
          throw error;
        }
      }

      const syncToken = queue.getState('googleSyncToken');
      const response = responseData(await google.listEvents(calendarId, {
        ...(syncToken ? { syncToken } : {}),
        showDeleted: true,
        singleEvents: false
      }));
      for (const event of response.items ?? []) {
        importEvent(event, summary);
      }
      if (response.nextSyncToken) queue.setState('googleSyncToken', response.nextSyncToken);
      return summary;
    }
  };
}

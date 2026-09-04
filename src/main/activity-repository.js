import { assertNonEmpty } from '../shared/domain.js';

function mapActivity(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    color: row.color,
    weeklyGoalMinutes: row.weekly_goal_minutes,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function createActivityRepository(database) {
  const findById = database.prepare('SELECT * FROM activities WHERE id = ?');
  const insert = database.prepare(`
    INSERT INTO activities (name, category, color, weekly_goal_minutes, created_at, updated_at)
    VALUES (@name, @category, @color, @weeklyGoalMinutes, @timestamp, @timestamp)
  `);
  const update = database.prepare(`
    UPDATE activities
    SET name = @name, category = @category, color = @color, weekly_goal_minutes = @weeklyGoalMinutes, updated_at = @timestamp
    WHERE id = @id
  `);
  const listActive = database.prepare('SELECT * FROM activities WHERE active = 1 ORDER BY name COLLATE NOCASE');
  const listArchived = database.prepare('SELECT * FROM activities WHERE active = 0 ORDER BY updated_at DESC, name COLLATE NOCASE');
  const archiveActivity = database.prepare('UPDATE activities SET active = 0, updated_at = @timestamp WHERE id = @id');
  const restoreActivity = database.prepare('UPDATE activities SET active = 1, updated_at = @timestamp WHERE id = @id');
  const archiveFronts = database.prepare('UPDATE fronts SET active = 0, updated_at = @timestamp WHERE activity_id = @id');
  const restoreFronts = database.prepare('UPDATE fronts SET active = 1, updated_at = @timestamp WHERE activity_id = @id');
  const archiveRules = database.prepare('UPDATE recurrence_rules SET active = 0, updated_at = @timestamp WHERE activity_id = @id');
  const restoreRules = database.prepare('UPDATE recurrence_rules SET active = 1, updated_at = @timestamp WHERE activity_id = @id');
  const cancelFuturePlannedBlocks = database.prepare(`
    UPDATE blocks SET status = 'cancelled', updated_at = @timestamp
    WHERE activity_id = @id AND status = 'planned' AND date >= @today
  `);
  const ruleEventIds = database.prepare(`
    SELECT id, google_event_id FROM recurrence_rules
    WHERE activity_id = ? AND google_event_id IS NOT NULL
  `);
  const googleEventIds = database.prepare(`
    SELECT google_event_id FROM recurrence_rules
    WHERE activity_id = ? AND google_event_id IS NOT NULL
    UNION
    SELECT google_event_id FROM blocks
    WHERE activity_id = ? AND google_event_id IS NOT NULL
  `);
  const ruleIds = database.prepare('SELECT id FROM recurrence_rules WHERE activity_id = ?');
  const deleteChecklist = database.prepare('DELETE FROM block_checklist_items WHERE block_id IN (SELECT id FROM blocks WHERE activity_id = ?)');
  const deleteTrack = database.prepare('DELETE FROM track_items WHERE front_id IN (SELECT id FROM fronts WHERE activity_id = ?)');
  const deleteBlocks = database.prepare('DELETE FROM blocks WHERE activity_id = ?');
  const deleteRules = database.prepare('DELETE FROM recurrence_rules WHERE activity_id = ?');
  const deleteFronts = database.prepare('DELETE FROM fronts WHERE activity_id = ?');
  const deleteActivity = database.prepare('DELETE FROM activities WHERE id = ?');

  return {
    create({ name, category = '', color = '#2563eb', weeklyGoalMinutes = null }) {
      assertNonEmpty(name, 'Nome');
      const timestamp = new Date().toISOString();
      const result = insert.run({ name: name.trim(), category, color, weeklyGoalMinutes, timestamp });
      return mapActivity(findById.get(result.lastInsertRowid));
    },

    update({ id, name, category = '', color, weeklyGoalMinutes = null }) {
      assertNonEmpty(name, 'Nome');
      const timestamp = new Date().toISOString();
      update.run({ id, name: name.trim(), category, color, weeklyGoalMinutes, timestamp });
      return mapActivity(findById.get(id));
    },

    listActive() {
      return listActive.all().map(mapActivity);
    },

    get(id) {
      const activity = findById.get(id);
      return activity ? mapActivity(activity) : null;
    },

    listArchived() {
      return listArchived.all().map(mapActivity);
    },

    archive(id, today = new Date().toISOString().slice(0, 10)) {
      const timestamp = new Date().toISOString();
      return database.transaction(() => {
        const activity = findById.get(id);
        if (!activity) throw new Error('Atividade não encontrada.');
        const linkedRuleEvents = ruleEventIds.all(id).map((row) => ({ id: row.id, googleEventId: row.google_event_id }));
        const linkedGoogleEvents = googleEventIds.all(id, id).map((row) => row.google_event_id);
        archiveActivity.run({ id, timestamp });
        archiveFronts.run({ id, timestamp });
        archiveRules.run({ id, timestamp });
        cancelFuturePlannedBlocks.run({ id, today, timestamp });
        return { activity: mapActivity(findById.get(id)), ruleEventIds: linkedRuleEvents, googleEventIds: linkedGoogleEvents };
      })();
    },

    restore(id) {
      const timestamp = new Date().toISOString();
      return database.transaction(() => {
        const activity = findById.get(id);
        if (!activity) throw new Error('Atividade não encontrada.');
        restoreActivity.run({ id, timestamp });
        restoreFronts.run({ id, timestamp });
        restoreRules.run({ id, timestamp });
        return {
          activity: mapActivity(findById.get(id)),
          ruleIds: ruleIds.all(id).map((row) => row.id)
        };
      })();
    },

    getRuleEventIds(id) {
      return ruleEventIds.all(id).map((row) => ({ id: row.id, googleEventId: row.google_event_id }));
    },

    getGoogleEventIds(id) {
      return googleEventIds.all(id, id).map((row) => row.google_event_id);
    },

    purge(id) {
      return database.transaction(() => {
        const activity = findById.get(id);
        if (!activity) throw new Error('Atividade não encontrada.');
        if (activity.active) throw new Error('Arquive a atividade antes de excluí-la definitivamente.');
        deleteChecklist.run(id);
        deleteTrack.run(id);
        deleteBlocks.run(id);
        deleteRules.run(id);
        deleteFronts.run(id);
        deleteActivity.run(id);
        return { id };
      })();
    }
  };
}

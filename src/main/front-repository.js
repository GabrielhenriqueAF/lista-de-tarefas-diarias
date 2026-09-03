import { assertNonEmpty } from '../shared/domain.js';

function mapFront(row) {
  return {
    id: row.id,
    activityId: row.activity_id,
    name: row.name,
    currentPoint: row.current_point,
    nextStep: row.next_step,
    defaultWeekday: row.default_weekday,
    weeklyGoalMinutes: row.weekly_goal_minutes,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function createFrontRepository(database) {
  const findById = database.prepare('SELECT * FROM fronts WHERE id = ?');
  const insert = database.prepare(`
    INSERT INTO fronts (activity_id, name, current_point, next_step, default_weekday, weekly_goal_minutes, created_at, updated_at)
    VALUES (@activityId, @name, @currentPoint, @nextStep, @defaultWeekday, @weeklyGoalMinutes, @timestamp, @timestamp)
  `);
  const update = database.prepare(`
    UPDATE fronts
    SET name = @name, current_point = @currentPoint, next_step = @nextStep, default_weekday = @defaultWeekday,
        weekly_goal_minutes = @weeklyGoalMinutes, active = @active, updated_at = @timestamp
    WHERE id = @id
  `);
  const listByActivity = database.prepare('SELECT * FROM fronts WHERE activity_id = ? AND active = 1 ORDER BY name COLLATE NOCASE');

  return {
    create({ activityId, name, currentPoint = '', nextStep = '', defaultWeekday = null, weeklyGoalMinutes = null }) {
      assertNonEmpty(name, 'Nome');
      const timestamp = new Date().toISOString();
      const result = insert.run({ activityId, name: name.trim(), currentPoint, nextStep, defaultWeekday, weeklyGoalMinutes, timestamp });
      return mapFront(findById.get(result.lastInsertRowid));
    },

    update({ id, name, currentPoint = '', nextStep = '', defaultWeekday = null, weeklyGoalMinutes = null, active = true }) {
      assertNonEmpty(name, 'Nome');
      const timestamp = new Date().toISOString();
      update.run({ id, name: name.trim(), currentPoint, nextStep, defaultWeekday, weeklyGoalMinutes, active: active ? 1 : 0, timestamp });
      return mapFront(findById.get(id));
    },

    get(id) {
      const row = findById.get(id);
      return row ? mapFront(row) : null;
    },

    listByActivity(activityId) {
      return listByActivity.all(activityId).map(mapFront);
    }
  };
}

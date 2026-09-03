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
  const archive = database.prepare('UPDATE activities SET active = 0, updated_at = ? WHERE id = ?');
  const listActive = database.prepare('SELECT * FROM activities WHERE active = 1 ORDER BY name COLLATE NOCASE');

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

    archive(id) {
      archive.run(new Date().toISOString(), id);
      return mapActivity(findById.get(id));
    }
  };
}

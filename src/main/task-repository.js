import { assertSchedule, assertTask, dateForWeekday } from '../shared/domain.js';

function toTask(row) {
  return {
    id: row.id,
    title: row.title,
    color: row.color,
    monthlyGoalMinutes: row.monthly_goal_minutes,
    archived: Boolean(row.archived),
    googleEventId: row.google_event_id,
    updatedAt: row.updated_at
  };
}

function toSchedule(row) {
  return {
    id: row.id,
    taskId: row.task_id,
    weekday: row.weekday,
    startTime: row.start_time,
    endTime: row.end_time,
    subtaskTitle: row.subtask_title,
    updatedAt: row.updated_at
  };
}

export function createTaskRepository(database) {
  const insertTask = database.prepare(`
    INSERT INTO tasks (title, color, monthly_goal_minutes, updated_at)
    VALUES (@title, @color, @monthlyGoalMinutes, @updatedAt)
  `);
  const insertSchedule = database.prepare(`
    INSERT INTO weekly_schedules (task_id, weekday, start_time, end_time, subtask_title, updated_at)
    VALUES (@taskId, @weekday, @startTime, @endTime, @subtaskTitle, @updatedAt)
  `);
  const findTask = database.prepare('SELECT * FROM tasks WHERE id = ?');
  const findSchedule = database.prepare('SELECT * FROM weekly_schedules WHERE id = ?');
  const listActiveSchedules = database.prepare(`
    SELECT weekly_schedules.*, tasks.title, tasks.color
    FROM weekly_schedules
    JOIN tasks ON tasks.id = weekly_schedules.task_id
    WHERE tasks.archived = 0
  `);

  return {
    createTask({ title, color, monthlyGoalMinutes = null }) {
      assertTask({ title });
      const updatedAt = new Date().toISOString();
      const result = insertTask.run({
        title: title.trim(),
        color: color ?? '#2563eb',
        monthlyGoalMinutes,
        updatedAt
      });
      return toTask(findTask.get(result.lastInsertRowid));
    },

    saveSchedule({ taskId, weekday, startTime, endTime, subtaskTitle = null }) {
      assertSchedule({ weekday, startTime, endTime });
      const updatedAt = new Date().toISOString();
      const result = insertSchedule.run({ taskId, weekday, startTime, endTime, subtaskTitle, updatedAt });
      return toSchedule(findSchedule.get(result.lastInsertRowid));
    },

    listTasks() {
      return database.prepare('SELECT * FROM tasks ORDER BY title').all().map(toTask);
    },

    listWeek(weekStart) {
      return listActiveSchedules.all()
        .map((schedule) => ({
          ...toSchedule(schedule),
          title: schedule.title,
          color: schedule.color,
          date: dateForWeekday(weekStart, schedule.weekday)
        }))
        .sort((first, second) => `${first.date}${first.startTime}`.localeCompare(`${second.date}${second.startTime}`));
    }
  };
}

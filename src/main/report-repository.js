import { minutesBetween } from '../shared/domain.js';

function toSeries(map) {
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((first, second) => first.label.localeCompare(second.label));
}

function weekLabel(date) {
  const value = new Date(`${date}T12:00:00Z`);
  const firstThursday = new Date(Date.UTC(value.getUTCFullYear(), 0, 4));
  const offset = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - offset);
  const week = Math.floor((value - firstThursday) / 604800000) + 1;
  return `${value.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function createReportRepository(database) {
  const completedBlocks = database.prepare(`
    SELECT blocks.*, activities.name AS activity_name, fronts.name AS front_name
    FROM blocks
    JOIN activities ON activities.id = blocks.activity_id
    LEFT JOIN fronts ON fronts.id = blocks.front_id
    WHERE blocks.status = 'completed'
      AND blocks.started_at IS NOT NULL
      AND blocks.finished_at IS NOT NULL
      AND blocks.date BETWEEN @from AND @to
      AND (@activityId IS NULL OR blocks.activity_id = @activityId)
      AND (@frontId IS NULL OR blocks.front_id = @frontId)
  `);

  return {
    getDashboardReport({ from, to, activityId = null, frontId = null }) {
      const rows = completedBlocks.all({ from, to, activityId, frontId });
      const activityMinutes = new Map();
      const frontMinutes = new Map();
      const dailyMinutes = new Map();
      const weeklyMinutes = new Map();
      const adherence = new Map([['Em cima', 0], ['Atrasado', 0], ['Furou', 0]]);
      let realMinutes = 0;

      for (const row of rows) {
        const minutes = minutesBetween(row.started_at, row.finished_at);
        realMinutes += minutes;
        activityMinutes.set(row.activity_name, (activityMinutes.get(row.activity_name) ?? 0) + minutes);
        if (row.front_name) frontMinutes.set(row.front_name, (frontMinutes.get(row.front_name) ?? 0) + minutes);
        dailyMinutes.set(row.date, (dailyMinutes.get(row.date) ?? 0) + minutes);
        const week = weekLabel(row.date);
        weeklyMinutes.set(week, (weeklyMinutes.get(week) ?? 0) + minutes);
        const lateMinutes = minutesBetween(row.planned_start_at, row.started_at);
        const label = lateMinutes <= 5 ? 'Em cima' : lateMinutes <= 20 ? 'Atrasado' : 'Furou';
        adherence.set(label, adherence.get(label) + 1);
      }

      return {
        summary: { realMinutes, activeDays: dailyMinutes.size, sessions: rows.length },
        hoursByActivity: toSeries(activityMinutes),
        hoursByFront: toSeries(frontMinutes),
        dailyHours: toSeries(dailyMinutes),
        weeklyHours: toSeries(weeklyMinutes),
        adherence: toSeries(adherence)
      };
    }
  };
}

import { assertNonEmpty, assertSchedule, dateForWeekday } from '../shared/domain.js';

function mapRule(row) {
  return {
    id: row.id,
    activityId: row.activity_id,
    frontId: row.front_id,
    title: row.title,
    weekdays: JSON.parse(row.weekdays),
    startTime: row.start_time,
    endTime: row.end_time,
    checklistTemplate: JSON.parse(row.checklist_template),
    active: Boolean(row.active),
    googleEventId: row.google_event_id,
    updatedAt: row.updated_at
  };
}

function mapBlock(row) {
  return {
    id: row.id,
    recurrenceRuleId: row.recurrence_rule_id,
    activityId: row.activity_id,
    frontId: row.front_id,
    date: row.date,
    title: row.title,
    plannedStartAt: row.planned_start_at,
    plannedEndAt: row.planned_end_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    finishReason: row.finish_reason,
    note: row.note,
    continuationPoint: row.continuation_point,
    updatedAt: row.updated_at
  };
}

function assertRule(input) {
  assertNonEmpty(input.title, 'Título');
  if (!Array.isArray(input.weekdays) || input.weekdays.length === 0 || input.weekdays.some((weekday) => !Number.isInteger(weekday) || weekday < 0 || weekday > 6)) {
    throw new Error('Escolha pelo menos um dia da semana válido.');
  }
  assertSchedule({ weekday: input.weekdays[0], startTime: input.startTime, endTime: input.endTime });
}

export function createRoutineRepository(database) {
  const findRule = database.prepare('SELECT * FROM recurrence_rules WHERE id = ?');
  const findBlock = database.prepare('SELECT * FROM blocks WHERE id = ?');
  const findBlockByRuleAndDate = database.prepare('SELECT * FROM blocks WHERE recurrence_rule_id = ? AND date = ?');
  const insertRule = database.prepare(`
    INSERT INTO recurrence_rules (activity_id, front_id, title, weekdays, start_time, end_time, checklist_template, updated_at)
    VALUES (@activityId, @frontId, @title, @weekdays, @startTime, @endTime, @checklistTemplate, @updatedAt)
  `);
  const updateRule = database.prepare(`
    UPDATE recurrence_rules
    SET activity_id = @activityId, front_id = @frontId, title = @title, weekdays = @weekdays,
        start_time = @startTime, end_time = @endTime, checklist_template = @checklistTemplate,
        active = @active, updated_at = @updatedAt
    WHERE id = @id
  `);
  const activeRules = database.prepare('SELECT * FROM recurrence_rules WHERE active = 1');
  const insertBlock = database.prepare(`
    INSERT INTO blocks (recurrence_rule_id, activity_id, front_id, date, title, planned_start_at, planned_end_at, status, created_at, updated_at)
    VALUES (@recurrenceRuleId, @activityId, @frontId, @date, @title, @plannedStartAt, @plannedEndAt, 'planned', @timestamp, @timestamp)
  `);
  const weekBlocks = database.prepare(`
    SELECT * FROM blocks
    WHERE date BETWEEN @weekStart AND @weekEnd
    ORDER BY date, planned_start_at
  `);
  const cancelBlock = database.prepare(`
    UPDATE blocks SET status = 'cancelled', updated_at = @updatedAt
    WHERE id = @id
  `);

  function ensureBlock(rule, date) {
    const existing = findBlockByRuleAndDate.get(rule.id, date);
    if (existing) return mapBlock(existing);
    const timestamp = new Date().toISOString();
    const result = insertBlock.run({
      recurrenceRuleId: rule.id,
      activityId: rule.activityId,
      frontId: rule.frontId,
      date,
      title: rule.title,
      plannedStartAt: `${date}T${rule.startTime}:00`,
      plannedEndAt: `${date}T${rule.endTime}:00`,
      timestamp
    });
    return mapBlock(findBlock.get(result.lastInsertRowid));
  }

  const ensureBlocksForWeek = database.transaction((weekStart) => {
    const blocks = [];
    for (const row of activeRules.all()) {
      const rule = mapRule(row);
      for (const weekday of rule.weekdays) {
        blocks.push(ensureBlock(rule, dateForWeekday(weekStart, weekday)));
      }
    }
    return blocks.sort((first, second) => first.plannedStartAt.localeCompare(second.plannedStartAt));
  });

  return {
    create({ activityId, frontId = null, title, weekdays, startTime, endTime, checklistTemplate = [] }) {
      assertRule({ title, weekdays, startTime, endTime });
      const updatedAt = new Date().toISOString();
      const result = insertRule.run({ activityId, frontId, title: title.trim(), weekdays: JSON.stringify(weekdays), startTime, endTime, checklistTemplate: JSON.stringify(checklistTemplate), updatedAt });
      return mapRule(findRule.get(result.lastInsertRowid));
    },

    update({ id, activityId, frontId = null, title, weekdays, startTime, endTime, checklistTemplate = [], active = true }) {
      assertRule({ title, weekdays, startTime, endTime });
      const updatedAt = new Date().toISOString();
      updateRule.run({ id, activityId, frontId, title: title.trim(), weekdays: JSON.stringify(weekdays), startTime, endTime, checklistTemplate: JSON.stringify(checklistTemplate), active: active ? 1 : 0, updatedAt });
      return mapRule(findRule.get(id));
    },

    ensureBlocksForWeek,

    listWeek(weekStart) {
      ensureBlocksForWeek(weekStart);
      const weekEnd = dateForWeekday(weekStart, 0);
      return weekBlocks.all({ weekStart, weekEnd }).map(mapBlock);
    },

    cancelBlock(id) {
      cancelBlock.run({ id, updatedAt: new Date().toISOString() });
      return mapBlock(findBlock.get(id));
    }
  };
}

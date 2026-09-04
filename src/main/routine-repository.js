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
    color: row.activity_color ?? '#2563eb',
    activityName: row.activity_name ?? null,
    frontName: row.front_name ?? null,
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

export function createRoutineRepository(database, { syncQueue = null } = {}) {
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
  const saveGoogleEventId = database.prepare('UPDATE recurrence_rules SET google_event_id = ? WHERE id = ?');
  const applyGoogleSchedule = database.prepare(`
    UPDATE recurrence_rules
    SET title = @title, start_time = @startTime, end_time = @endTime,
        google_event_id = @googleEventId, updated_at = @updatedAt
    WHERE id = @id
  `);
  const activeRules = database.prepare('SELECT * FROM recurrence_rules WHERE active = 1');
  const insertBlock = database.prepare(`
    INSERT INTO blocks (recurrence_rule_id, activity_id, front_id, date, title, planned_start_at, planned_end_at, status, created_at, updated_at)
    VALUES (@recurrenceRuleId, @activityId, @frontId, @date, @title, @plannedStartAt, @plannedEndAt, 'planned', @timestamp, @timestamp)
  `);
  const insertChecklistItem = database.prepare(`
    INSERT INTO block_checklist_items (block_id, position, title)
    VALUES (@blockId, @position, @title)
  `);
  const weekBlocks = database.prepare(`
    SELECT blocks.*, activities.color AS activity_color, activities.name AS activity_name, fronts.name AS front_name
    FROM blocks
    JOIN activities ON activities.id = blocks.activity_id
    LEFT JOIN fronts ON fronts.id = blocks.front_id
    WHERE date BETWEEN @weekStart AND @weekEnd
    ORDER BY date, planned_start_at
  `);
  const cancelBlock = database.prepare(`
    UPDATE blocks SET status = 'cancelled', updated_at = @updatedAt
    WHERE id = @id
  `);
  const deactivateRule = database.prepare('UPDATE recurrence_rules SET active = 0, updated_at = @updatedAt WHERE id = @id');
  const cancelFutureBlocks = database.prepare(`
    UPDATE blocks SET status = 'cancelled', updated_at = @updatedAt
    WHERE recurrence_rule_id = @id AND status != 'completed'
  `);

  function enqueueRule(id) {
    syncQueue?.enqueue('upsert-rule', { id });
  }

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
    rule.checklistTemplate.forEach((title, position) => {
      insertChecklistItem.run({ blockId: result.lastInsertRowid, position, title });
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
      const rule = mapRule(findRule.get(result.lastInsertRowid));
      enqueueRule(rule.id);
      return rule;
    },

    update({ id, activityId, frontId = null, title, weekdays, startTime, endTime, checklistTemplate = [], active = true }) {
      assertRule({ title, weekdays, startTime, endTime });
      const updatedAt = new Date().toISOString();
      updateRule.run({ id, activityId, frontId, title: title.trim(), weekdays: JSON.stringify(weekdays), startTime, endTime, checklistTemplate: JSON.stringify(checklistTemplate), active: active ? 1 : 0, updatedAt });
      const rule = mapRule(findRule.get(id));
      enqueueRule(rule.id);
      return rule;
    },

    get(id) {
      const rule = findRule.get(id);
      return rule ? mapRule(rule) : null;
    },

    setGoogleEventId(id, googleEventId) {
      saveGoogleEventId.run(googleEventId, id);
      return mapRule(findRule.get(id));
    },

    deactivateFromGoogle(id) {
      const updatedAt = new Date().toISOString();
      const cancelledBlocks = database.transaction(() => {
        deactivateRule.run({ id, updatedAt });
        return cancelFutureBlocks.run({ id, updatedAt }).changes;
      })();
      return { rule: mapRule(findRule.get(id)), cancelledBlocks };
    },

    applyGoogleSchedule({ id, title, startTime, endTime, googleEventId, updatedAt }) {
      applyGoogleSchedule.run({ id, title, startTime, endTime, googleEventId, updatedAt });
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

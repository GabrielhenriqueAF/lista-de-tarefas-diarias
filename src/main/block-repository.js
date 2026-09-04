import { assertNonEmpty, assertSchedule, minutesBetween } from '../shared/domain.js';

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
    googleEventId: row.google_event_id,
    googleRecurringEventId: row.google_recurring_event_id,
    realMinutes: row.started_at && row.finished_at ? minutesBetween(row.started_at, row.finished_at) : 0,
    updatedAt: row.updated_at
  };
}

export function createBlockRepository(database, { syncQueue = null } = {}) {
  const findById = database.prepare('SELECT * FROM blocks WHERE id = ?');
  const insertAdHoc = database.prepare(`
    INSERT INTO blocks (activity_id, front_id, date, title, planned_start_at, planned_end_at, status, created_at, updated_at)
    VALUES (@activityId, @frontId, @date, @title, @plannedStartAt, @plannedEndAt, 'planned', @timestamp, @timestamp)
  `);
  const insertChecklistItem = database.prepare(`
    INSERT INTO block_checklist_items (block_id, position, title)
    VALUES (@blockId, @position, @title)
  `);
  const updateStarted = database.prepare(`
    UPDATE blocks SET started_at = @startedAt, status = 'in_progress', updated_at = @updatedAt
    WHERE id = @id
  `);
  const updateCompleted = database.prepare(`
    UPDATE blocks
    SET finished_at = @finishedAt, status = 'completed', finish_reason = @finishReason,
        note = @note, continuation_point = @continuationPoint, updated_at = @updatedAt
    WHERE id = @id
  `);
  const updateFrontContinuation = database.prepare(`
    UPDATE fronts
    SET current_point = @currentPoint, next_step = @nextStep, updated_at = @updatedAt
    WHERE id = @id
  `);
  const listToday = database.prepare(`
    SELECT blocks.*, activities.color AS activity_color, activities.name AS activity_name, fronts.name AS front_name
    FROM blocks
    JOIN activities ON activities.id = blocks.activity_id
    LEFT JOIN fronts ON fronts.id = blocks.front_id
    WHERE blocks.date = ?
    ORDER BY blocks.planned_start_at
  `);
  const listHistory = database.prepare(`
    SELECT blocks.*, activities.color AS activity_color, activities.name AS activity_name, fronts.name AS front_name
    FROM blocks
    JOIN activities ON activities.id = blocks.activity_id
    LEFT JOIN fronts ON fronts.id = blocks.front_id
    WHERE blocks.front_id = ?
    ORDER BY blocks.date DESC, blocks.finished_at DESC
  `);
  const listChecklist = database.prepare('SELECT * FROM block_checklist_items WHERE block_id = ? ORDER BY position');
  const toggleChecklist = database.prepare('UPDATE block_checklist_items SET completed = @completed WHERE id = @id');
  const cancel = database.prepare(`
    UPDATE blocks SET status = 'cancelled', updated_at = @updatedAt
    WHERE id = @id
  `);
  const saveGoogleEventId = database.prepare('UPDATE blocks SET google_event_id = ? WHERE id = ?');

  function assertAdHocBlock({ title, date, startTime, endTime }) {
    assertNonEmpty(title, 'Título');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) throw new Error('Escolha uma data válida.');
    assertSchedule({ weekday: 1, startTime, endTime });
  }

  const finish = database.transaction(({ id, finishedAt, finishReason, note = '', continuationPoint = '' }) => {
    const block = findById.get(id);
    if (!block || block.status === 'cancelled' || !block.started_at) {
      throw new Error('Bloco não pode ser finalizado.');
    }
    if (new Date(finishedAt) < new Date(block.started_at)) {
      throw new Error('O fim não pode ser anterior ao início.');
    }

    const updatedAt = new Date().toISOString();
    updateCompleted.run({ id, finishedAt, finishReason, note, continuationPoint, updatedAt });
    if (block.front_id) {
      updateFrontContinuation.run({
        id: block.front_id,
        currentPoint: note,
        nextStep: continuationPoint,
        updatedAt
      });
    }
    return mapBlock(findById.get(id));
  });

  return {
    createAdHoc({ activityId, frontId = null, title, date, startTime, endTime, checklistTemplate = [] }) {
      assertAdHocBlock({ title, date, startTime, endTime });
      return database.transaction(() => {
        const timestamp = new Date().toISOString();
        const result = insertAdHoc.run({
          activityId,
          frontId,
          date,
          title: title.trim(),
          plannedStartAt: `${date}T${startTime}:00`,
          plannedEndAt: `${date}T${endTime}:00`,
          timestamp
        });
        checklistTemplate.forEach((item, position) => {
          const title = String(item).trim();
          if (title) insertChecklistItem.run({ blockId: result.lastInsertRowid, position, title });
        });
        const block = mapBlock(findById.get(result.lastInsertRowid));
        syncQueue?.enqueue('upsert-block', { id: block.id });
        return block;
      })();
    },

    start({ id, startedAt }) {
      const block = findById.get(id);
      if (!block || block.status !== 'planned') {
        throw new Error('Bloco não pode ser iniciado.');
      }
      updateStarted.run({ id, startedAt, updatedAt: new Date().toISOString() });
      return mapBlock(findById.get(id));
    },

    finish,

    get(id) {
      const block = findById.get(id);
      return block ? mapBlock(block) : null;
    },

    setGoogleEventId(id, googleEventId) {
      saveGoogleEventId.run(googleEventId, id);
      return mapBlock(findById.get(id));
    },

    listToday(date) {
      return listToday.all(date).map(mapBlock);
    },

    listHistory(frontId) {
      return listHistory.all(frontId).map(mapBlock);
    },

    listChecklist(blockId) {
      return listChecklist.all(blockId).map((item) => ({
        id: item.id,
        blockId: item.block_id,
        position: item.position,
        title: item.title,
        completed: Boolean(item.completed)
      }));
    },

    toggleChecklistItem({ id, completed }) {
      toggleChecklist.run({ id, completed: completed ? 1 : 0 });
    },

    cancel(id) {
      cancel.run({ id, updatedAt: new Date().toISOString() });
      return mapBlock(findById.get(id));
    }
  };
}

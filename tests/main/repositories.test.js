import { describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/main/database.js';

describe('routine database migration', () => {
  it('creates the Activities table in a fresh local database', () => {
    const database = createDatabase(':memory:');
    const table = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'activities'")
      .get();

    expect(table).toEqual({ name: 'activities' });

    database.close();
  });
});

describe('Activities and Fronts', () => {
  it('stores a Front and its continuity beneath an Activity', async () => {
    const { createActivityRepository } = await import('../../src/main/activity-repository.js');
    const { createFrontRepository } = await import('../../src/main/front-repository.js');
    const database = createDatabase(':memory:');
    const activities = createActivityRepository(database);
    const fronts = createFrontRepository(database);
    const english = activities.create({
      name: 'Inglês',
      category: 'Estudo',
      color: '#2563eb',
      weeklyGoalMinutes: 600
    });

    const writing = fronts.create({
      activityId: english.id,
      name: 'Writing',
      currentPoint: 'Unidade 3',
      nextStep: 'Exercício 13',
      defaultWeekday: 2
    });

    expect(fronts.get(writing.id)).toMatchObject({
      activityId: english.id,
      nextStep: 'Exercício 13'
    });

    database.close();
  });
});

describe('recurrence rules and Blocks', () => {
  it('materializes Tuesday Writing only once', async () => {
    const { createActivityRepository } = await import('../../src/main/activity-repository.js');
    const { createFrontRepository } = await import('../../src/main/front-repository.js');
    const { createRoutineRepository } = await import('../../src/main/routine-repository.js');
    const database = createDatabase(':memory:');
    const activities = createActivityRepository(database);
    const fronts = createFrontRepository(database);
    const rules = createRoutineRepository(database);
    const english = activities.create({ name: 'Inglês', category: 'Estudo', color: '#2563eb' });
    const writing = fronts.create({ activityId: english.id, name: 'Writing' });
    const rule = rules.create({
      activityId: english.id,
      frontId: writing.id,
      weekdays: [2],
      startTime: '05:00',
      endTime: '08:00',
      title: 'Inglês — Writing',
      checklistTemplate: []
    });

    expect(rules.ensureBlocksForWeek('2026-09-07')).toMatchObject([{
      recurrenceRuleId: rule.id,
      date: '2026-09-08',
      plannedStartAt: '2026-09-08T05:00:00',
      status: 'planned'
    }]);
    expect(rules.ensureBlocksForWeek('2026-09-07')).toHaveLength(1);

    database.close();
  });
});

describe('Block execution', () => {
  it('records 142 real minutes and the next Writing step', async () => {
    const { createActivityRepository } = await import('../../src/main/activity-repository.js');
    const { createFrontRepository } = await import('../../src/main/front-repository.js');
    const { createRoutineRepository } = await import('../../src/main/routine-repository.js');
    const { createBlockRepository } = await import('../../src/main/block-repository.js');
    const database = createDatabase(':memory:');
    const activities = createActivityRepository(database);
    const fronts = createFrontRepository(database);
    const rules = createRoutineRepository(database);
    const blocks = createBlockRepository(database);
    const english = activities.create({ name: 'Inglês', category: 'Estudo', color: '#2563eb' });
    const writing = fronts.create({ activityId: english.id, name: 'Writing' });
    rules.create({ activityId: english.id, frontId: writing.id, weekdays: [2], startTime: '05:00', endTime: '08:00', title: 'Inglês — Writing' });
    const [planned] = rules.ensureBlocksForWeek('2026-09-07');

    const started = blocks.start({ id: planned.id, startedAt: '2026-09-08T05:18:00' });
    const completed = blocks.finish({
      id: started.id,
      finishedAt: '2026-09-08T07:40:00',
      finishReason: 'goal_completed',
      note: 'Exercício 12 concluído',
      continuationPoint: 'Começar no exercício 13'
    });

    expect(completed.realMinutes).toBe(142);
    expect(fronts.get(writing.id).nextStep).toBe('Começar no exercício 13');

    database.close();
  });
});

describe('templates and learning Track', () => {
  it('copies Reading steps into a Block and computes Track progress', async () => {
    const { createActivityRepository } = await import('../../src/main/activity-repository.js');
    const { createFrontRepository } = await import('../../src/main/front-repository.js');
    const { createRoutineRepository } = await import('../../src/main/routine-repository.js');
    const { createBlockRepository } = await import('../../src/main/block-repository.js');
    const { createTemplateRepository } = await import('../../src/main/template-repository.js');
    const { createTrackRepository } = await import('../../src/main/track-repository.js');
    const database = createDatabase(':memory:');
    const activities = createActivityRepository(database);
    const fronts = createFrontRepository(database);
    const rules = createRoutineRepository(database);
    const blocks = createBlockRepository(database);
    const templates = createTemplateRepository(rules);
    const track = createTrackRepository(database);
    const english = activities.create({ name: 'Inglês', category: 'Estudo', color: '#2563eb' });
    const reading = fronts.create({ activityId: english.id, name: 'Reading' });

    templates.applyToRule({
      activityId: english.id,
      frontId: reading.id,
      templateName: 'Inglês — Reading',
      weekdays: [1],
      startTime: '05:00',
      endTime: '08:00'
    });
    const [block] = rules.ensureBlocksForWeek('2026-09-07');
    const chapter = track.create({ frontId: reading.id, position: 1, title: 'Capítulo 1' });
    track.complete(chapter.id, '2026-09-07T08:00:00');

    expect(blocks.listChecklist(block.id)).toHaveLength(5);
    expect(track.progressForFront(reading.id)).toEqual({ completed: 1, total: 1, percent: 100 });

    database.close();
  });
});

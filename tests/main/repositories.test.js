import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { createDatabase, schemaVersion } from '../../src/main/database.js';
import { createDailyBackup } from '../../src/main/backup-service.js';

describe('routine database migration', () => {
  it('creates the Activities table in a fresh local database', () => {
    const database = createDatabase(':memory:');
    const table = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'activities'")
      .get();

    expect(table).toEqual({ name: 'activities' });

    database.close();
  });

  it('adds nullable starts_on and ends_on through migration 2', () => {
    const database = createDatabase(':memory:');

    expect(schemaVersion(database)).toBe(2);
    expect(database.prepare('PRAGMA table_info(recurrence_rules)').all().map((column) => column.name))
      .toEqual(expect.arrayContaining(['starts_on', 'ends_on']));

    database.close();
  });

  it('copies a legacy database before its task table is reset', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'rotina-legacy-'));
    const source = path.join(directory, 'legacy.db');
    const legacy = new Database(source);
    legacy.exec("CREATE TABLE tasks (id INTEGER PRIMARY KEY, title TEXT); INSERT INTO tasks (title) VALUES ('Não perder');");
    legacy.close();

    let backupPath;
    const migrated = createDatabase(source, {
      beforeLegacyReset: () => {
        backupPath = createDailyBackup(source, path.join(directory, 'backups'), new Date('2026-09-08T12:00:00Z'));
      }
    });
    migrated.close();

    expect(backupPath).toBeTruthy();
    const backup = new Database(backupPath, { readonly: true });
    expect(backup.prepare('SELECT title FROM tasks').get()).toEqual({ title: 'Não perder' });
    backup.close();
    rmSync(directory, { recursive: true, force: true });
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
    expect(rules.listWeek('2026-09-07')).toMatchObject([{
      color: '#2563eb',
      activityName: 'Inglês',
      frontName: 'Writing'
    }]);

    database.close();
  });

  it('queues a changed rule and stores its Google event link', async () => {
    const { createActivityRepository } = await import('../../src/main/activity-repository.js');
    const { createRoutineRepository } = await import('../../src/main/routine-repository.js');
    const { createSyncRepository } = await import('../../src/main/sync-repository.js');
    const database = createDatabase(':memory:');
    const activities = createActivityRepository(database);
    const queue = createSyncRepository(database);
    const rules = createRoutineRepository(database, { syncQueue: queue });
    const english = activities.create({ name: 'Inglês', category: 'Estudo', color: '#2563eb' });
    const rule = rules.create({ activityId: english.id, title: 'Inglês', weekdays: [2], startTime: '05:00', endTime: '08:00' });

    expect(queue.pending()).toMatchObject([{ operation: 'upsert-rule', payload: { id: rule.id } }]);
    rules.setGoogleEventId(rule.id, 'google-rule-8');
    expect(rules.get(rule.id)).toMatchObject({ googleEventId: 'google-rule-8', active: true });

    database.close();
  });

  it('materializes a rule only inside its inclusive period', async () => {
    const { createActivityRepository } = await import('../../src/main/activity-repository.js');
    const { createRoutineRepository } = await import('../../src/main/routine-repository.js');
    const database = createDatabase(':memory:');
    const activities = createActivityRepository(database);
    const rules = createRoutineRepository(database);
    const english = activities.create({ name: 'Inglês', category: 'Estudo', color: '#2563eb' });

    rules.create({
      activityId: english.id,
      title: 'Inglês',
      weekdays: [2, 4],
      startTime: '05:00',
      endTime: '08:00',
      startsOn: '2026-09-08',
      endsOn: '2026-09-10'
    });

    expect(rules.listWeek('2026-09-07').map((block) => block.date)).toEqual(['2026-09-08', '2026-09-10']);
    expect(rules.listWeek('2026-09-14')).toEqual([]);

    database.close();
  });

  it('archives, restores and permanently purges an activity graph', async () => {
    const { createActivityRepository } = await import('../../src/main/activity-repository.js');
    const { createFrontRepository } = await import('../../src/main/front-repository.js');
    const { createRoutineRepository } = await import('../../src/main/routine-repository.js');
    const { createTrackRepository } = await import('../../src/main/track-repository.js');
    const database = createDatabase(':memory:');
    const activities = createActivityRepository(database);
    const fronts = createFrontRepository(database);
    const rules = createRoutineRepository(database);
    const track = createTrackRepository(database);
    const english = activities.create({ name: 'Inglês', category: 'Estudo', color: '#2563eb' });
    const writing = fronts.create({ activityId: english.id, name: 'Writing' });
    const rule = rules.create({ activityId: english.id, frontId: writing.id, title: 'Inglês — Writing', weekdays: [2], startTime: '05:00', endTime: '08:00' });
    const [block] = rules.ensureBlocksForWeek('2026-09-07');
    track.create({ frontId: writing.id, position: 1, title: 'Capítulo 1' });

    const archived = activities.archive(english.id, '2026-09-08');
    expect(archived.ruleEventIds).toEqual([]);
    expect(activities.listActive()).toEqual([]);
    expect(activities.listArchived()).toMatchObject([{ id: english.id, active: false }]);
    expect(rules.get(rule.id).active).toBe(false);
    expect(database.prepare('SELECT status FROM blocks WHERE id = ?').get(block.id).status).toBe('cancelled');

    activities.restore(english.id);
    expect(activities.listActive()).toMatchObject([{ id: english.id, active: true }]);
    expect(rules.get(rule.id).active).toBe(true);

    activities.archive(english.id, '2026-09-08');
    expect(activities.purge(english.id)).toEqual({ id: english.id });
    expect(activities.get(english.id)).toBeNull();
    expect(database.prepare('SELECT COUNT(*) AS count FROM fronts').get().count).toBe(0);
    expect(database.prepare('SELECT COUNT(*) AS count FROM recurrence_rules').get().count).toBe(0);
    expect(database.prepare('SELECT COUNT(*) AS count FROM blocks').get().count).toBe(0);
    expect(database.prepare('SELECT COUNT(*) AS count FROM track_items').get().count).toBe(0);

    database.close();
  });
});

describe('Block execution', () => {
  it('creates a one-time Block with its checklist and Google sync operation', async () => {
    const { createActivityRepository } = await import('../../src/main/activity-repository.js');
    const { createBlockRepository } = await import('../../src/main/block-repository.js');
    const { createSyncRepository } = await import('../../src/main/sync-repository.js');
    const database = createDatabase(':memory:');
    const activities = createActivityRepository(database);
    const queue = createSyncRepository(database);
    const blocks = createBlockRepository(database, { syncQueue: queue });
    const english = activities.create({ name: 'Inglês', category: 'Estudo', color: '#2563eb' });

    const block = blocks.createAdHoc({
      activityId: english.id,
      title: 'Simulado TOEFL',
      date: '2026-10-15',
      startTime: '09:00',
      endTime: '11:00',
      checklistTemplate: ['Separar material', 'Fazer simulado']
    });

    expect(block).toMatchObject({ recurrenceRuleId: null, date: '2026-10-15', status: 'planned' });
    expect(blocks.listChecklist(block.id).map((item) => item.title)).toEqual(['Separar material', 'Fazer simulado']);
    expect(queue.pending()).toMatchObject([{ operation: 'upsert-block', payload: { id: block.id } }]);
    database.close();
  });

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
    expect(blocks.listToday('2026-09-08')).toMatchObject([{
      color: '#2563eb',
      activityName: 'Inglês',
      frontName: 'Writing'
    }]);

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

describe('settings, backups and reports', () => {
  it('persists light theme and reports only completed real minutes', async () => {
    const { createActivityRepository } = await import('../../src/main/activity-repository.js');
    const { createFrontRepository } = await import('../../src/main/front-repository.js');
    const { createRoutineRepository } = await import('../../src/main/routine-repository.js');
    const { createBlockRepository } = await import('../../src/main/block-repository.js');
    const { createSettingsRepository } = await import('../../src/main/settings-repository.js');
    const { createReportRepository } = await import('../../src/main/report-repository.js');
    const database = createDatabase(':memory:');
    const activities = createActivityRepository(database);
    const fronts = createFrontRepository(database);
    const rules = createRoutineRepository(database);
    const blocks = createBlockRepository(database);
    const settings = createSettingsRepository(database);
    const reports = createReportRepository(database);
    const english = activities.create({ name: 'Inglês', category: 'Estudo', color: '#2563eb' });
    const writing = fronts.create({ activityId: english.id, name: 'Writing' });
    rules.create({ activityId: english.id, frontId: writing.id, weekdays: [2], startTime: '05:00', endTime: '08:00', title: 'Inglês — Writing' });
    const [planned] = rules.ensureBlocksForWeek('2026-09-07');
    blocks.start({ id: planned.id, startedAt: '2026-09-08T05:18:00' });
    blocks.finish({ id: planned.id, finishedAt: '2026-09-08T07:40:00', finishReason: 'goal_completed' });

    settings.setTheme('light');
    const report = reports.getDashboardReport({
      from: '2026-09-01',
      to: '2026-09-30',
      activityId: english.id,
      frontId: null
    });

    expect(settings.getTheme()).toBe('light');
    expect(report.summary.realMinutes).toBe(142);
    expect(report.hoursByActivity).toEqual([{ label: 'Inglês', value: 142 }]);

    database.close();
  });

  it('creates one local backup per day', async () => {
    const { createDailyBackup } = await import('../../src/main/backup-service.js');
    const directory = mkdtempSync(path.join(tmpdir(), 'rotina-backup-'));
    const source = path.join(directory, 'rotina.db');
    const database = createDatabase(source);
    database.close();

    const first = createDailyBackup(source, path.join(directory, 'backups'), new Date('2026-09-08T12:00:00Z'));
    const second = createDailyBackup(source, path.join(directory, 'backups'), new Date('2026-09-08T18:00:00Z'));

    expect(existsSync(first)).toBe(true);
    expect(second).toBe(first);

    rmSync(directory, { recursive: true, force: true });
  });
});

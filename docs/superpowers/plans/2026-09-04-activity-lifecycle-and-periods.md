# Ciclo de vida de Atividades e períodos da rotina Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Adicionar período opcional, navegação da Semana e ciclo de vida seguro de Atividades com Google Agenda.

**Architecture:** A migração 2 adiciona datas de vigência às regras sem recriar SQLite. Repositórios mantêm período e ciclo local; o controlador Google confirma exclusões remotas antes da limpeza definitiva. O renderer usa componentes sem acesso a banco, credenciais ou Electron.

**Tech Stack:** Electron 44, JavaScript ESM, SQLite/better-sqlite3, Google Calendar API, Vitest e JSDOM.

**Spec:** docs/superpowers/specs/2026-09-04-activity-lifecycle-and-periods-design.md

## Global Constraints

- Manter contextIsolation, nodeIntegration desativado, OAuth atual e somente o calendário Rotina Gabriel.
- Não instalar dependências de UI ou expor SQLite, IPC genérico, credenciais ou adaptador Google ao renderer.
- startsOn e endsOn são YYYY-MM-DD, inclusivos e anuláveis; regra existente sem data continua sem prazo.
- Arquivar é reversível. Limpar definitivamente exige o nome exato e, em erro Google, mantém dados locais.
- Todo comportamento novo começa em teste vermelho e termina com testes verdes; commits entram em main, mas push só após aceite local de Gabriel.

## File Structure

- src/main/migrations.js: versão 2 incremental.
- src/main/routine-repository.js: datas nas Regras e materialização limitada.
- src/main/activity-repository.js: arquivo, restauração e limpeza transacional local.
- src/main/google/sync-service.js e google-controller.js: remoção de eventos remotos.
- src/main/index.js, ipc.js, preload.js: montagem e API limitada.
- src/renderer/date-range-picker.js: dois meses, datas e atalhos.
- src/renderer/danger-confirm-dialog.js: confirmação textual de purge.
- src/renderer/block-wizard.js, views/week-view.js, views/settings-view.js, app.js, styles.css: fluxos e layout.

### Task 1: Migrar e aplicar períodos nas Regras

**Files:**
- Modify: src/main/migrations.js
- Modify: src/main/routine-repository.js
- Modify: tests/main/repositories.test.js

**Interfaces:** Produz startsOn e endsOn em Regras; create, update e listWeek recebem/respeitam os campos.

- [ ] **Step 1: Escrever testes vermelhos**

    it('adds nullable starts_on and ends_on through migration 2', () => {
      const database = createDatabase(':memory:');
      expect(schemaVersion(database)).toBe(2);
      expect(database.prepare('PRAGMA table_info(recurrence_rules)').all().map((column) => column.name))
        .toEqual(expect.arrayContaining(['starts_on', 'ends_on']));
    });

    it('materializes a rule only inside its inclusive period', () => {
      rules.create({ activityId: english.id, title: 'Inglês', weekdays: [2, 4], startTime: '05:00', endTime: '08:00', startsOn: '2026-09-08', endsOn: '2026-09-10' });
      expect(rules.listWeek('2026-09-07').map((block) => block.date)).toEqual(['2026-09-08', '2026-09-10']);
      expect(rules.listWeek('2026-09-14')).toEqual([]);
    });

- [ ] **Step 2: Confirmar falha**

Run: npm test -- --run tests/main/repositories.test.js

Expected: FAIL porque a versão é 1 e datas não são filtradas.

- [ ] **Step 3: Implementar migração e filtro**

Em runMigrations, preservar criação versão 1 e adicionar versão 2 em transação:

    if (schemaVersion(database) < 2) database.transaction(() => {
      database.exec('ALTER TABLE recurrence_rules ADD COLUMN starts_on TEXT; ALTER TABLE recurrence_rules ADD COLUMN ends_on TEXT;');
      database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (2, ?)').run(new Date().toISOString());
    })();

Incluir colunas em SQL/mapas de regra e validar fim anterior ao início. Antes de ensureBlock, usar:

    const isInsidePeriod = (rule, date) =>
      (!rule.startsOn || date >= rule.startsOn) && (!rule.endsOn || date <= rule.endsOn);

- [ ] **Step 4: Confirmar testes verdes**

Run: npm test -- --run tests/main/repositories.test.js

Expected: PASS, incluindo regras antigas sem prazo.

- [ ] **Step 5: Commit**

    git add src/main/migrations.js src/main/routine-repository.js tests/main/repositories.test.js
    git commit -m "feat: add routine rule periods"

### Task 2: Implementar arquivo, restauração e limpeza local

**Files:**
- Modify: src/main/activity-repository.js
- Modify: tests/main/repositories.test.js

**Interfaces:** Produz get(id), listArchived(), archive(id, today), restore(id) e purge(id). archive retorna activity e ruleEventIds.

- [ ] **Step 1: Escrever testes vermelhos**

    it('archives future planned Blocks while preserving completed history', () => {
      const result = activities.archive(english.id, '2026-09-08');
      expect(result.activity.active).toBe(false);
      expect(blocks.get(completed.id).status).toBe('completed');
      expect(blocks.get(future.id).status).toBe('cancelled');
      expect(rules.get(rule.id).active).toBe(false);
    });

    it('purges only an archived Activity and all its local descendants', () => {
      activities.archive(english.id, '2026-09-08');
      activities.purge(english.id);
      expect(database.prepare('SELECT count(*) AS count FROM activities').get().count).toBe(0);
      expect(database.prepare('SELECT count(*) AS count FROM blocks').get().count).toBe(0);
      expect(database.prepare('SELECT count(*) AS count FROM track_items').get().count).toBe(0);
    });

- [ ] **Step 2: Confirmar falha**

Run: npm test -- --run tests/main/repositories.test.js

Expected: FAIL porque o repositório apenas desativa a Atividade.

- [ ] **Step 3: Implementar transações locais**

Preparar consultas para Regras/eventos Google, Frentes, Blocos planejados e tabelas dependentes. Arquivar em uma transação: desativar Atividade/Frentes/Regras e cancelar somente Blocks com status planned em date >= today. Retornar IDs Google antes da desativação. Restaurar atividade/frentes/regras. Em purge, exigir active igual a zero e apagar nesta ordem:

    deleteChecklist.run(id);
    deleteTrack.run(id);
    deleteBlocks.run(id);
    deleteRules.run(id);
    deleteFronts.run(id);
    deleteActivity.run(id);

- [ ] **Step 4: Confirmar testes verdes**

Run: npm test -- --run tests/main/repositories.test.js

Expected: PASS; histórico concluído sobrevive ao arquivo e tudo só desaparece no purge.

- [ ] **Step 5: Commit**

    git add src/main/activity-repository.js tests/main/repositories.test.js
    git commit -m "feat: add activity archive and local purge"

### Task 3: Sincronizar remoção com Google Agenda

**Files:**
- Modify: src/main/google/sync-service.js
- Modify: src/main/google/google-controller.js
- Modify: src/main/index.js
- Modify: tests/main/sync-service.test.js
- Modify: tests/main/google-controller.test.js

**Interfaces:** Produz delete-rule na fila e google.archiveActivity(id, today), restoreActivity(id), purgeActivity(id).

- [ ] **Step 1: Escrever testes vermelhos**

    it('deletes a queued recurring event before importing remote changes', async () => {
      const queue = { pending: () => [{ id: 4, operation: 'delete-rule', payload: { googleEventId: 'event-4' } }], markDone: vi.fn(), markFailed: vi.fn(), getState: () => null, setState: () => {} };
      const google = { deleteEvent: vi.fn(), listEvents: async () => ({ data: { items: [] } }) };
      await createSyncService({ calendarService, google, queue, rules: {}, blocks: {} }).syncNow();
      expect(google.deleteEvent).toHaveBeenCalledWith('rotina-gabriel', 'event-4');
    });

    it('preserves local data when Google deletion fails during purge', async () => {
      await expect(controller.purgeActivity(english.id)).rejects.toThrow();
      expect(activities.get(english.id)).not.toBeNull();
    });

- [ ] **Step 2: Confirmar falha**

Run: npm test -- --run tests/main/sync-service.test.js tests/main/google-controller.test.js

Expected: FAIL porque delete-rule e os métodos de Atividade não existem.

- [ ] **Step 3: Implementar exclusão remota segura**

Tratar delete-rule em pushOperation; 404 é sucesso:

    if (operation.operation === 'delete-rule') {
      try { await google.deleteEvent(calendarId, operation.payload.googleEventId); }
      catch (error) { if (error?.code !== 404 && error?.response?.status !== 404) throw error; }
      return;
    }

No controlador, receber activities. Arquivar localmente, enfileirar delete-rule e sincronizar quando conectado. Restaurar enfileira upsert-rule. Para purge, exigir conexão quando existirem eventos, apagar cada evento de ensureRoutineCalendar() e só depois chamar activities.purge(id). Em index.js, criar activities antes do controlador e reutilizar a instância.

- [ ] **Step 4: Confirmar testes verdes**

Run: npm test -- --run tests/main/sync-service.test.js tests/main/google-controller.test.js

Expected: PASS; 404 remoto é seguro e falha de rede não toca dados locais.

- [ ] **Step 5: Commit**

    git add src/main/google/sync-service.js src/main/google/google-controller.js src/main/index.js tests/main/sync-service.test.js tests/main/google-controller.test.js
    git commit -m "feat: sync activity lifecycle with Google Calendar"

### Task 4: Expor controles de ciclo de vida no IPC

**Files:**
- Modify: src/main/ipc.js
- Modify: src/preload.js
- Modify: tests/main/ipc.test.js
- Modify: tests/main/preload.test.js

**Interfaces:** Produz routineApi.activities.listArchived(), archive(id), restore(id) e purge(id).

- [ ] **Step 1: Escrever testes vermelhos**

    it('validates Activity ids for lifecycle handlers', async () => {
      const handlers = createHandlers({ google: { restoreActivity: async () => ({ id: 2 }) } });
      await expect(handlers.archiveActivity('2')).rejects.toThrow('Atividade inválida.');
      await expect(handlers.restoreActivity(2)).resolves.toEqual({ id: 2 });
    });

- [ ] **Step 2: Confirmar falha**

Run: npm test -- --run tests/main/ipc.test.js tests/main/preload.test.js

Expected: FAIL porque handlers e bridge não existem.

- [ ] **Step 3: Implementar superfície mínima**

Registrar activities:list-archived, activities:archive, activities:restore e activities:purge; validar IDs inteiros e delegar ao controlador. No preload, mapear somente estes quatro métodos em routineApi.activities; não expor ipcRenderer, Google ou Electron.

- [ ] **Step 4: Confirmar testes verdes**

Run: npm test -- --run tests/main/ipc.test.js tests/main/preload.test.js

Expected: PASS e bridge CommonJS continua sandbox-safe.

- [ ] **Step 5: Commit**

    git add src/main/ipc.js src/preload.js tests/main/ipc.test.js tests/main/preload.test.js
    git commit -m "feat: expose activity lifecycle controls"

### Task 5: Criar seletor de período no wizard

**Files:**
- Create: src/renderer/date-range-picker.js
- Modify: src/renderer/block-wizard.js
- Modify: src/renderer/app.js
- Modify: src/renderer/styles.css
- Create: tests/renderer/date-range-picker.test.js
- Modify: tests/renderer/block-wizard.test.js

**Interfaces:** Produz createDateRangePicker({ value, now, onChange }); o draft do wizard ganha startsOn e endsOn.

- [ ] **Step 1: Escrever testes vermelhos**

    it('sets a six-month range from the selected start', () => {
      const changes = [];
      document.body.append(createDateRangePicker({ value: { startsOn: '2026-09-10', endsOn: null }, now: new Date('2026-09-10T12:00:00'), onChange: (value) => changes.push(value) }));
      document.querySelector('[data-range-preset="6-months"]').click();
      expect(changes.at(-1)).toEqual({ startsOn: '2026-09-10', endsOn: '2027-03-10' });
    });

    it('submits selected weekdays with no deadline when period is disabled', () => {
      expect(drafts.at(-1)).toMatchObject({ weekdays: [1, 3], startsOn: null, endsOn: null });
    });

- [ ] **Step 2: Confirmar falha**

Run: npm test -- --run tests/renderer/date-range-picker.test.js tests/renderer/block-wizard.test.js

Expected: FAIL porque componente e campos ainda não existem.

- [ ] **Step 3: Implementar dois meses e atalhos**

Renderizar De/Até, dois calendários consecutivos, setas e células data-range-date. Primeiro clique seleciona início e segundo seleciona fim inclusivo. Adicionar 3 meses, 6 meses, Personalizado e Limpar; os dois primeiros calculam a partir do início selecionado ou de hoje.

No passo 3, manter dias e acrescentar Sem prazo/Definir período. Só no segundo renderizar seletor. Draft e saveBlockDraft usam:

    { weekdays, startTime, endTime, checklistTemplate,
      startsOn: periodEnabled ? startsOn : null,
      endsOn: periodEnabled ? endsOn : null }

- [ ] **Step 4: Confirmar testes verdes**

Run: npm test -- --run tests/renderer/date-range-picker.test.js tests/renderer/block-wizard.test.js

Expected: PASS para 3/6 meses, datas inclusivas e somente dias.

- [ ] **Step 5: Commit**

    git add src/renderer/date-range-picker.js src/renderer/block-wizard.js src/renderer/app.js src/renderer/styles.css tests/renderer/date-range-picker.test.js tests/renderer/block-wizard.test.js
    git commit -m "feat: add routine period picker"

### Task 6: Navegar e administrar no renderer

**Files:**
- Create: src/renderer/danger-confirm-dialog.js
- Modify: src/renderer/views/week-view.js
- Modify: src/renderer/views/settings-view.js
- Modify: src/renderer/app.js
- Modify: src/renderer/styles.css
- Modify: tests/renderer/render.test.js
- Create: tests/renderer/danger-confirm-dialog.test.js

**Interfaces:** Produz state.selectedWeekStart, controles previous/today/next e diálogo open({ activity, trigger }).

- [ ] **Step 1: Escrever testes vermelhos**

    it('navigates the selected routine week', () => {
      const calls = [];
      renderWeekView(document.querySelector('#app'), { weekStart: '2026-09-07', blocks: [], onPreviousWeek: () => calls.push('previous'), onNextWeek: () => calls.push('next') });
      document.querySelector('[data-week-nav="previous"]').click();
      document.querySelector('[data-week-nav="next"]').click();
      expect(calls).toEqual(['previous', 'next']);
    });

    it('confirms purge only after the exact Activity name', () => {
      const confirmed = [];
      const dialog = createDangerConfirmDialog({ root: document.body, onConfirm: (activity) => confirmed.push(activity.id) });
      dialog.open({ activity: { id: 7, name: 'Inglês' }, trigger: document.body });
      document.querySelector('input[name="activityConfirmation"]').value = 'Inglês';
      document.querySelector('[data-danger-confirm]').click();
      expect(confirmed).toEqual([7]);
    });

- [ ] **Step 2: Confirmar falha**

Run: npm test -- --run tests/renderer/render.test.js tests/renderer/danger-confirm-dialog.test.js

Expected: FAIL porque não existem controles e confirmação.

- [ ] **Step 3: Implementar navegação e gestão segura**

Iniciar selectedWeekStart como weekStart() e usar esse valor em rules.listWeek. Criar shiftWeek que soma sete dias e callbacks anterior/próxima/hoje para Tabela, Kanban e Calendário receberem o mesmo array de Blocos.

Em Ajustes, passar activities e archivedActivities, mostrar Arquivar nas ativas e Restaurar/Limpar definitivamente nas arquivadas. O diálogo explica a perda de histórico e eventos, desabilita confirmação até o texto coincidir e restaura foco. Após cada ação, toast e renderização de Ajustes; falha Google deve aparecer como erro na tela.

- [ ] **Step 4: Confirmar testes verdes**

Run: npm test -- --run tests/renderer/render.test.js tests/renderer/danger-confirm-dialog.test.js

Expected: PASS; navegação chama callbacks e purge incorreto não chama API.

- [ ] **Step 5: Commit**

    git add src/renderer/danger-confirm-dialog.js src/renderer/views/week-view.js src/renderer/views/settings-view.js src/renderer/app.js src/renderer/styles.css tests/renderer/render.test.js tests/renderer/danger-confirm-dialog.test.js
    git commit -m "feat: manage routine periods and archived activities"

### Task 7: Verificar com Gabriel e publicar

**Files:** modificar somente se a validação revelar defeito real.

- [ ] **Step 1: Rodar testes completos**

Run: npm test -- --run

Expected: todas as suítes passam.

- [ ] **Step 2: Reconstruir SQLite do Electron**

Run: npm run rebuild

Expected: ✔ Rebuild Complete para better-sqlite3.

- [ ] **Step 3: Testar localmente com Gabriel**

Run: npm run start

Validar: criar regra somente dias; criar segunda/quarta por três meses; navegar antes/dentro/depois do período; arquivar/restaurar; tentar limpeza com nome errado; limpar com nome certo; conferir eventos apenas no calendário Rotina Gabriel.

- [ ] **Step 4: Inspecionar antes do push**

Run: git diff --check && git status --short

Expected: nenhum segredo, token, banco ou backup rastreado.

- [ ] **Step 5: Publicar após aceite de Gabriel**

Run: git push origin main

Expected: main recebe somente commits testados e não é aberta pull request.


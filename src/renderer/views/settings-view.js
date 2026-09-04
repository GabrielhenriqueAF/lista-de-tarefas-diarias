import { element } from './dom.js';

function readableDate(value) {
  return value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Ainda não sincronizado';
}

function settingRow(name, title, description) {
  const row = element('article', { className: 'setting-row', dataset: { setting: name } });
  const copy = element('div');
  copy.append(element('h3', { text: title }), element('p', { className: 'muted', text: description }));
  row.append(copy);
  return row;
}

function activityLifecycleRow(activity, { archived = false, onArchive, onRestore, onPurge }) {
  const row = element('div', { className: 'activity-lifecycle-row' });
  const copy = element('div');
  copy.append(element('strong', { text: activity.name }), element('span', { className: 'muted', text: activity.category || 'Sem categoria' }));
  const actions = element('div', { className: 'setting-actions' });
  if (archived) {
    const restore = element('button', { type: 'button', text: 'Restaurar', className: 'btn-ghost', dataset: { action: 'restore-activity', activityId: activity.id } });
    const purge = element('button', { type: 'button', text: 'Excluir definitivamente', className: 'btn-danger', dataset: { action: 'purge-activity', activityId: activity.id } });
    restore.addEventListener('click', async () => onRestore(activity));
    purge.addEventListener('click', () => onPurge(activity));
    actions.append(restore, purge);
  } else {
    const archive = element('button', { type: 'button', text: 'Arquivar', className: 'btn-ghost', dataset: { action: 'archive-activity', activityId: activity.id } });
    archive.addEventListener('click', async () => onArchive(activity));
    actions.append(archive);
  }
  row.append(copy, actions);
  return row;
}

export function renderSettingsView(root, {
  theme,
  databaseLocation,
  calendarName = 'Rotina Gabriel',
  lastSyncedAt = null,
  configured = false,
  connected = false,
  onConnect = async () => {},
  onSync = async () => {},
  activities = [],
  archivedActivities = [],
  onArchive = async () => {},
  onRestore = async () => {},
  onPurge = () => {}
}) {
  const section = element('section', { className: 'settings-view' });
  const heading = element('header', { className: 'view-heading' });
  const title = element('div');
  title.append(element('p', { className: 'eyebrow', text: 'APLICATIVO' }), element('h1', { text: 'Ajustes' }), element('p', { className: 'muted', text: 'Preferências locais, backup e calendário Google.' }));
  heading.append(title);
  section.append(heading);

  const persistence = settingRow('storage', 'Seus dados', 'Tudo fica salvo no SQLite e uma cópia de segurança é criada uma vez por dia.');
  persistence.append(element('span', { className: 'setting-value', text: databaseLocation ?? 'Local protegido do aplicativo' }));
  const themeRow = settingRow('theme', 'Tema', `Tema atual: ${theme}`);
  themeRow.append(element('span', { className: 'setting-value', text: 'Use o ícone de tema no topo' }));
  const google = settingRow('google', 'Google Agenda', `Calendário ${calendarName} · ${readableDate(lastSyncedAt)}`);

  if (!configured) {
    google.append(element('span', { className: 'setting-value', text: 'Adicione as credenciais OAuth para conectar.' }));
  } else if (!connected) {
    const connect = element('button', { type: 'button', text: 'Conectar Google', className: 'btn-primary', dataset: { action: 'connect-google' } });
    connect.addEventListener('click', async () => onConnect());
    google.append(connect);
  } else {
    const actions = element('div', { className: 'setting-actions' });
    actions.append(element('span', { className: 'setting-value', text: 'Conta conectada · lembretes de 1 h e 10 min' }));
    const sync = element('button', { type: 'button', text: 'Sincronizar', className: 'btn-primary', dataset: { action: 'sync-google' } });
    sync.addEventListener('click', async () => onSync());
    actions.append(sync);
    google.append(actions);
  }

  const lifecycle = settingRow('activities', 'Atividades', 'Arquive o que saiu da sua rotina ou remova de vez após confirmar.');
  const lifecycleList = element('div', { className: 'activity-lifecycle-list' });
  if (activities.length) activities.forEach((activity) => lifecycleList.append(activityLifecycleRow(activity, { onArchive, onRestore, onPurge })));
  else lifecycleList.append(element('p', { className: 'muted', text: 'Nenhuma atividade ativa.' }));
  if (archivedActivities.length) {
    lifecycleList.append(element('p', { className: 'archived-label', text: 'Arquivadas' }));
    archivedActivities.forEach((activity) => lifecycleList.append(activityLifecycleRow(activity, { archived: true, onArchive, onRestore, onPurge })));
  }
  lifecycle.append(lifecycleList);

  section.append(persistence, themeRow, google, lifecycle);
  root.replaceChildren(section);
}

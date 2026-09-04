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

export function renderSettingsView(root, {
  theme,
  databaseLocation,
  calendarName = 'Rotina Gabriel',
  lastSyncedAt = null,
  configured = false,
  connected = false,
  onConnect = async () => {},
  onSync = async () => {}
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

  section.append(persistence, themeRow, google);
  root.replaceChildren(section);
}

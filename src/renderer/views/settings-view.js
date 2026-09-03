import { element } from './dom.js';

function readableDate(value) {
  return value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Ainda não sincronizado';
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
  const section = element('section');
  section.append(element('h2', { text: 'Configurações' }), element('p', { className: 'muted', text: 'Preferências locais, backup e calendário Google.' }));

  const persistence = element('article', { className: 'task-card' });
  persistence.append(
    element('h3', { text: 'Persistência local' }),
    element('p', { text: 'Seus dados ficam no SQLite e uma cópia de segurança é criada uma vez por dia.' }),
    element('p', { className: 'muted', text: databaseLocation ?? 'Local protegido do aplicativo.' })
  );

  const themeCard = element('article', { className: 'task-card' });
  themeCard.append(element('h3', { text: 'Tema' }), element('p', { text: `Tema atual: ${theme}` }));

  const googleCard = element('article', { className: 'task-card' });
  googleCard.append(
    element('h3', { text: 'Google Agenda' }),
    element('p', { text: `Calendário: ${calendarName}` }),
    element('p', { text: `Última sincronização: ${readableDate(lastSyncedAt)}` })
  );
  if (!configured) {
    googleCard.append(element('p', { className: 'muted', text: 'Adicione as credenciais OAuth do Google para conectar sua conta.' }));
  } else if (!connected) {
    const connect = element('button', { type: 'button', text: 'Conectar ao Google', dataset: { action: 'connect-google' } });
    connect.addEventListener('click', async () => onConnect());
    googleCard.append(connect);
  } else {
    googleCard.append(element('p', { className: 'muted', text: 'Conta conectada. Os eventos usam lembretes de 1 hora e 10 minutos.' }));
    const sync = element('button', { type: 'button', text: 'Sincronizar com Google', dataset: { action: 'sync-google' } });
    sync.addEventListener('click', async () => onSync());
    googleCard.append(sync);
  }

  section.append(persistence, themeCard, googleCard);
  root.replaceChildren(section);
}

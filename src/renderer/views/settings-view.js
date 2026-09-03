import { element } from './dom.js';

export function renderSettingsView(root, { theme, databaseLocation }) {
  const section = element('section');
  section.append(element('h2', { text: 'Configurações' }), element('p', { className: 'muted', text: 'Preferências locais, backup e calendário Google.' }));
  const card = element('article', { className: 'task-card' });
  card.append(
    element('h3', { text: 'Persistência local' }),
    element('p', { text: 'Seus dados ficam no SQLite e uma cópia de segurança é criada uma vez por dia.' }),
    element('p', { className: 'muted', text: databaseLocation ?? 'Local protegido do aplicativo.' })
  );
  const themeCard = element('article', { className: 'task-card' });
  themeCard.append(element('h3', { text: 'Tema' }), element('p', { text: `Tema atual: ${theme}` }));
  section.append(card, themeCard);
  root.replaceChildren(section);
}


import { element, labeled } from './views/dom.js';

export function createDangerConfirmDialog({ root, onConfirm = async () => {} }) {
  let current = null;

  function close() {
    const trigger = current?.trigger;
    current = null;
    root.replaceChildren();
    trigger?.focus?.();
  }

  function render(error = '') {
    if (!current) return;
    const backdrop = element('section', { className: 'wizard-backdrop danger-backdrop', attributes: { role: 'presentation' } });
    const dialog = element('section', { className: 'wizard-dialog danger-dialog', attributes: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Excluir atividade definitivamente' } });
    dialog.append(
      element('p', { className: 'eyebrow', text: 'AÇÃO IRREVERSÍVEL' }),
      element('h2', { text: `Excluir “${current.activity.name}”?` }),
      element('p', { className: 'muted', text: 'Isso remove a atividade, frentes, blocos, histórico e itens de Trilha deste computador e da Agenda Google Rotina Gabriel.' }),
      element('p', { className: 'muted', text: `Digite exatamente ${current.activity.name} para confirmar.` })
    );
    if (error) dialog.append(element('p', { className: 'wizard-error', text: error, attributes: { role: 'alert' } }));
    const confirmation = element('input', { name: 'activityConfirmation', attributes: { autocomplete: 'off' } });
    const confirm = element('button', { type: 'button', text: 'Excluir definitivamente', className: 'btn-danger', dataset: { confirmPurge: '' } });
    confirm.disabled = true;
    confirmation.addEventListener('input', () => {
      confirm.disabled = confirmation.value !== current.activity.name;
    });
    confirm.addEventListener('click', async () => {
      if (confirmation.value !== current.activity.name) return;
      confirm.disabled = true;
      try {
        await onConfirm(current.activity);
        close();
      } catch (failure) {
        render(failure.message);
      }
    });
    const cancel = element('button', { type: 'button', text: 'Cancelar', className: 'btn-ghost' });
    cancel.addEventListener('click', close);
    const actions = element('footer', { className: 'wizard-footer danger-footer' });
    actions.append(cancel, confirm);
    dialog.append(labeled('Confirmação', confirmation), actions);
    backdrop.append(dialog);
    backdrop.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
    root.replaceChildren(backdrop);
    confirmation.focus();
  }

  return {
    open({ activity, trigger = document.activeElement }) {
      current = { activity, trigger };
      render();
    },
    close
  };
}

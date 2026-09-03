export const DEFAULT_TEMPLATES = {
  'Inglês — Reading': [
    'Escolher texto',
    'Leitura ativa',
    'Anotar 10 palavras novas',
    'Reler em voz alta',
    'Atualizar ponto atual'
  ],
  'Inglês — Listening': ['Escuta sem legenda', 'Escuta com legenda', 'Shadowing', 'Resumo falado'],
  'Inglês — Speaking': ['Aquecimento 5 min', 'Tema do dia', 'Gravar 3 min', 'Ouvir a gravação'],
  'Trabalho GG': ['Revisar Plane', 'Bloco de foco', 'Handoff/anotação'],
  'Estudo genérico': ['Executar atividade', 'Registrar avanço', 'Atualizar ponto atual']
};

export function createTemplateRepository(routineRepository) {
  return {
    listDefaults() {
      return Object.keys(DEFAULT_TEMPLATES);
    },

    applyToRule({ templateName, ...input }) {
      const checklistTemplate = DEFAULT_TEMPLATES[templateName];
      if (!checklistTemplate) {
        throw new Error('Modelo de checklist não encontrado.');
      }
      return routineRepository.create({
        ...input,
        title: input.title ?? templateName,
        checklistTemplate
      });
    }
  };
}

# Ciclo de vida de Atividades e períodos da rotina

## Objetivo

Permitir que Gabriel organize a rotina por dias da semana com ou sem prazo, navegue pelo calendário em qualquer período e controle o ciclo de vida de uma Atividade sem deixar eventos órfãos no Google Agenda.

## Decisões de produto

### Formas de agendar

O criador de bloco terá dois modos mutuamente exclusivos:

1. **Somente dias da semana**: uma Regra recorrente é válida sem data final. Exemplo: Inglês às segundas e quartas, 05:00–08:00.
2. **Dias da semana dentro de um período**: a mesma Regra tem data inicial e final inclusivas. Exemplo: Inglês às segundas e quartas, de 10/09/2026 a 10/03/2027.

Um período não cria os Blocos de todos os meses antecipadamente. A regra só materializa Blocos quando a Semana visitada está dentro de sua vigência. Isso preserva o banco local e mantém o calendário responsivo.

### Seletor de período

No terceiro passo de **Novo bloco**, o usuário terá:

- seleção dos dias da semana, já existente;
- alternância entre `Sem prazo` e `Definir período`;
- campos `De` e `Até` ao definir período;
- atalhos `3 meses`, `6 meses`, `Personalizado` e `Limpar`;
- calendário compacto de dois meses para escolher o intervalo, baseado na referência visual enviada pelo usuário.

`3 meses` e `6 meses` usam a data de início selecionada; sem início manual, usam a data atual. A data final é inclusiva. A interface rejeita um fim anterior ao início.

### Navegação da rotina

A visualização Calendário da aba Semana terá controles anterior/próxima semana e um botão para voltar à semana atual. A Tabela e o Kanban usam exatamente a mesma Semana selecionada. Ao atravessar o início ou fim de um período, a Regra não renderiza Blocos fora da vigência.

### Exclusão e limpeza

Existem duas ações diferentes:

- **Arquivar atividade**: ação não destrutiva. A Atividade desaparece das listas ativas e as regras e Blocos futuros não concluídos são cancelados. O histórico concluído continua localmente; a regra recorrente correspondente é removida do Google Agenda.
- **Limpar definitivamente**: ação destrutiva, disponível apenas em Arquivadas e protegida por confirmação explícita com o nome da Atividade. Remove localmente a Atividade, Frentes, Regras, Blocos, checklists, itens de Trilha e histórico. Remove também os eventos recorrentes dela no calendário `Rotina Gabriel` antes da limpeza local ser concluída.

Ao não haver conexão ou ocorrer falha ao apagar um evento Google, a limpeza definitiva é interrompida e os dados locais permanecem intactos. O usuário pode reconectar e tentar novamente. A operação nunca usa o calendário principal do usuário, apenas o calendário criado pelo aplicativo.

## Arquitetura

### Banco local

Uma migração incremental adiciona `starts_on` e `ends_on` (`TEXT`, ISO `YYYY-MM-DD`, anuláveis) a `recurrence_rules`. Regras já existentes continuam sem prazo porque ambos os campos ficam nulos.

Os repositórios recebem funções de leitura e alteração de ciclo de vida:

- `rules.create` e `rules.update` aceitam `startsOn` e `endsOn`;
- `ensureBlocksForWeek` ignora dias anteriores a `startsOn` e posteriores a `endsOn`;
- a listagem da Semana aceita uma data de segunda-feira selecionada;
- `activities.archive(id)` desativa a atividade, as Frentes e as Regras relacionadas e cancela apenas Blocos futuros ainda não concluídos;
- `activities.purge(id)` só roda em uma transação local depois do serviço Google confirmar que todos os eventos associados foram apagados.

Chaves estrangeiras e a ordem de remoção impedem registros órfãos: primeiro checklists/Trilha, depois Blocos/Regras/Frentes e, por último, a Atividade.

### Google Agenda

O adaptador Google ganha `deleteEvent(calendarId, eventId)`. A sincronização entende operações `delete-rule` além da operação atual `upsert-rule`.

Arquivar enfileira a remoção da regra no calendário. Limpar definitivamente faz uma limpeza remota imediata e confirmada para cada `googleEventId` conhecido da Atividade; se um evento já não existir no Google, ele é tratado como removido. Somente depois disso a transação local é feita.

### IPC e interface

O preload expõe apenas métodos específicos para arquivar, listar arquivadas, restaurar e limpar definitivamente. O renderer não tem acesso direto ao SQLite, tokens ou credenciais Google.

Na aba Frentes haverá um menu de ações por Atividade: `Arquivar`. Ajustes terá a seção `Arquivadas`, que permite restaurar ou abrir a confirmação destrutiva. A confirmação explica que o histórico e os eventos da agenda serão apagados.

O estado do renderer ganha `selectedWeekStart`, com navegação de Semana. O wizard devolve `startsOn` e `endsOn` apenas quando existe período.

## Erros e segurança

- Fim antes do início e períodos inválidos são bloqueados antes do IPC.
- IDs e datas são validados novamente no processo principal.
- Arquivar é reversível; limpar definitivamente não é.
- Falha de rede ou autorização do Google não apaga dados locais durante a limpeza definitiva.
- A janela de confirmação não revela credenciais ou dados de outra Atividade.

## Testes de aceitação

1. Uma regra sem período cria Blocos em semanas futuras normalmente.
2. Uma regra de 3 meses cria Blocos somente de `starts_on` até `ends_on`, inclusive.
3. Semana anterior/próxima/Toda semana usam a data selecionada nas três visualizações.
4. Arquivar remove a atividade das listas ativas e preserva sessões concluídas.
5. Restaurar reativa a atividade e suas regras sem apagar histórico.
6. Limpeza definitiva só remove dados locais depois de apagar os eventos `Rotina Gabriel`; falha Google preserva tudo localmente.
7. A operação não cria, altera nem remove eventos do calendário principal do usuário.

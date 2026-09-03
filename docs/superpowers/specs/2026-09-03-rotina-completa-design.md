# Rotina Completa — Design

## Objetivo

Evoluir o aplicativo desktop pessoal de Gabriel em um gerenciador de rotina que planeja blocos recorrentes, registra a execução real, mantém continuidade de estudos e sincroniza horários com o calendário Google **Rotina Gabriel**.

O aplicativo é local-first: o SQLite guarda a informação completa; o Google Calendar é o espelho dos compromissos planejados e dos lembretes.

## Decisões aprovadas

- O banco local pode ser reconstruído do zero; não há dados anteriores a migrar.
- O calendário sincronizado é um calendário separado chamado **Rotina Gabriel**, nunca o calendário principal.
- A sincronização é bidirecional e manual, acionada por botão. Alterações de horário, data e título feitas no Google voltam ao aplicativo.
- Em conflito do mesmo campo, vence a alteração com data mais recente.
- O app oferece tema claro e escuro, com preferência persistida no banco.
- A `main` recebe alterações diretamente quando Gabriel solicitar; credenciais e dados privados nunca são enviados ao GitHub.

## Modelo de domínio

As quatro entidades visíveis ao usuário são separadas para que horas, histórico e progresso tenham fontes claras.

### Atividade

É a categoria principal da rotina: Inglês, Trabalho GG, Faculdade ou Academia.

Campos:

- `id`, `name`, `category`, `color`, `weeklyGoalMinutes`, `active`, `createdAt`, `updatedAt`.
- As horas totais e o cumprimento de meta são calculados a partir dos Blocos concluídos, não gravados como valor duplicado.

### Frente

É uma linha de trabalho dentro de uma Atividade: Reading, Writing, Listening e Speaking no Inglês; projetos no Trabalho GG.

Campos:

- `id`, `activityId`, `name`, `defaultWeekday`, `weeklyGoalMinutes`.
- `currentPoint` e `nextStep`, atualizados quando um Bloco é finalizado.
- `active`, `createdAt`, `updatedAt`.

### Bloco

É uma execução individual em uma data. É a fonte de todas as métricas de horas e de aderência.

Campos:

- ligação com `activityId`, `frontId` opcional e `recurrenceRuleId` opcional;
- `date`, início/fim planejados, início/fim reais e status;
- `finishReason` (`goal_completed`, `fatigue`, `interruption`, `unexpected`, `other`);
- nota e `continuationPoint`;
- IDs do evento Google e da recorrência Google quando existirem;
- datas de criação, atualização e última alteração importada do Google.

O app calcula duração real, atraso de início, encerramento antecipado, semana e mês usando os horários efetivos. Um bloco cancelado preserva dados e fica fora de horas concluídas.

### Trilha

Representa etapas ordenadas de uma Frente: capítulos, unidades, lições ou episódios. Ela permite medir progresso além de horas acumuladas.

Campos:

- `id`, `frontId`, `position`, `title`, `status`, `completedAt`, `createdAt`, `updatedAt`.

## Tabelas técnicas

As seguintes tabelas apoiam as quatro entidades, mas não são áreas separadas da interface:

- `recurrence_rules`: dia ou dias da semana, início/fim planejados, Atividade, Frente, título, checklist-modelo e ID da série recorrente Google.
- `block_checklist_items`: itens de checklist de um bloco, criados a partir do modelo da regra; cada um tem texto, ordem e conclusão.
- `settings`: tema, configuração de backup, calendário Google selecionado e data da última sincronização visível.
- `sync_state` e `sync_queue`: token incremental do Google, operações pendentes, tentativas e erros legíveis.
- `schema_migrations`: versão das migrações executadas.

## Planejamento e execução

1. O usuário cria uma Atividade e suas Frentes.
2. Ele cria regras recorrentes, como Reading na segunda, Writing na terça, 05:00–08:00.
3. O aplicativo materializa os Blocos da semana a partir das regras, sem duplicá-los em execuções repetidas.
4. Em **Hoje**, o usuário clica em Começar; isso grava o início real.
5. Em Finalizar, o usuário informa avanço, ponto de continuação, nota e motivo. O bloco recebe o fim real e a Frente recebe novo ponto atual e próximo passo.
6. A Trilha pode ser atualizada para marcar uma etapa concluída.

Os modelos de checklist iniciais são:

- Inglês — Reading: escolher texto, leitura ativa, anotar 10 palavras, reler em voz alta, atualizar ponto atual.
- Inglês — Listening: escuta sem legenda, escuta com legenda, shadowing, resumo falado.
- Inglês — Speaking: aquecimento de 5 minutos, tema do dia, gravar 3 minutos, ouvir a gravação.
- Trabalho GG: revisar Plane, bloco de foco, handoff/anotação.
- Estudo genérico.

## Interface

O shell mostra navegação, estado do calendário, botão de tema e botão **Sincronizar com Google**.

- **Minha semana:** grade de segunda a domingo, regras e blocos coloridos por Atividade; formulários para Atividade, Frente e regra recorrente.
- **Hoje:** somente os blocos da data atual; iniciar, finalizar, checklist e registro de continuidade.
- **Progresso:** filtros por Atividade, Frente e intervalo predefinido ou personalizado. Mostra cartões e gráficos de horas por atividade, evolução semanal, consistência diária, distribuição das Frentes, meta versus realizado e aderência de horário.
- **Histórico:** filtro de Frente; destaca ponto atual e próximo passo, seguido de Blocos em ordem cronológica decrescente.
- **Configurações:** tema, local de backup, estado do Google, calendário Rotina Gabriel e sincronização manual.

O primeiro uso respeita o tema do Windows. Após a primeira troca manual, `settings.theme` mantém a preferência. A interface usa variáveis CSS para que o mesmo componente funcione nos dois temas.

## Persistência e backups

O banco SQLite permanece em `app.getPath('userData')`. Toda modificação composta usa transação: finalizar um Bloco, salvar a continuidade e atualizar a Frente ocorre de forma atômica.

Antes de cada migração e uma vez por dia quando o app for aberto, uma cópia consistente do banco é criada em uma pasta de backups local. O app também permite abrir a pasta de backup. Dados de uso não são enviados a nenhum serviço externo além dos dados de agenda necessários ao Google Calendar.

## Integração com Google Calendar

### Autorização

O processo principal usa OAuth 2.0 para aplicativo desktop. O fluxo abre a tela de consentimento do Google no navegador; os tokens são guardados apenas no diretório de dados do app. O arquivo de credenciais e os tokens permanecem ignorados pelo Git.

Na primeira sincronização, o app localiza o calendário chamado **Rotina Gabriel**; se ele não existir, cria um calendário com esse nome e grava o `calendarId` em `settings`.

### Exportação ao Google

Uma regra recorrente gera ou atualiza um evento recorrente com `RRULE` no calendário Rotina Gabriel. Cada evento tem:

- horário com `America/Sao_Paulo` e offset explícito;
- lembretes de popup em 60 e 10 minutos, com `useDefault: false`;
- `extendedProperties.private` com IDs locais para permitir o vínculo;
- atualização por PATCH quando o vínculo já existe, evitando duplicatas.

Alterar somente um Bloco de uma data gera uma exceção da série; não altera todos os dias da regra.

### Importação e conflitos

Depois de enviar as operações locais, o app usa o token incremental do Google para trazer eventos alterados no calendário Rotina Gabriel. Ele atualiza regra recorrente ou Bloco individual conforme o tipo de evento e seus IDs privados.

Para cada título, data e horário sincronizável, a data local e a data remota são comparadas. Vence a mais recente. Notas, checklists, Trilha, ponto atual e próximo passo são locais e nunca são substituídos pelo Google.

Se um evento remoto for removido, o Bloco ou regra correspondente é cancelado/desativado, sem apagar sessões concluídas, anotações ou histórico. Falhas de rede deixam as operações na fila local e o botão mostra um erro recuperável.

## Segurança

- O renderer não recebe Node.js nem o cliente Google; usa apenas métodos específicos expostos pelo preload.
- Toda entrada IPC é validada no processo principal.
- Tokens, credenciais, bancos e backups são ignorados pelo Git.
- O app não registra conteúdo de tokens nem dados pessoais em logs exibidos ao usuário.

## Testes e aceite

Testes automatizados cobrem:

- migrações e reconstrução do banco;
- criação de Atividade, Frente, regra, Bloco, checklist e Trilha;
- duração real, atraso, encerramento antecipado, períodos e metas;
- atualização transacional de Bloco e Frente;
- filtros e dados dos gráficos;
- tema persistido;
- exportação, atualização, importação, exclusão e conflito do cliente Google simulado;
- validações IPC e componentes da interface.

Teste manual final:

1. Criar Inglês, suas quatro Frentes e regras de segunda a quinta.
2. Iniciar um bloco às 05:18 e finalizar às 07:40.
3. Confirmar 142 minutos, ponto de continuação e atualização da Frente.
4. Verificar gráficos da semana e mês.
5. Sincronizar e confirmar o evento com lembretes no calendário Rotina Gabriel.
6. Alterar horário no Google, sincronizar e confirmar a mudança no aplicativo.
7. Fechar e abrir o app, confirmando a persistência e o backup.

## Limites da primeira entrega

Não há múltiplos usuários, aplicativo de celular, servidor próprio ou sincronização automática em segundo plano com o aplicativo fechado. A sincronização é manual pelo botão e também pode ser oferecida ao abrir o aplicativo.

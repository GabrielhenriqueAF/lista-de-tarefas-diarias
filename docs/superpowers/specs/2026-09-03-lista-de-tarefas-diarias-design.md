# Lista de Tarefas Diárias — Design

## Objetivo

Criar um aplicativo desktop para Windows que ajude Gabriel a planejar e executar tarefas recorrentes. O aplicativo deve registrar o tempo realmente dedicado, organizar subtarefas semanais, preservar um histórico de progresso e manter uma sincronização bidirecional com o Google Agenda.

## Escopo da primeira versão

- Criar, editar, arquivar e excluir tarefas.
- Programar tarefas por dia da semana, com horários planejados.
- Exibir a rotina na aba **Minha semana** e a lista executável na aba **Hoje**.
- Iniciar e finalizar uma sessão; o usuário pode terminá-la antes do horário planejado.
- Registrar início planejado, início real, fim real, duração calculada e nota da sessão.
- Criar subtarefas recorrentes por dia, como `reading`, `writing`, `listening` e `speaking` para Inglês.
- Registrar avanço, ponto de continuidade e histórico por subtarefa.
- Mostrar progresso por tarefa com filtros de semana e mês: horas, quantidade de dias ativos e evolução das subtarefas.
- Sincronizar eventos do app com o Google Agenda e importar alterações feitas no Google.
- Criar eventos com alertas de 60 e 10 minutos antes do horário planejado.

## Fora de escopo inicial

- Vários usuários, colaboração e compartilhamento de tarefas.
- Sincronização com serviços além do Google Agenda.
- Aplicativo para celular.
- Sincronização em tempo real por servidor. A primeira versão sincroniza na abertura, manualmente e após alterações locais.

## Tecnologia

- **Node.js:** ambiente de execução e automação do aplicativo.
- **Electron:** janela nativa para Windows; processo principal controla banco, arquivos e integração com Google.
- **HTML, CSS e JavaScript:** interface visível do aplicativo.
- **SQLite:** banco local único, armazenado no diretório de dados do aplicativo.
- **Google Calendar API + OAuth 2.0:** autorização da conta Google e sincronização de compromissos.

As credenciais OAuth e os tokens de acesso ficam apenas no computador. Nunca entram no Git.

## Interface

O aplicativo usa uma navegação por abas:

1. **Minha semana:** visão principal. Mostra os sete dias, tarefas programadas, horários e status de cada sessão.
2. **Hoje:** visão de execução. Permite iniciar, finalizar e anotar uma sessão em poucos cliques.
3. **Progresso:** mostra dados filtrados por período e tarefa: tempo total, dias ativos, meta mensal e avanço de subtarefas.
4. **Histórico:** lista sessões anteriores, notas e o último ponto registrado em cada subtarefa.

O layout combina a grade semanal da referência visual com uma aba independente de progresso por tarefa.

## Modelo de dados

### Tarefa

Representa uma atividade principal, por exemplo `Estudar inglês` ou `Trabalho GG`.

- título, cor, descrição opcional e estado ativo/arquivado;
- meta mensal opcional em minutos;
- identificador da tarefa no Google Agenda quando houver vínculo.

### Programação semanal

Define quando uma tarefa deve ocorrer.

- dia da semana;
- horário planejado de início e fim;
- subtarefa opcional do dia;
- estado de sincronização e identificador do evento/recorrência no Google.

### Sessão

É uma ocorrência executada da programação.

- data;
- início e fim planejados;
- início e fim reais;
- duração calculada em minutos;
- status: não iniciada, em andamento, concluída, pulada ou cancelada;
- nota da sessão.

### Progresso de subtarefa

Registra a continuidade do estudo.

- subtarefa vinculada à tarefa e ao dia da semana;
- avanço informado pelo usuário;
- ponto onde parou;
- referência à sessão que fez o registro;
- histórico cronológico imutável das anotações.

### Estado de sincronização

Guarda o token da última leitura do Google Agenda, vínculos entre eventos e tarefas e datas de atualização local/remota.

## Fluxo de execução

1. A programação semanal cria a tarefa mostrada em **Minha semana** e **Hoje**.
2. Ao clicar em iniciar, o app grava o horário real.
3. Ao finalizar, calcula a duração, guarda a nota e atualiza os indicadores de progresso.
4. O app mostra o último ponto da subtarefa antes de uma nova sessão para permitir continuidade.
5. As métricas somam a duração real, nunca apenas o horário planejado.

## Sincronização com Google Agenda

### Do aplicativo para o Google

Criar ou editar uma programação cria ou atualiza o evento correspondente no calendário principal. Cada evento recebe dois lembretes do tipo notificação: 60 e 10 minutos antes.

### Do Google para o aplicativo

Na abertura do app, por comando manual e depois de uma alteração local, o app busca os eventos que mudaram desde a última sincronização. Alterações de título, data ou horário feitas no Google atualizam a programação correspondente no aplicativo. Alterar uma série recorrente atualiza sua programação semanal; alterar apenas uma ocorrência atualiza somente a sessão daquele dia.

### Conflitos e exclusões

- Quando o mesmo dado foi modificado nos dois lados antes de sincronizar, vence a alteração com data mais recente.
- Se o evento for excluído no Google, a ocorrência correspondente é marcada como cancelada no aplicativo. Sessões e histórico não são apagados.
- Notas detalhadas, avanço e ponto de continuidade existem somente no aplicativo; o Google Agenda recebe os dados de compromisso necessários.

### Falhas de conexão

O aplicativo funciona offline. Alterações pendentes ficam marcadas localmente e a sincronização é tentada novamente quando o usuário abrir o app ou solicitar sincronização.

## Segurança

- O login Google usa OAuth 2.0 de aplicativo desktop.
- Tokens e credenciais não entram no repositório.
- `.gitignore` excluirá arquivos de credenciais, banco local, dependências e arquivos de brainstorming.

## Testes

- Testes unitários para cálculo de duração, filtros semanal/mensal e resolução de conflito por atualização mais recente.
- Testes do banco SQLite para criação de tarefa, sessão e histórico de subtarefa.
- Testes simulados da integração Google para criação, atualização, importação e eventos removidos.
- Teste manual completo: criar uma tarefa, iniciar/finalizar antes do horário, alterar o evento no Google e confirmar a mudança no app.

## Fluxo Git e Pull Requests

- `main` contém apenas versões estáveis.
- Toda alteração nasce em uma branch no VS Code, como `feature/tela-semana`.
- A branch é enviada ao GitHub e recebe uma Pull Request para `main`.
- Uma PR só é mesclada após revisão e testes relevantes.

## Critérios de sucesso

1. Uma tarefa como `Estudar inglês — 05:00–08:00` aparece nos dias configurados.
2. O usuário pode registrar início às 05:18 e término antecipado; os gráficos usam o tempo real.
3. O app mostra progresso mensal e semanal por tarefa.
4. A subtarefa do dia mostra o último ponto registrado e mantém seu histórico.
5. Mudanças nos dois lados do vínculo Google aparecem no outro lado após sincronização.
6. Nenhuma credencial Google é enviada ao GitHub.

# Rotina Gabriel — Interface Focada para Desktop

## Objetivo

Redesenhar a interface do **Rotina Gabriel** para priorizar a execução da rotina, e não o cadastro. O aplicativo abrirá em **Hoje**, exibirá a semana como uma agenda por horário e concentrará a criação em um modal curto. O banco SQLite, o histórico, a Trilha, o tema persistido e a sincronização manual com o Google Calendar serão mantidos.

O arquivo `F:\rotina.html` é uma referência de linguagem visual e de fluxo. Seus dados de demonstração e seu JavaScript não serão copiados para o aplicativo.

## Princípios de experiência

- A primeira resposta da tela **Hoje** é: “o que devo fazer agora?”.
- Cadastro não ocupa a tela de uso; ele começa pelo único CTA contextual **Novo bloco**.
- A cor identifica uma Atividade, mas não colore grandes áreas de fundo. Cada Bloco usa um filete lateral de 3 px e etiquetas discretas.
- A página tem conteúdo centralizado em até 980 px, com campos em largura controlada. Nenhum seletor ocupa a largura inteira da janela sem necessidade.
- Horários, duração, indicadores e cronômetro usam algarismos tabulares para não variar de largura.
- Botões secundários são ghost; cada área tem no máximo um botão primário.
- Avisos transitórios usam toast com desaparecimento automático. O cabeçalho exibe somente o estado resumido da sincronização.

## Shell do aplicativo Windows

O processo principal remove o menu padrão `File / Edit / View / Window` e usa uma janela com barra de título integrada ao conteúdo. O renderer fornece uma barra de 44–56 px com:

- marca discreta “Rotina Gabriel”;
- navegação: **Hoje**, **Semana**, **Frentes**, **Progresso** e **Ajustes**;
- estado do Google (“Sincronizado há pouco”, “Pendente” ou “Offline”);
- botão de ícone para alternar o tema.

A área vazia da barra recebe `-webkit-app-region: drag`; botões, navegação e controles recebem `-webkit-app-region: no-drag`. Os controles nativos da janela permanecem visíveis no Windows. A janela inicia na aba `today`.

## Sistema visual

O CSS deixa de usar o gradiente azul como fundo. Ele passa a definir tokens reaproveitáveis para cores, espaçamento, raios e controles.

| Token | Escuro | Claro | Uso |
| --- | --- | --- | --- |
| `--page` | `#1A1917` | `#FBFAF7` | fundo da janela |
| `--surface-1` | `#221F1C` | `#FFFFFF` | cartões e modal |
| `--surface-2` | `#2A2622` | `#F4F1EB` | controles e estados sutis |
| `--line` | branco a 9% | preto a 11% | separadores |
| `--text-1` | `#EFEAE1` | `#1E1B16` | texto principal |
| `--text-2` | `#A8A197` | `#5F594F` | texto secundário |
| `--accent` | `#E0A33C` | `#9A6B12` | ação primária e foco |
| `--success` | `#86A96E` | `#4F7538` | conclusão e sincronização |

As escalas fixas de espaço são 4, 8, 12, 16, 24, 32 e 48 px. Controles têm raio de 6 px; cartões e modal, 10 px. `select`, `date` e `time` usam `color-scheme` compatível com o tema e setas personalizadas, evitando controles claros no modo escuro. O seletor de cor vira oito swatches circulares acessíveis e uma opção de cor personalizada.

## Hoje

**Hoje** é a visão padrão. Ela recebe os Blocos materializados para a data atual e monta três regiões, nessa ordem:

1. Cabeçalho com “Hoje”, data por extenso e botão ghost **Novo bloco**.
2. Cartão “agora” com a tarefa em andamento. Ele mostra título, horário planejado, status, tempo restante ou até o próximo Bloco, barra de progresso, checklist e ações compatíveis com o status: começar, concluir/finalizar e anotar onde parou. Se não houver um Bloco em andamento, exibe o próximo; se o dia estiver vazio, mostra uma ação clara para criar o primeiro Bloco.
3. Agenda leve do dia: uma linha por Bloco, com horário, filete colorido da Atividade, título e duração planejada. A linha atual recebe um marcador de horário. Ao final, aparece o resumo de Blocos, tempo planejado e tempo real concluído.

O tempo relativo é atualizado visualmente a cada 30 segundos somente enquanto a aba Hoje estiver ativa. Gravações de início, fim, checklist e continuidade continuam usando os mesmos métodos `routineApi.blocks` e `routineApi.track` existentes.

## Semana

**Semana** substitui a antiga tela de três formulários. Ela é uma agenda de segunda a domingo:

- cabeçalho com semana atual e um único botão primário **Novo bloco**;
- cabeçalho das sete colunas com o dia atual destacado;
- régua de horários e linhas de uma hora;
- cada Bloco é posicionado por `plannedStartAt` e `plannedEndAt`, dentro de uma faixa que começa às 05:00 e se estende até, pelo menos, 22:00 ou o último horário planejado;
- cartões pequenos apresentam título e início, sem esconder a cor da Atividade;
- a grade permite rolagem vertical quando necessário.

O modal é a ação de criação. Não haverá mais formulários persistentes lado a lado na Semana.

### Modos Tabela, Kanban e Calendário

A Semana possui um seletor compacto de visualização com três opções, inspirado nas referências enviadas: **Tabela**, **Kanban** e **Calendário**. É o mesmo conjunto de Blocos da semana, portanto trocar de modo não cria cópias nem altera o banco.

- **Tabela** é a visão mais enxuta para revisar a rotina. Cada linha mostra título do Bloco, etiqueta colorida da Atividade, Frente opcional, data/início planejados e status. Ela usa separadores finos, cabeçalho fixo somente dentro de sua área de rolagem e nenhuma coluna sem dado no domínio atual.
- **Kanban** agrupa os Blocos pelos status locais: **A fazer** (`planned`), **Em andamento** (`in_progress`), **Concluído** (`completed`) e **Cancelado** (`cancelled`). Os cartões exibem filete colorido, título, hora e etiqueta da Atividade. A mudança real de status continua acontecendo pelas ações de Hoje; o quadro não finge que arrastar um cartão conclui uma sessão.
- **Calendário** é a agenda semanal por horário já descrita acima. Ele privilegia compromissos como Inglês às 05:00 e Trabalho GG às 08:00, em vez de uma grade mensal que esconderia duração e sobreposição.

O modo inicial da Semana é **Calendário**. Os outros dois modos podem ser alternados sem recarregar dados e sem aparecer como novas abas principais, mantendo o cabeçalho limpo.

## Modal Novo bloco

O modal tem foco preso enquanto estiver aberto, fecha por Escape, botão Fechar ou clique no fundo, e devolve o foco ao botão que o abriu. Seus três passos são claros e não permitem avançar com campos inválidos.

1. **Atividade**: selecionar uma Atividade existente ou criar uma nova com nome, categoria, meta semanal e cor.
2. **Frente**: selecionar uma Frente da Atividade, criar uma Frente com ponto atual e próximo passo, ou continuar sem Frente para tarefas como Trabalho GG.
3. **Agenda**: escolher um ou mais dias da semana, início, término e subtarefas (uma por linha).

Ao concluir, o renderer cria somente as entidades novas necessárias e chama `routineApi.rules.create` com todos os dias selecionados em `weekdays`. O modelo já suporta vários dias em uma regra, portanto não há mudança de esquema do banco. O modal exibe toast de confirmação e atualiza a visão que estava ativa.

## Frentes, Progresso e Ajustes

### Frentes

A antiga aba Histórico passa a se chamar **Frentes**. O seletor fica limitado a uma largura confortável. Cada Frente mostra Atividade e cor, ponto atual, próximo passo, Trilha e sessões recentes, em cartões de leitura compactos. O conteúdo histórico existente não é removido.

### Progresso

Filtros por Atividade, Frente e período ficam em uma única linha que quebra somente em telas pequenas. Os três indicadores principais seguem antes dos gráficos. Gráficos usam linhas finas e barras com a cor da Atividade quando disponível; sem painéis excessivamente altos.

### Ajustes

Configurações deixam de ser três cartões grandes e passam a ser linhas separadas: tema, persistência/backups e Google Agenda. A linha do Google mantém conexão, última sincronização e botão de sincronização. Um toast mostra o resultado; o topo mantém apenas o estado resumido.

## Componentes e limites

- `app.js` mantém o estado da aba, o carregamento de dados e as chamadas de `routineApi`.
- Uma nova unidade de renderer concentra o modal/wizard e não conhece SQLite, Google ou IPC.
- Cada view renderiza somente seu conteúdo: Hoje, Semana, Frentes, Progresso ou Ajustes.
- `styles.css` concentra tokens e estilos reutilizáveis; não há estilos inline além da variável de cor de uma Atividade/Bloco e do posicionamento calculado de Blocos na agenda.
- O processo principal só muda o chrome da janela. Repositórios SQLite, serviços de backup, OAuth e sincronização Google permanecem inalterados.

## Dados, sincronização e segurança

Não haverá migração ou recriação de banco. Atividades, Frentes, regras, Blocos, checklists, Trilha, preferências e fila de sincronização existentes continuarão sendo usados. Criar ou alterar uma regra pelo modal continua enfileirando a operação para o calendário **Rotina Gabriel**. Credenciais e tokens continuam exclusivos do diretório privado do aplicativo e fora do Git.

## Feedback e acessibilidade

- Toasts têm `role="status"`, desaparecem após três segundos e não ocupam espaço permanente no topo.
- Todos os botões têm texto ou `aria-label` claro.
- O foco visível usa a cor de destaque e o teclado percorre modal, navegação, checklists e ações.
- Estados vazios incluem título, explicação curta e ação útil.
- O tema salvo continua sendo aplicado antes da primeira renderização visível.

## Testes e aceite

Testes automatizados deverão confirmar:

- a aba inicial é Hoje e a navegação muda a área renderizada;
- Hoje mostra Bloco atual, próximo ou estado vazio com CTA, sem perder checklist e ações de início/fim;
- Semana alterna entre Tabela, Kanban e Calendário usando os mesmos Blocos; Calendário posiciona Blocos por horário, incluindo uma regra com vários dias;
- Tabela mostra atividade, data/hora e status; Kanban agrupa corretamente `planned`, `in_progress`, `completed` e `cancelled`;
- o wizard valida cada passo e cria Atividade/Frente somente quando o usuário escolhe criar;
- o wizard cria uma regra sem Frente quando ela é opcional;
- o toast aparece e desaparece sem permanecer como status fixo;
- tema claro e escuro aplicam os tokens e controles de data/hora corretos;
- o preload continua expondo somente a ponte segura e a suíte de banco/Google permanece verde.

Aceite manual:

1. Abrir o app e verificar Hoje sem formulários de cadastro visíveis.
2. Criar Inglês, Frente Writing e horários de segunda a quinta pelo modal.
3. Criar Trabalho GG sem Frente em mais de um dia da semana.
4. Iniciar e finalizar um Bloco, registrar checklist e ponto de continuidade.
5. Conferir Semana, Frentes e Progresso com os dados criados.
6. Alternar tema e reiniciar o app, confirmando a preferência.
7. Sincronizar e conferir os eventos e lembretes no calendário Google Rotina Gabriel.

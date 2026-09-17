# Daymint Platform — Arquitetura de contas, planos e pagamentos

## Status

Proposta aprovada para revisão antes do planejamento de implementação.

## Contexto e objetivo

O aplicativo atual, **Rotina Gabriel**, é um desktop Electron de uso local para planejar e executar blocos de rotina. Ele usa SQLite, possui Atividades, Frentes, regras recorrentes, blocos materializados, checklists, trilha, relatórios e sincronização manual com Google Agenda.

O produto passará a se chamar **Daymint**. “Rotina Gabriel” será o primeiro Workspace, e não o nome do aplicativo. O objetivo é transformar a base atual em uma plataforma de rotina multi-conta, com planos por Workspace e cobrança mensal. A evolução deve preservar a organização existente do Electron e tornar cada etapa clara para estudo.

O nome técnico é `daymint-platform`. Os componentes são `daymint-desktop` e `daymint-api`.

## Decisões de produto

### Referências do ClickUp adotadas

O Daymint não tentará reproduzir todo o ClickUp. Estas ideias foram selecionadas por se aplicarem a uma rotina pessoal que pode crescer para colaboração:

- uma hierarquia de trabalho que cresce sem misturar contextos;
- uma fonte de dados que aparece em múltiplas visões;
- blocos recorrentes e subtarefas para execução diária;
- indicadores derivados da atividade real, e não de preenchimento manual;
- limites de plano que preservam os dados e bloqueiam somente novas criações;
- recursos avançados liberados de acordo com o plano do Workspace.

O ClickUp usa a Hierarchy Workspace → Space → Folder → List → Task → Subtask. O Daymint começa mais enxuto: **Conta → Workspace → Atividade → Frente → Regra → Bloco → Subtarefa**.

### Planos

| Plano | Preço | Itens ativos | Recursos |
| --- | ---: | ---: | --- |
| Free | R$ 0 | 15 | Hoje, Semana, Frentes e checklist |
| Pro | R$ 19,90/mês | 50 | Progresso completo, Google Agenda, exportação e base para colaboração |

Um item ativo é uma regra recorrente ativa ou um bloco avulso com status `planned` ou `in_progress`. Blocos concluídos e cancelados não contam. Blocos materializados de uma regra recorrente não contam adicionalmente, para que uma rotina semanal não consuma o limite repetidamente.

Ao atingir o limite ou ao perder o Pro, o Daymint mantém todos os dados visíveis. A pessoa pode concluir e consultar itens existentes, mas não criar um item que exceda seu direito de uso.

### Cobrança

- O plano pertence ao Workspace, e não a uma tarefa ou a uma conta isolada.
- A assinatura é mensal.
- Cartão é o método principal de renovação automática.
- Pix e boleto são opções de cobrança mensal manual: a liberação acontece somente após confirmação do pagamento.
- Nenhum fluxo do cliente libera o plano. A API libera o Pro apenas após validar um evento aprovado do Mercado Pago.
- Uma tela de cobrança com identidade visual própria do Daymint pode ter a objetividade de um checkout moderno, mas nunca coleta nem armazena número de cartão, CVV ou data de expiração. O formulário de pagamento será hospedado ou tokenizado pelo Mercado Pago.

Essa separação evita prometer renovação automática por boleto. A documentação do Mercado Pago apresenta Pix e boleto para a solução de Assinaturas, mas também marca meios `ticket` como indisponíveis para Assinaturas em sua matriz de métodos. Antes de produção, a conta de vendedor e o sandbox determinarão exatamente quais opções estão habilitadas.

## Arquitetura

O repositório continuará com a estrutura atual do Electron e receberá uma API adjacente. Não haverá uma migração para monorepo nesta primeira etapa.

```text
lista-de-tarefas-diarias/
├─ src/                         # Daymint Desktop, estrutura existente
│  ├─ main/                     # processo Electron e ponte segura
│  ├─ renderer/                 # interface vanilla JavaScript
│  └─ shared/                   # regras independentes da interface
├─ server/                      # Daymint API, novo serviço Node.js
│  ├─ src/
│  │  ├─ identity/              # cadastro, login, sessão e senha
│  │  ├─ workspaces/            # workspaces e membros
│  │  ├─ routines/              # domínio da rotina centralizado
│  │  ├─ billing/               # plano e direitos de uso
│  │  ├─ payments/              # porta e adaptador Mercado Pago
│  │  └─ webhooks/              # recepção e validação de eventos
│  └─ tests/
├─ docs/
└─ .env.example                 # modelo sem segredos, criado na implementação
```

O PostgreSQL será a fonte oficial dos dados compartilhados. O SQLite atual permanece durante a transição como cache e backup local do desktop, não como autoridade para contas, planos ou assinaturas.

O renderer do Electron continua conversando somente com uma ponte segura no preload. O processo principal passa a usar um cliente autenticado da `daymint-api`; credenciais de pagamento nunca transitam pela ponte nem pelo renderer.

## Modelo de dados

### Identidade e isolamento

| Tabela | Responsabilidade |
| --- | --- |
| `users` | conta, e-mail único, nome, hash de senha e datas de auditoria |
| `sessions` | sessões revogáveis; armazena somente hash do token de renovação |
| `workspaces` | nome, proprietário e estado do Workspace |
| `workspace_members` | relação usuário/Workspace e papel `owner` ou `member` |

Todos os recursos de rotina recebem `workspace_id`. Toda consulta da API deve receber o usuário autenticado, localizar sua associação ao Workspace e filtrar no banco por esse Workspace. O servidor não confia em um `workspace_id` enviado pelo cliente sem validar a associação.

### Rotina

As entidades existentes são preservadas conceitualmente:

| Atual | Daymint |
| --- | --- |
| `activities` | atividade de um Workspace |
| `fronts` | contexto ou linha de continuidade de uma atividade |
| `recurrence_rules` | modelo de bloco recorrente |
| `blocks` | execução planejada ou real de uma regra/atividade |
| `block_checklist_items` | subtarefa de um bloco |
| `track_items` | itens da trilha de uma frente |

`workspace_id` será incluído em cada entidade de topo e as relações de chave estrangeira impedirão vínculos entre Workspaces distintos.

### Billing

| Tabela | Responsabilidade |
| --- | --- |
| `plans` | catálogo versionado de Free e Pro, preço e limites |
| `subscriptions` | plano atual, período, estado e identificador do Mercado Pago |
| `payment_attempts` | tentativa de checkout, método, valor, status e referência externa |
| `webhook_events` | evento recebido, assinatura/validação, payload mínimo e processamento idempotente |
| `entitlement_audit_events` | registro de concessões, expirações e mudanças manuais autorizadas |

O serviço `billing` expõe uma operação única: `getEntitlements(workspaceId)`. Ela retorna plano, limite de itens ativos e recursos. `assertCanCreateRoutineItem(workspaceId)` é executada no servidor antes de criar uma regra recorrente ou bloco avulso.

## API e fluxos

### Autenticação e Workspaces

- `POST /auth/register`: cria a conta, seu primeiro Workspace e a associação `owner` numa transação.
- `POST /auth/login`: cria uma sessão revogável.
- `POST /auth/refresh` e `POST /auth/logout`: renovam ou revogam a sessão.
- `GET /workspaces`: lista somente Workspaces dos quais a conta faz parte.
- `POST /workspaces`: cria Workspace sob os limites do plano apropriado no futuro.
- `GET /workspaces/:workspaceId/entitlements`: retorna plano e direitos do membro autenticado.

Senhas recebem hash forte no servidor. O desktop guarda somente tokens de sessão no armazenamento seguro do sistema operacional, nunca senha em SQLite ou no renderer.

### Plano e checkout

1. O Owner abre Conta e cobrança, seleciona o Pro e o método de pagamento.
2. O desktop pede `POST /workspaces/:workspaceId/billing/checkout`.
3. A API cria um `payment_attempt` e pede ao adaptador Mercado Pago uma assinatura ou cobrança correspondente. Uma referência externa une os dois sistemas.
4. A API devolve uma URL segura do checkout hospedado. O Electron abre essa URL no navegador padrão; o cartão permanece no ambiente do Mercado Pago.
5. O Mercado Pago chama `POST /webhooks/mercado-pago` em HTTPS público.
6. A API verifica a origem e consulta o pagamento/assinatura no Mercado Pago antes de aceitar seu estado. Ela grava o evento de forma idempotente.
7. Um pagamento aprovado ativa ou estende o Pro e grava um evento de auditoria. Estados pendente, recusado, cancelado ou expirado não concedem acesso.
8. O desktop consulta os direitos novamente e atualiza a interface.

Endpoints de gestão do Owner incluem `GET /billing/status`, `GET /billing/history` e `POST /billing/cancel`. O cancelamento preserva Pro até o fim do período já pago.

### Desenvolvimento sem pagamento real

O serviço possui uma porta `PaymentProvider` com duas implementações:

- `MercadoPagoProvider`: usada somente com credenciais de sandbox ou produção no servidor.
- `DevPaymentProvider`: gera uma tentativa de pagamento simulada e aciona o mesmo caso de uso que trata um webhook aprovado.

O endpoint de aprovação simulada só existe quando `NODE_ENV=development`, requer um token de desenvolvimento, aceita conexões locais e não é incluído na configuração de produção. O fixture “Drumond Demo” cria dados fictícios de conta e Workspace para demonstrar Free, Pro, Pix, boleto e cartão; nenhum dado financeiro real é criado ou armazenado.

## Segurança e configuração

- `.gitignore` incluirá `node_modules/`, `.env`, `.env.*` e arquivos locais de banco/backup. `.env.example` será o único arquivo de configuração versionado.
- `MP_ACCESS_TOKEN`, segredo de webhook, URL do banco e tokens de sessão ficam apenas no ambiente do servidor.
- Tokens de cartão, se existirem, são gerados pelo Mercado Pago e tratados apenas conforme o fluxo oficial; o Daymint não guarda PAN, CVV ou data de expiração.
- O webhook valida assinatura/origem quando disponível, consulta o recurso no provedor e ignora eventos já processados.
- Logs não registram senha, tokens, número de documento completo ou payload sensível de pagamento.
- As migrations usam chaves estrangeiras e filtros de Workspace em toda consulta para evitar vazamento entre contas.

## Migração gradual

1. Criar a API e o PostgreSQL, sem alterar ainda a rotina de uso local.
2. Implementar identidade, Workspace e billing com testes independentes.
3. Criar uma exportação do SQLite local e importar as atividades existentes para o primeiro Workspace de cada pessoa.
4. Substituir chamadas diretas do Electron por um cliente de API, uma área por vez, começando por Atividades e blocos.
5. Manter backup local e uma tela clara de estado de sincronização durante a transição.
6. Só depois de validação, tornar a API a fonte obrigatória para novos dados.

Não haverá remoção automática de banco SQLite ou dados existentes. O usuário controla quando inicia a migração.

## Falhas esperadas

| Situação | Comportamento |
| --- | --- |
| checkout abandonado | tentativa fica pendente/expirada; plano não muda |
| webhook duplicado | evento é ignorado sem duplicar dias de Pro |
| webhook temporariamente indisponível | API registra falha e permite reconciliação segura pelo identificador externo |
| pagamento recusado | Pro não é concedido; a interface mostra o próximo passo |
| renovação não confirmada | acesso continua só até o fim do período pago; depois retorna ao Free sem apagar dados |
| limite atingido | criação é bloqueada com explicação e CTA para plano; dados existentes continuam acessíveis |
| membro sem permissão | API responde acesso negado e não revela dados do Workspace |

## Testes e critérios de aceite

### Unitários

- `getEntitlements` e limite de 15/50 itens ativos.
- contagem correta de regra recorrente versus blocos materializados.
- isolamento de Workspace em cada repositório.
- transições de assinatura aprovadas, recusadas, vencidas e canceladas.
- deduplicação de webhook pelo identificador do provedor.

### Integração

- cadastro cria User, Workspace e Owner de forma atômica.
- membro não consulta ou altera outro Workspace.
- checkout simulado gera a tentativa e o webhook simulado concede Pro.
- fluxo de Pix e boleto permanece pendente até confirmação.
- adaptador Mercado Pago é testado com respostas simuladas, sem credenciais reais.

### Interface e aceite manual

- uma pessoa pode criar conta, fazer login e usar “Rotina Gabriel” como Workspace inicial;
- a área de cobrança apresenta Free, Pro por R$ 19,90/mês, status e histórico;
- o plano Free bloqueia o 16º item ativo com mensagem compreensível;
- um pagamento simulado aprovado libera 50 itens e recursos Pro;
- cancelamento mantém acesso até o fim do período;
- nenhum segredo, arquivo `.env` ou `node_modules` aparece em uma futura revisão de mudanças;
- o checkout real abre fora do Electron, em ambiente Mercado Pago, sem campo próprio de cartão.

## Fora de escopo nesta etapa

- colaboração em tempo real;
- convite por e-mail;
- anexos, Docs, chat, whiteboards e IA;
- marketplace de integrações;
- recorrência automática garantida por Pix ou boleto;
- produção sem conta de vendedor, credenciais e URL HTTPS pública configuradas;
- consulta jurídica ou registro de marca para “Daymint”.

## Referências

- [ClickUp — Hierarchy](https://help.clickup.com/hc/en-us/articles/13856392825367-Intro-to-the-Hierarchy)
- [ClickUp — Pricing](https://clickup.com/pricing)
- [Mercado Pago — Assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/overview)
- [Mercado Pago — Referência de Assinaturas](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/overview)
- [Mercado Pago — Meios de pagamento](https://www.mercadopago.com.br/developers/pt/docs/sales-processing/payment-methods)

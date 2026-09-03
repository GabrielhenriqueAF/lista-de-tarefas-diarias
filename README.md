# Rotina Gabriel

Aplicativo desktop em Electron para planejar a semana, registrar o horário real das atividades, guardar subtarefas, acompanhar a Trilha de estudos e sincronizar compromissos planejados com um calendário Google separado chamado **Rotina Gabriel**.

## Abrir no VS Code

Abra esta pasta no VS Code:

`F:\DESENVOLVIMENTO\aprendendo-programacao\lista-de-tarefas-diarias-local-task-foundation`

No terminal integrado, use:

```powershell
npm install
npm run rebuild
npm run start
```

## Como usar

1. Em **Minha semana**, cadastre uma Atividade (por exemplo, Inglês), uma Frente (Writing) e o horário recorrente.
2. Em **Hoje**, clique em **Começar** e depois em **Finalizar agora**. O app calcula as horas reais mesmo quando você termina antes do horário previsto.
3. Registre o avanço e o próximo passo ao finalizar. Eles ficam visíveis em **Histórico**.
4. Use **Progresso** para filtrar atividade, frente e período; os gráficos usam somente horas reais concluídas.
5. Em **Configurações**, alterne entre claro e escuro. A escolha fica salva no banco local.

## Dados e backup

O banco SQLite e os backups diários ficam em `%APPDATA%\lista-de-tarefas-diarias`. Eles não são enviados ao GitHub. Antes de substituir uma estrutura antiga, o app cria uma cópia de segurança.

## Google Agenda

A sincronização é manual, bidirecional e usa o calendário separado **Rotina Gabriel**. Cada evento recorrente recebe lembretes de 1 hora e 10 minutos. As instruções para a primeira autorização estão em [docs/google-oauth-setup.md](docs/google-oauth-setup.md).

## Testes

```powershell
npm test -- --run
```

## GitHub

A `main` é a base estável. Este trabalho fica na branch `feature/local-task-foundation` até Gabriel decidir subir as alterações. Bancos, cópias de segurança, credenciais e tokens permanecem privados e ignorados pelo Git.

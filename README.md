# Rotina Gabriel

Aplicativo desktop em Electron para planejar a semana, registrar o horário real das atividades, guardar subtarefas, acompanhar a Trilha de estudos e sincronizar compromissos planejados com um calendário Google separado chamado **Rotina Gabriel**.

## Abrir no VS Code

Abra esta pasta no VS Code:

`F:\DESENVOLVIMENTO\aprendendo-programacao\lista-de-tarefas-diarias`

No terminal integrado, use:

```powershell
npm install
npm run rebuild
npm run start
```

## Como usar

1. Em **Semana**, use **+ Novo bloco** para cadastrar uma Atividade (por exemplo, Inglês), uma Frente (Writing) e um horário recorrente. Você pode escolher dias da semana, definir um período ou criar uma tarefa de data única.
2. Em **Hoje**, clique em **Começar** e depois em **Finalizar agora**. O app calcula as horas reais mesmo quando você termina antes do horário previsto.
3. Registre o avanço e o próximo passo ao finalizar. Eles ficam visíveis em **Frentes**.
4. Use **Progresso** para filtrar atividade, frente e período; os gráficos usam somente horas reais concluídas.
5. Em **Ajustes**, alterne entre claro e escuro, sincronize com Google e arquive ou restaure atividades. A escolha fica salva no banco local.

## Dados e backup

O banco SQLite e os backups diários ficam em `%APPDATA%\lista-de-tarefas-diarias`. Eles não são enviados ao GitHub. Antes de substituir uma estrutura antiga, o app cria uma cópia de segurança. O token da Agenda Google é protegido pelo cofre do Windows.

## Google Agenda

A sincronização é manual, bidirecional e usa o calendário separado **Rotina Gabriel**. Cada evento recorrente recebe lembretes de 1 hora e 10 minutos. As instruções para a primeira autorização estão em [docs/google-oauth-setup.md](docs/google-oauth-setup.md).

## Testes

```powershell
npm test -- --run
```

## GitHub

A `main` é a base estável e contém a versão atual do aplicativo. Bancos, cópias de segurança, credenciais e tokens permanecem privados e ignorados pelo Git.

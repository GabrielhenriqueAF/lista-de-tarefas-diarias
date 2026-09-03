# Lista de Tarefas Diárias

Aplicativo desktop em Electron para planejar rotinas semanais, registrar o tempo real de cada sessão e manter o histórico das subtarefas.

## Executar localmente

1. Abra a pasta `F:\DESENVOLVIMENTO\aprendendo-programacao\lista-de-tarefas-diarias-local-task-foundation` no VS Code.
2. No terminal integrado, execute `npm install`.
3. Execute `npm run rebuild` para preparar o SQLite para o Electron.
4. Execute `npm run start`.

Na aba **Minha semana**, comece cadastrando uma tarefa e seu primeiro horário. Para colocar subtarefas em outros dias, escolha a tarefa já existente no mesmo formulário.

## Testar

```powershell
npm test -- --run
```

## Dados locais

O banco SQLite fica na pasta de dados do aplicativo do Windows. Ele não é enviado ao GitHub. Credenciais e tokens futuros da integração com Google Calendar também ficam fora do repositório.

## Fluxo com GitHub

A `main` permanece como versão estável. Cada alteração é desenvolvida em branch própria, enviada para uma Pull Request e só chega à `main` depois da revisão.

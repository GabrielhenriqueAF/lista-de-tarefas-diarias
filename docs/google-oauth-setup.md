# Conectar o Google Agenda

O Rotina Gabriel precisa de uma credencial OAuth do **seu** projeto Google Cloud para acessar o seu calendário. Esse arquivo é privado: não envie pelo GitHub e não cole seu conteúdo no chat.

## 1. Criar a credencial

1. Abra o [guia oficial do Google Calendar para Node.js](https://developers.google.com/workspace/calendar/api/quickstart/nodejs).
2. Crie ou selecione um projeto no Google Cloud.
3. Ative a **Google Calendar API**.
4. Em **Google Auth Platform**, configure a tela de consentimento. Para uma conta pessoal, escolha o público apropriado e adicione `gabriel.henrique536@gmail.com` como usuário de teste, se o console solicitar.
5. Em **Clients**, crie uma credencial OAuth 2.0 do tipo **Desktop app**.
6. Baixe o JSON da credencial e renomeie-o para `credentials.json`.

O Google documenta que aplicativos de desktop usam o navegador do sistema e um redirecionamento local para concluir a autorização. [Veja a referência oficial.](https://developers.google.com/identity/protocols/oauth2/native-app)

## 2. Colocar o arquivo no local privado do aplicativo

1. Pressione `Windows + R`.
2. Cole `%APPDATA%\lista-de-tarefas-diarias` e pressione Enter.
3. Copie `credentials.json` para essa pasta.
4. Confirme que o arquivo **não** está dentro da pasta do repositório Git.

O aplicativo cria `google-token.json` na mesma pasta somente depois da autorização. Esse token também é privado.

## 3. Autorizar e sincronizar

1. Feche e abra o aplicativo com `npm run start`.
2. Abra **Configurações**.
3. Clique em **Conectar ao Google**. O navegador abre a tela de consentimento; entre com `gabriel.henrique536@gmail.com` e permita o acesso ao calendário.
4. De volta ao aplicativo, clique em **Sincronizar com Google**.

Na primeira sincronização o app localiza ou cria o calendário **Rotina Gabriel**. As regras recorrentes são exportadas com lembretes de popup de 60 e 10 minutos.

## Conferência rápida

1. Crie uma regra de Writing, terça-feira, 05:00–08:00.
2. Sincronize e confirme o evento no calendário **Rotina Gabriel**.
3. Altere o evento para 06:00–09:00 no Google Agenda.
4. Clique em sincronizar novamente no app. Como a mudança remota é mais recente, o horário e o título retornam para o aplicativo.

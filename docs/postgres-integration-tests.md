# Testes de integração com PostgreSQL

## Antes de começar

Instale e inicie o [Docker Desktop para Windows](https://docs.docker.com/desktop/setup/install/windows-install/). Confirme os comandos:

```powershell
docker version
docker compose version
```

Execute os comandos deste guia na raiz do projeto, com as dependências npm da raiz e de `server` já instaladas.

## Preparar o banco descartável

```powershell
Copy-Item .env.integration.example .env.integration.local
```

Abra apenas `.env.integration.local` e substitua `replace-with-local-test-password` por uma senha exclusiva deste banco local descartável. Escreva o valor diretamente depois de `=`, sem aspas. Mantenha as quatro variáveis, sem duplicá-las; usuário `daymint_test`, banco `daymint_integration` e porta `55432` são fixos. O arquivo local é ignorado pelo Git; o exemplo versionado contém apenas um placeholder. Nunca informe dados de produção e nunca use a URL de produção neste teste.

## Executar a suíte real

```powershell
.\scripts\test-postgres.ps1
```

O comando usa [`docker compose up --wait`](https://docs.docker.com/reference/cli/docker/compose/up/) para iniciar `postgres:16-alpine` em `127.0.0.1:55432`, roda somente `server/tests/postgres`, e remove contêiner, rede e volume ao terminar — inclusive se um teste falhar. O projeto Compose `daymint-postgres-integration` é reservado a este banco descartável. Execute uma instância do script por vez.

O script valida o arquivo antes de chamar Docker, monta a URL sem mostrá-la e define `RUN_POSTGRES_INTEGRATION=1` apenas durante a execução. As variáveis anteriores do terminal são restauradas ao final. Se o Docker parar durante a execução, a limpeza pode falhar: o script avisa e termina com código diferente de zero.

Os testes recriam o schema `public` antes e depois de cada caso; todos os dados desse banco são apagados. Eles usam PostgreSQL real para verificar espera pelo advisory lock, rollback de migração e cadastro, além de `/ready`. Os arquivos rodam em série porque compartilham o banco.

Os comandos habituais continuam sem Docker:

```powershell
npm --prefix server test -- --run
npm test -- --run
```

Rodar `npm --prefix server run test:postgres` diretamente, sem a autorização e a URL local exatas, falha com uma mensagem de proteção antes de conectar. Use o script para iniciar, testar e limpar o banco.

## Diagnóstico seguro

Se o Docker não iniciar, abra o Docker Desktop e execute novamente `docker version`. Se a porta 55432 estiver ocupada, libere essa porta antes de repetir o script. Não altere `POSTGRES_PORT`: a proteção exige `127.0.0.1:55432` e o banco `daymint_integration`.

Se houver aviso de falha na limpeza, restaure o funcionamento do Docker Desktop e execute o script novamente; ele repetirá os testes e tentará remover os recursos no final. Um encerramento forçado do processo ou da máquina pode impedir o bloco de limpeza de executar.

Não copie logs que contenham a URL de conexão para issues públicas. Não execute comandos que imprimam a configuração interpolada do Compose, pois ela inclui a senha local.

param([string]$EnvironmentFile = '.env.integration.local')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# Native exit codes are checked explicitly so finally always runs on PowerShell 7.
$PSNativeCommandUseErrorActionPreference = $false
$repositoryPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$composeFile = Join-Path $repositoryPath 'compose.integration.yml'
$environmentPath = if ([IO.Path]::IsPathRooted($EnvironmentFile)) {
  $EnvironmentFile
} else { Join-Path $repositoryPath $EnvironmentFile }

if (-not (Test-Path -LiteralPath $environmentPath -PathType Leaf)) {
  throw 'Crie .env.integration.local a partir de .env.integration.example antes de executar este comando.'
}

function Read-IntegrationVariables([string]$Path) {
  $values = @{}
  $expectedKeys = @('POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB', 'POSTGRES_PORT')
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith('#')) { continue }
    if ($line -cnotmatch '^([A-Z_]+)=(.+)$') { throw 'Use somente as quatro linhas KEY=value do exemplo.' }
    $key = $Matches[1]
    $value = $Matches[2]
    if ($key -cnotin $expectedKeys -or $values.ContainsKey($key)) {
      throw 'O arquivo contém uma variável desconhecida ou repetida.'
    }
    $values[$key] = $value
  }
  foreach ($key in $expectedKeys) {
    if ([string]::IsNullOrWhiteSpace($values[$key])) { throw "A variável $key precisa de valor." }
  }
  if ($values.POSTGRES_PORT -cne '55432' -or $values.POSTGRES_DB -cne 'daymint_integration' -or
      $values.POSTGRES_USER -cne 'daymint_test') {
    throw 'Mantenha o usuário daymint_test, banco daymint_integration e porta 55432 do exemplo.'
  }
  if ($values.POSTGRES_PASSWORD -ceq 'replace-with-local-test-password') {
    throw 'Substitua a senha de exemplo por uma senha exclusiva deste banco descartável.'
  }
  return $values
}

$variables = Read-IntegrationVariables $environmentPath
$databaseUrl = 'postgres://{0}:{1}@127.0.0.1:55432/daymint_integration' -f
  [uri]::EscapeDataString($variables.POSTGRES_USER), [uri]::EscapeDataString($variables.POSTGRES_PASSWORD)
$environmentKeys = @('RUN_POSTGRES_INTEGRATION', 'DATABASE_URL', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB', 'POSTGRES_PORT')
$previousEnvironment = @{}
foreach ($key in $environmentKeys) {
  $previousEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
}
# A separate project scopes down --volumes to this disposable test database.
$composeArguments = @('compose', '--project-name', 'daymint-postgres-integration', '--env-file', $environmentPath, '-f', $composeFile)
$exitCode = 0
$cleanupNeeded = $false
try {
  # Process values override both inherited variables and dotenv interpolation.
  foreach ($key in $variables.Keys) { [Environment]::SetEnvironmentVariable($key, $variables[$key], 'Process') }
  $cleanupNeeded = $true
  & docker @composeArguments up --detach --wait db
  $exitCode = $LASTEXITCODE
  if ($exitCode -eq 0) {
    $env:RUN_POSTGRES_INTEGRATION = '1'
    $env:DATABASE_URL = $databaseUrl
    & npm --prefix (Join-Path $repositoryPath 'server') run test:postgres
    $exitCode = $LASTEXITCODE
  }
} catch {
  $exitCode = 1
  Write-Warning 'Não foi possível executar a suíte. Verifique Docker Desktop e as dependências locais.'
} finally {
  try {
    if ($cleanupNeeded) {
      & docker @composeArguments down --volumes --remove-orphans
      if ($LASTEXITCODE -ne 0) {
        if ($exitCode -eq 0) { $exitCode = $LASTEXITCODE }
        Write-Warning 'A limpeza falhou. Verifique Docker Desktop e execute este script novamente.'
      }
    }
  } catch {
    if ($exitCode -eq 0) { $exitCode = 1 }
    Write-Warning 'A limpeza falhou. Verifique Docker Desktop e execute este script novamente.'
  } finally {
    foreach ($key in $environmentKeys) {
      [Environment]::SetEnvironmentVariable($key, $previousEnvironment[$key], 'Process')
    }
  }
}
exit $exitCode

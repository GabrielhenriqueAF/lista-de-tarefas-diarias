# No Docker, npm, network access or real credentials: exercise the command boundary.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'test-postgres.ps1'
$temporaryDirectory = Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
[void][IO.Directory]::CreateDirectory($temporaryDirectory)
$shellPath = (Get-Process -Id $PID).Path
$fixture = "POSTGRES_USER=daymint_test`nPOSTGRES_PASSWORD=fixture-only:@#`$`nPOSTGRES_DB=daymint_integration`nPOSTGRES_PORT=55432"
$harness = @'
function global:docker {
  if ($args -contains 'up') {
    Write-Output 'DOCKER:UP'
    $global:LASTEXITCODE = [int]$env:TEST_UP_EXIT
  } elseif ($args -contains 'down') {
    Write-Output 'DOCKER:DOWN'
    $global:LASTEXITCODE = [int]$env:TEST_DOWN_EXIT
  } else { throw 'Unexpected Docker command.' }
}
function global:npm {
  $url = [uri]$env:DATABASE_URL
  if ($url.Host -ne '127.0.0.1' -or $url.Port -ne 55432 -or
      $env:RUN_POSTGRES_INTEGRATION -ne '1' -or
      [uri]::UnescapeDataString($url.UserInfo.Split(':')[1]) -ne 'fixture-only:@#$' -or
      $env:POSTGRES_DB -ne 'daymint_integration') { throw 'Invalid test environment.' }
  Write-Output 'NPM:TEST'
  $global:LASTEXITCODE = [int]$env:TEST_NPM_EXIT
}
$env:DATABASE_URL = 'original-value'
$env:RUN_POSTGRES_INTEGRATION = 'original-flag'
$env:POSTGRES_DB = 'original-database'
try { & $env:TEST_SCRIPT -EnvironmentFile $env:TEST_FILE }
finally {
  if ($env:DATABASE_URL -eq 'original-value' -and
      $env:RUN_POSTGRES_INTEGRATION -eq 'original-flag' -and
      $env:POSTGRES_DB -eq 'original-database') { Write-Output 'ENV:RESTORED' }
}
exit $LASTEXITCODE
'@
$encodedHarness = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($harness))

function Assert-Scenario {
  param([string]$Name, [AllowNull()][string]$Contents, [int]$Up = 0,
    [int]$Npm = 0, [int]$Down = 0, [int]$ExpectedExit = 0,
    [string[]]$ExpectedMarkers = @())
  $file = Join-Path $temporaryDirectory "$Name.fixture"
  if ($null -ne $Contents -and $Contents -ne '') { [IO.File]::WriteAllText($file, $Contents) }
  $start = [Diagnostics.ProcessStartInfo]::new($shellPath)
  $start.UseShellExecute = $false
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  foreach ($argument in '-NoProfile', '-EncodedCommand', $encodedHarness) { $start.ArgumentList.Add($argument) }
  $start.Environment['TEST_SCRIPT'] = $scriptPath
  $start.Environment['TEST_FILE'] = $file
  $start.Environment['TEST_UP_EXIT'] = [string]$Up
  $start.Environment['TEST_NPM_EXIT'] = [string]$Npm
  $start.Environment['TEST_DOWN_EXIT'] = [string]$Down
  $process = [Diagnostics.Process]::Start($start)
  $output = $process.StandardOutput.ReadToEnd()
  $null = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  $markers = @($output -split '\r?\n' | Where-Object { $_ -match '^(DOCKER:|NPM:|ENV:)' })
  if ($process.ExitCode -ne $ExpectedExit -or ($markers -join ',') -ne ($ExpectedMarkers -join ',')) {
    throw "Scenario $Name failed: exit=$($process.ExitCode), markers=$($markers -join ',')."
  }
  Write-Output "PASS $Name"
}

try {
  Assert-Scenario -Name 'missing-file' -Contents $null -ExpectedExit 1 -ExpectedMarkers 'ENV:RESTORED'
  Assert-Scenario -Name 'missing-key' -Contents ($fixture -replace 'POSTGRES_PORT=55432', '') -ExpectedExit 1 -ExpectedMarkers 'ENV:RESTORED'
  Assert-Scenario -Name 'unexpected-key' -Contents "$fixture`nDATABASE_URL=forbidden" -ExpectedExit 1 -ExpectedMarkers 'ENV:RESTORED'
  Assert-Scenario -Name 'duplicate-key' -Contents "$fixture`nPOSTGRES_PORT=55432" -ExpectedExit 1 -ExpectedMarkers 'ENV:RESTORED'
  Assert-Scenario -Name 'wrong-port' -Contents ($fixture -replace '55432', '5432') -ExpectedExit 1 -ExpectedMarkers 'ENV:RESTORED'
  Assert-Scenario -Name 'wrong-database' -Contents ($fixture -replace 'daymint_integration', 'development') -ExpectedExit 1 -ExpectedMarkers 'ENV:RESTORED'
  Assert-Scenario -Name 'unchanged-placeholder' -Contents ($fixture -replace 'fixture-only:.*', 'replace-with-local-test-password') -ExpectedExit 1 -ExpectedMarkers 'ENV:RESTORED'
  Assert-Scenario -Name 'success' -Contents $fixture -ExpectedMarkers 'DOCKER:UP', 'NPM:TEST', 'DOCKER:DOWN', 'ENV:RESTORED'
  Assert-Scenario -Name 'test-failure' -Contents $fixture -Npm 7 -ExpectedExit 7 -ExpectedMarkers 'DOCKER:UP', 'NPM:TEST', 'DOCKER:DOWN', 'ENV:RESTORED'
  Assert-Scenario -Name 'startup-failure' -Contents $fixture -Up 9 -ExpectedExit 9 -ExpectedMarkers 'DOCKER:UP', 'DOCKER:DOWN', 'ENV:RESTORED'
  Assert-Scenario -Name 'cleanup-failure' -Contents $fixture -Down 8 -ExpectedExit 8 -ExpectedMarkers 'DOCKER:UP', 'NPM:TEST', 'DOCKER:DOWN', 'ENV:RESTORED'
  Assert-Scenario -Name 'preserve-test-failure' -Contents $fixture -Npm 7 -Down 8 -ExpectedExit 7 -ExpectedMarkers 'DOCKER:UP', 'NPM:TEST', 'DOCKER:DOWN', 'ENV:RESTORED'
} finally {
  # Exact test-created GUID directory; no repository or user data is removed.
  [IO.Directory]::Delete($temporaryDirectory, $true)
}

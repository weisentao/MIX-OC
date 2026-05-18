[CmdletBinding()]
param(
  [ValidateSet("check", "start", "start-and-check")]
  [string]$Action = "start-and-check",

  [int]$MySqlPort = 3306,

  [int]$BackendPort = 13001,

  [int]$FrontendPort = 15173,

  [string]$BackendHost = "127.0.0.1",

  [string]$FrontendHost = "127.0.0.1",

  [int]$WaitSeconds = 45
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendRoot = Split-Path -Parent $ScriptRoot
$RepoRoot = Split-Path -Parent $BackendRoot
$WorkspaceRoot = Split-Path -Parent $RepoRoot
$FrontendRoot = Join-Path $RepoRoot "frontend-source"
$RuntimeDir = Join-Path $BackendRoot "data\runtime"
$PortableMySqlScript = Join-Path $ScriptRoot "portable-mysql.ps1"
$BackendStartScript = Join-Path $ScriptRoot "start-production.mjs"
$ProxyAcceptanceScript = Join-Path $ScriptRoot "smoke-local-proxy-acceptance.mjs"
$VerifyProductionScript = Join-Path $ScriptRoot "verify-production-ready.mjs"
$ViteCliScript = Join-Path $FrontendRoot "node_modules\vite\bin\vite.js"
$PreferredNodeExe = @(
  $env:XJG_NODE_EXE
  (Join-Path $WorkspaceRoot ".runtime\node\node-v24.15.0-win-x64\node.exe")
) | Where-Object { $_ }

function Resolve-Executable {
  param(
    [string[]]$PreferredPaths,
    [string[]]$CommandNames
  )

  foreach ($path in $PreferredPaths) {
    if ($path -and (Test-Path -LiteralPath $path)) {
      return [pscustomobject]@{ Source = (Resolve-Path -LiteralPath $path).Path }
    }
  }

  foreach ($name in $CommandNames) {
    $command = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) {
      return [pscustomobject]@{ Source = $command.Source }
    }
  }

  return $null
}

$NodeCommand = Resolve-Executable -PreferredPaths $PreferredNodeExe -CommandNames @("node")

function Write-Step {
  param(
    [string]$Status,
    [string]$Message
  )

  $prefix = switch ($Status) {
    "PASS" { "[PASS]" }
    "WARN" { "[WARN]" }
    "FAIL" { "[FAIL]" }
    default { "[INFO]" }
  }

  Write-Host "$prefix $Message"
}

function Get-ListeningConnection {
  param([int]$Port)

  return Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Sort-Object LocalAddress |
    Select-Object -First 1
}

function Get-PortSummary {
  param(
    [int]$Port,
    [string]$Name
  )

  $listener = Get-ListeningConnection -Port $Port
  if (-not $listener) {
    return [pscustomobject]@{
      name = $Name
      port = $Port
      listening = $false
      address = ""
      pid = $null
      processName = ""
      path = ""
    }
  }

  $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
  return [pscustomobject]@{
    name = $Name
    port = $Port
    listening = $true
    address = $listener.LocalAddress
    pid = $listener.OwningProcess
    processName = if ($process) { $process.ProcessName } else { "" }
    path = if ($process) { $process.Path } else { "" }
  }
}

function Assert-Tooling {
  if (-not (Test-Path -LiteralPath $PortableMySqlScript)) {
    throw "portable-mysql script not found: $PortableMySqlScript"
  }

  if (-not (Test-Path -LiteralPath $BackendStartScript)) {
    throw "backend start script not found: $BackendStartScript"
  }

  if (-not (Test-Path -LiteralPath $ProxyAcceptanceScript)) {
    throw "proxy acceptance script not found: $ProxyAcceptanceScript"
  }

  if (-not (Test-Path -LiteralPath $VerifyProductionScript)) {
    throw "verify-production script not found: $VerifyProductionScript"
  }

  if (-not (Test-Path -LiteralPath $FrontendRoot)) {
    throw "frontend root not found: $FrontendRoot"
  }

  if (-not $NodeCommand) {
    throw "node command not found in PATH"
  }

  if (-not (Test-Path -LiteralPath $ViteCliScript)) {
    throw "vite cli script not found: $ViteCliScript"
  }
}

function Start-PortableMySqlIfNeeded {
  $status = Get-PortSummary -Port $MySqlPort -Name "mysql"
  if ($status.listening) {
    Write-Step PASS "MySQL port $MySqlPort already listening (PID $($status.pid), $($status.processName))."
    return $status
  }

  Write-Step INFO "Starting portable MySQL on port $MySqlPort."
  & powershell.exe -ExecutionPolicy Bypass -File $PortableMySqlScript -Action start
  return Wait-ForPort -Port $MySqlPort -Name "mysql" -TimeoutSeconds $WaitSeconds
}

function Wait-ForPort {
  param(
    [int]$Port,
    [string]$Name,
    [int]$TimeoutSeconds
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $summary = Get-PortSummary -Port $Port -Name $Name
    if ($summary.listening) {
      Write-Step PASS "$Name port $Port is listening (PID $($summary.pid), $($summary.processName))."
      return $summary
    }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)

  throw "$Name port $Port did not enter LISTEN state within $TimeoutSeconds seconds."
}

function Start-BackendIfNeeded {
  $status = Get-PortSummary -Port $BackendPort -Name "backend"
  if ($status.listening) {
    Write-Step PASS "Backend port $BackendPort already listening (PID $($status.pid), $($status.processName))."
    return $status
  }

  New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $stdoutLog = Join-Path $RuntimeDir "server-$BackendPort-$timestamp.out.log"
  $stderrLog = Join-Path $RuntimeDir "server-$BackendPort-$timestamp.err.log"

  Write-Step INFO "Starting backend on port $BackendPort."
  Start-Process -FilePath $NodeCommand.Source `
    -WorkingDirectory $BackendRoot `
    -WindowStyle Hidden `
    -ArgumentList $BackendStartScript `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog | Out-Null

  $ready = Wait-ForPort -Port $BackendPort -Name "backend" -TimeoutSeconds $WaitSeconds
  Write-Step INFO "Backend logs: $stdoutLog ; $stderrLog"
  return $ready
}

function Start-FrontendIfNeeded {
  $status = Get-PortSummary -Port $FrontendPort -Name "frontend"
  if ($status.listening) {
    Write-Step PASS "Frontend port $FrontendPort already listening (PID $($status.pid), $($status.processName))."
    return $status
  }

  New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $stdoutLog = Join-Path $RuntimeDir "vite-$FrontendPort-$timestamp.out.log"
  $stderrLog = Join-Path $RuntimeDir "vite-$FrontendPort-$timestamp.err.log"

  Write-Step INFO "Starting frontend dev server on port $FrontendPort."
  Start-Process -FilePath $NodeCommand.Source `
    -WorkingDirectory $FrontendRoot `
    -WindowStyle Hidden `
    -ArgumentList $ViteCliScript,"--host",$FrontendHost,"--port",$FrontendPort `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog | Out-Null

  $ready = Wait-ForPort -Port $FrontendPort -Name "frontend" -TimeoutSeconds $WaitSeconds
  Write-Step INFO "Frontend logs: $stdoutLog ; $stderrLog"
  return $ready
}

function Invoke-JsonRequest {
  param([string]$Url)

  $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 15
  $bodyText = [string]$response.Content
  $json = $null
  if ($bodyText) {
    try {
      $json = $bodyText | ConvertFrom-Json
    } catch {
      $json = $null
    }
  }

  return [pscustomobject]@{
    status = [int]$response.StatusCode
    raw = $bodyText
    json = $json
  }
}

function Invoke-NodeCheck {
  param(
    [string]$ScriptPath,
    [hashtable]$Environment,
    [string]$Label
  )

  Write-Step INFO "Running $Label."
  $originalValues = @{}
  foreach ($key in $Environment.Keys) {
    $originalValues[$key] = [Environment]::GetEnvironmentVariable($key, "Process")
    [Environment]::SetEnvironmentVariable($key, [string]$Environment[$key], "Process")
  }

  try {
    & $NodeCommand.Source $ScriptPath
    if ($LASTEXITCODE -ne 0) {
      throw "$Label failed with exit code $LASTEXITCODE."
    }
  } finally {
    foreach ($key in $Environment.Keys) {
      [Environment]::SetEnvironmentVariable($key, $originalValues[$key], "Process")
    }
  }

  Write-Step PASS "$Label passed."
}

function Assert-HealthEndpoints {
  $backendHealthUrl = "http://$BackendHost`:$BackendPort/health"
  $backendApiHealthUrl = "http://$BackendHost`:$BackendPort/api/health"
  $frontendApiHealthUrl = "http://$FrontendHost`:$FrontendPort/api/health"
  $frontendRootUrl = "http://$FrontendHost`:$FrontendPort/"

  $backendHealth = Invoke-JsonRequest -Url $backendHealthUrl
  if (
    $backendHealth.status -ne 200 -or
    -not $backendHealth.json.ok -or
    -not $backendHealth.json.ready -or
    -not $backendHealth.json.checks.mysql.ready
  ) {
    throw "Backend /health failed: $($backendHealth.raw)"
  }
  Write-Step PASS "Backend health OK: $backendHealthUrl"

  $backendApiHealth = Invoke-JsonRequest -Url $backendApiHealthUrl
  if (
    $backendApiHealth.status -ne 200 -or
    -not $backendApiHealth.json.ok -or
    -not $backendApiHealth.json.ready -or
    -not $backendApiHealth.json.checks.mysql.ready
  ) {
    throw "Backend /api/health failed: $($backendApiHealth.raw)"
  }
  Write-Step PASS "Backend API health OK: $backendApiHealthUrl"

  $frontendApiHealth = Invoke-JsonRequest -Url $frontendApiHealthUrl
  if ($frontendApiHealth.status -ne 200 -or -not $frontendApiHealth.json.ok) {
    throw "Frontend proxy /api/health failed: $($frontendApiHealth.raw)"
  }

  if (-not $frontendApiHealth.json.ready) {
    throw "Frontend proxy /api/health returned ready=false: $($frontendApiHealth.raw)"
  }

  if (-not $frontendApiHealth.json.checks.mysql.ready) {
    throw "Frontend proxy /api/health returned mysql.ready=false: $($frontendApiHealth.raw)"
  }

  Write-Step PASS "Frontend proxy health OK: $frontendApiHealthUrl"

  $frontendRoot = Invoke-WebRequest -UseBasicParsing -Uri $frontendRootUrl -TimeoutSec 15
  if ([int]$frontendRoot.StatusCode -ne 200) {
    throw "Frontend root failed: status=$($frontendRoot.StatusCode)"
  }
  Write-Step PASS "Frontend root OK: $frontendRootUrl"
}

function Assert-RealBusinessAcceptance {
  $proxyEnv = @{
    SMOKE_BASE_URL = "http://$FrontendHost`:$FrontendPort"
    SMOKE_API_PREFIX = "/api"
    FRONTEND_HOST = $FrontendHost
    FRONTEND_PORT = "$FrontendPort"
  }
  Invoke-NodeCheck -ScriptPath $ProxyAcceptanceScript -Environment $proxyEnv -Label "frontend proxy business smoke"

  $productionEnv = @{
    SMOKE_BASE_URL = "http://$BackendHost`:$BackendPort"
  }
  Invoke-NodeCheck -ScriptPath $VerifyProductionScript -Environment $productionEnv -Label "backend production-ready gate"
}

function Show-PortTable {
  $rows = @(
    Get-PortSummary -Port $MySqlPort -Name "mysql"
    Get-PortSummary -Port $BackendPort -Name "backend"
    Get-PortSummary -Port $FrontendPort -Name "frontend"
  )

  $rows | Select-Object name,port,listening,address,pid,processName | Format-Table -AutoSize
}

function Main {
  Assert-Tooling
  Write-Step INFO "Target ports: MySQL=$MySqlPort, backend=$BackendPort, frontend=$FrontendPort."

  switch ($Action) {
    "start" {
      Start-PortableMySqlIfNeeded | Out-Null
      Start-BackendIfNeeded | Out-Null
      Start-FrontendIfNeeded | Out-Null
      Show-PortTable
      return
    }
    "check" {
      Wait-ForPort -Port $MySqlPort -Name "mysql" -TimeoutSeconds 1 | Out-Null
      Wait-ForPort -Port $BackendPort -Name "backend" -TimeoutSeconds 1 | Out-Null
      Wait-ForPort -Port $FrontendPort -Name "frontend" -TimeoutSeconds 1 | Out-Null
      Assert-HealthEndpoints
      Assert-RealBusinessAcceptance
      Show-PortTable
      return
    }
    "start-and-check" {
      Start-PortableMySqlIfNeeded | Out-Null
      Start-BackendIfNeeded | Out-Null
      Start-FrontendIfNeeded | Out-Null
      Assert-HealthEndpoints
      Assert-RealBusinessAcceptance
      Show-PortTable
      return
    }
  }
}

Main

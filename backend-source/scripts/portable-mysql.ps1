param(
  [ValidateSet("status", "init", "start", "stop")]
  [string]$Action = "status"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$RuntimeDir = if ($env:XJG_RUNTIME_DIR) { $env:XJG_RUNTIME_DIR } else { Join-Path $ProjectRoot ".runtime" }
$MySqlHome = if ($env:XJG_MYSQL_HOME) {
  $env:XJG_MYSQL_HOME
} else {
  Join-Path $RuntimeDir "mysql\mysql-8.4.9-winx64"
}
$DataDir = Join-Path $RuntimeDir "mysql-data"
$ConfigFile = Join-Path $RuntimeDir "mysql-xjg.ini"
$Port = 3306
$RootPassword = $env:MYSQL_ROOT_PASSWORD
$PidFile = Join-Path $RuntimeDir "mysql-xjg.pid"
$LogFile = Join-Path $RuntimeDir "logs\mysql-xjg.err"
$Mysqld = Join-Path $MySqlHome "bin\mysqld.exe"
$MysqlAdmin = Join-Path $MySqlHome "bin\mysqladmin.exe"

function Assert-PortableMySql {
  if (-not (Test-Path $Mysqld)) {
    throw "mysqld.exe not found at $Mysqld"
  }
}

function Show-Status {
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  [pscustomobject]@{
    mysqlHome = $MySqlHome
    dataDir = $DataDir
    port = $Port
    listening = [bool]$listener
    owningProcess = if ($listener) { $listener.OwningProcess } else { $null }
    configFile = $ConfigFile
    pidFile = $PidFile
    logFile = $LogFile
  } | Format-List
}

Assert-PortableMySql

switch ($Action) {
  "status" {
    Show-Status
  }
  "init" {
    if (Test-Path (Join-Path $DataDir "mysql")) {
      Write-Host "Data directory already initialized: $DataDir"
      break
    }
    New-Item -ItemType Directory -Force $DataDir | Out-Null
    & $Mysqld --defaults-file="$ConfigFile" --initialize-insecure --console
    Write-Host "Initialized portable MySQL data directory: $DataDir"
    Write-Host "Set a root password before production use. This script never clears business data."
  }
  "start" {
    New-Item -ItemType Directory -Force $DataDir | Out-Null
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($listener) {
      Write-Host "Port $Port is already listening by process $($listener.OwningProcess)."
      break
    }
    Start-Process -FilePath $Mysqld -WindowStyle Hidden -ArgumentList @("--defaults-file=$ConfigFile", "--console")
    Write-Host "Started portable MySQL on 127.0.0.1:$Port"
  }
  "stop" {
    if (-not $RootPassword) {
      Write-Host "MYSQL_ROOT_PASSWORD is not set; falling back to process stop only if pid file exists."
      if (Test-Path $PidFile) {
        $pidValue = Get-Content $PidFile -ErrorAction Stop | Select-Object -First 1
        Stop-Process -Id ([int]$pidValue) -ErrorAction Stop
        Write-Host "Stopped portable MySQL process $pidValue."
      } else {
        Write-Host "No pid file found at $PidFile."
      }
      break
    }
    & $MysqlAdmin --host=127.0.0.1 --port=$Port --user=root --password=$RootPassword shutdown
    Write-Host "Stopped portable MySQL via mysqladmin."
  }
}

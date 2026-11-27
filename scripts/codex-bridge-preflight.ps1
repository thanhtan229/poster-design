# [TINIX] Read-only, no-secrets Codex bridge capability probe for Windows.
# This probe only executes --version/--help commands. It never starts an agent,
# daemon, session, task, web listener, or service and never reads credentials.
# Run explicitly from an isolated QA checkout, not as a Scheduled Task.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-Executable([string]$Name) {
  $command = Get-Command -Name $Name -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $command) { return $null }
  return $command.Source
}

function Probe-Version([string]$Executable) {
  if (-not $Executable) { return $null }
  try {
    $lines = @(& $Executable --version 2>&1)
    if ($LASTEXITCODE -ne 0) { return $null }
    return ([string]($lines | Select-Object -First 1)).Trim().Substring(0, [Math]::Min(120, ([string]($lines | Select-Object -First 1)).Trim().Length))
  } catch { return $null }
}

function Probe-CodexHelp([string]$Executable, [string]$Subcommand) {
  if (-not $Executable) { return 'missing_cli' }
  try {
    # A literal --help only: never invoke queue, exec, app-server or remote-control without --help.
    $output = @(& $Executable $Subcommand --help 2>&1 | Out-String)
    if ($LASTEXITCODE -eq 0) { return 'available' }
    return 'not_available'
  } catch { return 'not_available' }
}

$codex = Resolve-Executable 'codex'
$node = Resolve-Executable 'node'
$git = Resolve-Executable 'git'
$gh = Resolve-Executable 'gh'

$processes = @(Get-Process -Name 'Codex' -ErrorAction SilentlyContinue)
$report = [ordered]@{
  schema_version = 1
  intent = 'read_only_capability_discovery'
  timestamp_utc = [DateTime]::UtcNow.ToString('o')
  os = [Environment]::OSVersion.VersionString
  powershell_major = $PSVersionTable.PSVersion.Major
  codex_cli_present = ($null -ne $codex)
  codex_cli_version = Probe-Version $codex
  codex_desktop_process_count = $processes.Count
  codex_cli_capabilities = [ordered]@{
    exec = Probe-CodexHelp $codex 'exec'
    queue = Probe-CodexHelp $codex 'queue'
    remote_control = Probe-CodexHelp $codex 'remote-control'
    app_server = Probe-CodexHelp $codex 'app-server'
  }
  node_present = ($null -ne $node)
  node_version = Probe-Version $node
  git_present = ($null -ne $git)
  git_version = Probe-Version $git
  gh_present = ($null -ne $gh)
  gh_version = Probe-Version $gh
  credentials_read = $false
  sessions_started_or_resumed = $false
  system_changes = $false
}
[pscustomobject]$report | ConvertTo-Json -Depth 6

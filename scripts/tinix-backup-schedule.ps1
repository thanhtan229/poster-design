# [TINIX] Create (or remove) a daily Windows Scheduled Task that runs the TinixPoster backup (scripts\tinix-backup.mjs).
#
#   npm run tinix:backup-schedule                       daily at 02:30, keep 10 backups
#   npm run tinix:backup-schedule -- -Time 03:00 -Keep 14
#   npm run tinix:backup-schedule -- -CopyTo "E:\SaoLuu\TinixPoster"   also copy each backup to another drive/folder
#   npm run tinix:backup-schedule -- -DryRun            print what would be created, change nothing
#   npm run tinix:backup-schedule -- -Remove            delete the task
#
# The task runs as the current user (no password, no admin) only while you are logged on. "Run as soon as possible after a
# missed start" is on, so a backup missed because the PC was off runs at the next logon. Output goes to backups\schedule.log.
# ASCII only on purpose: Windows PowerShell 5 reads BOM-less files as ANSI and would garble accents.
param(
  [string]$Time = '02:30',
  [int]$Keep = 10,
  [string]$CopyTo = '',
  [switch]$Remove,
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$taskName = 'TinixPoster Backup'
$root = Split-Path -Parent $PSScriptRoot

if ($Remove) {
  if ($DryRun) { Write-Output "[dry run] would remove task '$taskName'"; exit 0 }
  if (-not (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue)) { Write-Output "Task '$taskName' does not exist."; exit 0 }
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Output "Removed task '$taskName'."
  exit 0
}

try { [void][datetime]::ParseExact($Time, 'HH:mm', [Globalization.CultureInfo]::InvariantCulture) } catch { throw "-Time must look like 02:30 (24h HH:mm), got '$Time'" }
if ($Keep -lt 1) { throw '-Keep must be at least 1' }
$script = Join-Path $PSScriptRoot 'tinix-backup.mjs'
if (-not (Test-Path $script)) { throw "Not found: $script" }
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) { throw 'node not found in PATH. Install Node.js first.' }
$node = $nodeCmd.Source

$log = Join-Path $root 'backups\schedule.log'
$copyArg = ''
if ($CopyTo) { $copyArg = ' --copy-to "' + $CopyTo + '"' }
# cmd /c "<node> <script> --keep N [--copy-to X] >> <log> 2>&1"  (the outer quotes are required by cmd)
$inner = '"{0}" "{1}" --keep {2}{3} >> "{4}" 2>&1' -f $node, $script, $Keep, $copyArg, $log
$cmdArgs = '/c "' + $inner + '"'

$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $cmdArgs -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited

Write-Output "Task      : $taskName"
Write-Output "Runs      : daily at $Time (local time), as $($principal.UserId), only while logged on; catches up after a missed start"
Write-Output "Command   : cmd.exe $cmdArgs"
Write-Output "Work dir  : $root"
Write-Output "Keep      : $Keep backups$(if ($CopyTo) { ", plus a copy in $CopyTo" })"
Write-Output "Log       : $log"
if ($DryRun) { Write-Output '[dry run] nothing was registered.'; exit 0 }

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'TinixPoster: daily backup of database and static files (npm run tinix:backup)' -Force | Out-Null
Write-Output "Registered. Test it now with:  Start-ScheduledTask -TaskName '$taskName'   (then read backups\schedule.log)"
Write-Output "Remove it with:  npm run tinix:backup-schedule -- -Remove"

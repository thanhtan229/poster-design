# [TINIX] Create a "TinixPoster" shortcut on the Desktop that runs Mo-TinixPoster.cmd.
# Run: npm run tinix:shortcut   (or: powershell -ExecutionPolicy Bypass -File scripts\tinix-shortcut.ps1)
# ASCII only on purpose: Windows PowerShell 5 reads BOM-less files as ANSI and would garble accents.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root 'Mo-TinixPoster.cmd'
if (-not (Test-Path $target)) { throw "Not found: $target" }

$desktop = [Environment]::GetFolderPath('Desktop')
$link = Join-Path $desktop 'TinixPoster.lnk'

$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($link)
$sc.TargetPath = $target
$sc.WorkingDirectory = $root
$sc.WindowStyle = 1
$sc.Description = 'Open TinixPoster (editor + AI assistant)'
# System icon; replace with your own .ico if you like
$sc.IconLocation = "$env:SystemRoot\System32\imageres.dll,109"
$sc.Save()

Write-Output "Shortcut created: $link"
Write-Output "Target: $target"

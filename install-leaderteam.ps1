# LeaderTeam / Open LeaderTeam Unified One-Line Windows Downloader and Installer
# Usage (Windows PowerShell 5.1 and PowerShell 7):
#   irm https://raw.githubusercontent.com/youzi-ovo-create/leaderteam/main/install-leaderteam.ps1 | iex
# Supports LT (closed-free) and OLT (open-source), auto-detects Windows x64 and DSH, and launches the graphical downloader.

& {
  $ErrorActionPreference = "Stop"
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072
  } catch {}

  $scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { "" }
  $installerJs = $null

  if ($scriptDir) {
    foreach ($cand in @(
      (Join-Path $scriptDir "installer\lt-installer-standalone.mjs"),
      (Join-Path $scriptDir "lt-installer-standalone.mjs"),
      (Join-Path $scriptDir "bin\lt-installer.mjs")
    )) {
      if (Test-Path -LiteralPath $cand) {
        $installerJs = $cand
        break
      }
    }
  }

  if (-not $installerJs) {
    $cacheDir = Join-Path $env:TEMP "leaderteam-downloader"
    New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
    $installerJs = Join-Path $cacheDir "lt-installer-standalone.mjs"
    $tmpJs = Join-Path $cacheDir ("lt-installer-standalone." + $PID + ".tmp.mjs")
    $urls = @(
      "https://raw.githubusercontent.com/youzi-ovo-create/leaderteam/main/installer/lt-installer-standalone.mjs",
      "https://github.com/youzi-ovo-create/leaderteam/releases/latest/download/lt-installer-standalone.mjs",
      "https://raw.githubusercontent.com/youzi-ovo-create/dsh-leaderteam-releases/main/installer/lt-installer-standalone.mjs"
    )
    $downloaded = $false
    foreach ($u in $urls) {
      try {
        Write-Host "[LeaderTeam] 正在下载统一安装器 ($u)..."
        if (Test-Path -LiteralPath $tmpJs) { Remove-Item -LiteralPath $tmpJs -Force -ErrorAction SilentlyContinue }
        Invoke-WebRequest -Uri $u -OutFile $tmpJs -UseBasicParsing -TimeoutSec 30
        if ((Test-Path -LiteralPath $tmpJs) -and ((Get-Item -LiteralPath $tmpJs).Length -gt 4096)) {
          Move-Item -LiteralPath $tmpJs -Destination $installerJs -Force
          $downloaded = $true
          break
        }
      } catch {
        Write-Host "[LeaderTeam] 尝试备用地址..."
      } finally {
        if (Test-Path -LiteralPath $tmpJs) { Remove-Item -LiteralPath $tmpJs -Force -ErrorAction SilentlyContinue }
      }
    }
    if (-not $downloaded) {
      Write-Host "[LeaderTeam] 无法在线下载安装器，请检查网络或前往 https://github.com/youzi-ovo-create/leaderteam/releases 手动下载。" -ForegroundColor Red
      return
    }
  }

  function Find-OfficialDshExe {
    foreach ($envDir in @($env:DSH_DESKTOP_DIR, $env:DSH_APP_DIR, $env:LT_DSH_APP)) {
      if ($envDir) {
        $exe = Join-Path $envDir "DeepSeek Harness.exe"
        if (Test-Path -LiteralPath $exe) { return $exe }
      }
    }
    foreach ($fixed in @(
      (Join-Path $env:LOCALAPPDATA "Programs\DeepSeek Harness\DeepSeek Harness.exe"),
      (Join-Path $env:LOCALAPPDATA "Programs\DeepSeek-Harness\DeepSeek Harness.exe"),
      (Join-Path $env:ProgramFiles "DeepSeek Harness\DeepSeek Harness.exe"),
      (Join-Path $env:ProgramFiles "DeepSeek-Harness\DeepSeek Harness.exe")
    )) {
      if ($fixed -and (Test-Path -LiteralPath $fixed)) { return $fixed }
    }
    foreach ($letter in [char[]]([int][char]'C'..[int][char]'Z')) {
      $root = "${letter}:\"
      if (-not (Test-Path -LiteralPath $root)) { continue }
      foreach ($sub in @(
        "Apps\DeepSeek-Harness\DeepSeek Harness.exe",
        "Apps\DeepSeek Harness\DeepSeek Harness.exe",
        "Program Files\DeepSeek Harness\DeepSeek Harness.exe",
        "DeepSeek-Harness\DeepSeek Harness.exe",
        "DeepSeek Harness\DeepSeek Harness.exe"
      )) {
        $cand = Join-Path $root $sub
        if (Test-Path -LiteralPath $cand) { return $cand }
      }
    }
    try {
      $running = Get-Process -Name "DeepSeek Harness" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path -First 1
      if ($running -and (Test-Path -LiteralPath $running)) { return $running }
    } catch {}
    try {
      $roots = @(
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
      )
      foreach ($it in (Get-ItemProperty -Path $roots -ErrorAction SilentlyContinue)) {
        if (($it.DisplayName -match 'DeepSeek[-\s]*Harness') -or ($it.InstallLocation -match 'DeepSeek[-\s]*Harness')) {
          foreach ($raw in @($it.InstallLocation, $it.DisplayIcon, $it.UninstallString)) {
            if (-not $raw) { continue }
            $c = ($raw -replace ',\s*-?\d+\s*$', '').Trim('" ')
            if ($c -match '\.exe') { $c = Split-Path -Parent ($c -replace '\.exe.*$', '.exe') }
            $exe = Join-Path $c "DeepSeek Harness.exe"
            if (Test-Path -LiteralPath $exe) { return $exe }
          }
        }
      }
    } catch {}
    return $null
  }

  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  if ($nodeCmd) {
    & $nodeCmd.Source $installerJs @args
    return
  }

  $dshExe = Find-OfficialDshExe
  if ($dshExe) {
    $env:DSH_DESKTOP_DIR = Split-Path -Parent $dshExe
    $env:ELECTRON_RUN_AS_NODE = "1"
    & $dshExe $installerJs @args
    return
  }

  Write-Host ""
  Write-Host "[LeaderTeam] 未检测到 DeepSeek Harness 客户端或 Node.js (>= 22.15)。" -ForegroundColor Yellow
  Write-Host "请先下载安装官方 DeepSeek Harness 桌面版（自带运行时，无需单独装 Node.js）："
  Write-Host "  官方下载地址：https://deepseekdsh.com" -ForegroundColor Cyan
  Write-Host "安装完成后，再次运行同一条命令即可一键启动 LeaderTeam 图形化安装器。"
  try { Start-Process "https://deepseekdsh.com" } catch {}
} @args

@echo off
setlocal EnableExtensions
title LeaderTeam One-Click Graphical Installer

set "SCRIPT_DIR=%~dp0"
set "INSTALLER_JS="

if exist "%SCRIPT_DIR%bin\lt-installer.mjs" if exist "%SCRIPT_DIR%leaderteam\core\installer.mjs" (
  set "INSTALLER_JS=%SCRIPT_DIR%bin\lt-installer.mjs"
)
if not defined INSTALLER_JS if exist "%SCRIPT_DIR%installer\lt-installer-standalone.mjs" (
  set "INSTALLER_JS=%SCRIPT_DIR%installer\lt-installer-standalone.mjs"
)
if not defined INSTALLER_JS if exist "%SCRIPT_DIR%lt-installer-standalone.mjs" (
  set "INSTALLER_JS=%SCRIPT_DIR%lt-installer-standalone.mjs"
)
if not defined INSTALLER_JS if exist "%SCRIPT_DIR%bin\lt-installer.mjs" (
  set "INSTALLER_JS=%SCRIPT_DIR%bin\lt-installer.mjs"
)

if not defined INSTALLER_JS (
  echo [LeaderTeam] Missing installer script under "%SCRIPT_DIR%". Please extract the full package first.
  pause
  exit /b 1
)

where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  node "%INSTALLER_JS%" %*
  exit /b %ERRORLEVEL%
)

REM Zero-Node Fallback: Automatically locate Official DeepSeek Harness Desktop (including custom paths like D:\Apps\DeepSeek-Harness)
set "FOUND_DSH_EXE="

if defined DSH_DESKTOP_DIR if exist "%DSH_DESKTOP_DIR%\DeepSeek Harness.exe" set "FOUND_DSH_EXE=%DSH_DESKTOP_DIR%\DeepSeek Harness.exe"
if not defined FOUND_DSH_EXE if defined DSH_APP_DIR if exist "%DSH_APP_DIR%\DeepSeek Harness.exe" set "FOUND_DSH_EXE=%DSH_APP_DIR%\DeepSeek Harness.exe"
if not defined FOUND_DSH_EXE if defined LT_DSH_APP if exist "%LT_DSH_APP%\DeepSeek Harness.exe" set "FOUND_DSH_EXE=%LT_DSH_APP%\DeepSeek Harness.exe"

if not defined FOUND_DSH_EXE if exist "%LOCALAPPDATA%\Programs\DeepSeek Harness\DeepSeek Harness.exe" set "FOUND_DSH_EXE=%LOCALAPPDATA%\Programs\DeepSeek Harness\DeepSeek Harness.exe"
if not defined FOUND_DSH_EXE if exist "%LOCALAPPDATA%\Programs\DeepSeek-Harness\DeepSeek Harness.exe" set "FOUND_DSH_EXE=%LOCALAPPDATA%\Programs\DeepSeek-Harness\DeepSeek Harness.exe"
if not defined FOUND_DSH_EXE if exist "%ProgramFiles%\DeepSeek Harness\DeepSeek Harness.exe" set "FOUND_DSH_EXE=%ProgramFiles%\DeepSeek Harness\DeepSeek Harness.exe"
if not defined FOUND_DSH_EXE if exist "%ProgramFiles%\DeepSeek-Harness\DeepSeek Harness.exe" set "FOUND_DSH_EXE=%ProgramFiles%\DeepSeek-Harness\DeepSeek Harness.exe"

if not defined FOUND_DSH_EXE (
  for %%D in (C D E F G H I J K L M N O P Q R S T U V W X Y Z) do (
    if not defined FOUND_DSH_EXE if exist "%%D:\" (
      if exist "%%D:\Apps\DeepSeek-Harness\DeepSeek Harness.exe" set "FOUND_DSH_EXE=%%D:\Apps\DeepSeek-Harness\DeepSeek Harness.exe"
      if not defined FOUND_DSH_EXE if exist "%%D:\Apps\DeepSeek Harness\DeepSeek Harness.exe" set "FOUND_DSH_EXE=%%D:\Apps\DeepSeek Harness\DeepSeek Harness.exe"
      if not defined FOUND_DSH_EXE if exist "%%D:\Program Files\DeepSeek Harness\DeepSeek Harness.exe" set "FOUND_DSH_EXE=%%D:\Program Files\DeepSeek Harness\DeepSeek Harness.exe"
      if not defined FOUND_DSH_EXE if exist "%%D:\DeepSeek-Harness\DeepSeek Harness.exe" set "FOUND_DSH_EXE=%%D:\DeepSeek-Harness\DeepSeek Harness.exe"
      if not defined FOUND_DSH_EXE if exist "%%D:\DeepSeek Harness\DeepSeek Harness.exe" set "FOUND_DSH_EXE=%%D:\DeepSeek Harness\DeepSeek Harness.exe"
    )
  )
)

if not defined FOUND_DSH_EXE (
  for /f "usebackq delims=" %%P in (`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; $p=(Get-Process -Name 'DeepSeek Harness' | Select-Object -ExpandProperty Path -First 1); if($p -and (Test-Path -LiteralPath $p)){$p;exit}; $roots=@('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'); foreach($it in (Get-ItemProperty -Path $roots)){ if(($it.DisplayName -match 'DeepSeek[-\s]*Harness') -or ($it.InstallLocation -match 'DeepSeek[-\s]*Harness')){ foreach($raw in @($it.InstallLocation,$it.DisplayIcon,$it.UninstallString)){ if(-not $raw){continue}; $c=($raw -replace ',\s*-?\d+\s*$','').Trim('\" '); if($c -match '\.exe'){$c=Split-Path -Parent ($c -replace '\.exe.*$','.exe')}; $exe=Join-Path $c 'DeepSeek Harness.exe'; if(Test-Path -LiteralPath $exe){$exe;exit} } } }"`) do (
    if not defined FOUND_DSH_EXE set "FOUND_DSH_EXE=%%P"
  )
)

if defined FOUND_DSH_EXE (
  for %%F in ("%FOUND_DSH_EXE%") do set "DSH_DESKTOP_DIR=%%~dpF"
  set "ELECTRON_RUN_AS_NODE=1"
  "%FOUND_DSH_EXE%" "%INSTALLER_JS%" %*
  exit /b %ERRORLEVEL%
)

echo [LeaderTeam] Official DeepSeek Harness Desktop or Node.js was not detected on this computer.
echo Please install Official DeepSeek Harness Desktop (^>= 0.2.2-rc.1) first, or set DSH_DESKTOP_DIR to your custom install folder, then double-click this installer again.
pause
exit /b 1

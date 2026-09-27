@echo off
setlocal EnableDelayedExpansion

:: ============================================================
::  Foldreel - Windows Build Script
::  Produces: dist\Foldreel-Setup-<VERSION>.exe + checksum.txt
::
::  Non-interactive:  set FOLDREEL_NOPROMPT=1  (skips the pauses)
:: ============================================================

set PY=python
where %PY% >nul 2>nul || set PY=py

pushd "%~dp0.."
set PROJECT_DIR=%CD%
popd

:: -- Version --------------------------------------------------
:: The current version always comes straight from package.json - the actual
:: source of truth electron-builder itself reads - instead of a second,
:: hardcoded copy in this script that could silently drift out of sync with it.
for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "(Get-Content -Raw '%PROJECT_DIR%\package.json' | ConvertFrom-Json).version"`) do set APP_VERSION=%%V
if not defined APP_VERSION ( echo ERROR: could not read version from package.json. & goto :die )

:: Press Enter to keep it; type a new one to sync it everywhere that
:: hardcodes it (package.json, backend\server.py, backend\version_info.txt,
:: README.md) via scripts\set-version.ps1. Pre-setting NEW_VERSION (e.g. from
:: another script) skips the prompt even without FOLDREEL_NOPROMPT; with
:: neither set, FOLDREEL_NOPROMPT alone just builds the current version as-is.
if not defined NEW_VERSION (
    if not defined FOLDREEL_NOPROMPT set /p NEW_VERSION="Version to build [%APP_VERSION%]: "
)
if not defined NEW_VERSION set NEW_VERSION=%APP_VERSION%
if not "%NEW_VERSION%"=="%APP_VERSION%" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%\scripts\set-version.ps1" -OldVersion "%APP_VERSION%" -NewVersion "%NEW_VERSION%"
    if errorlevel 1 ( echo ERROR: version sync failed. & goto :die )
    set APP_VERSION=%NEW_VERSION%
    echo.
)

set INSTALLER_NAME=Foldreel-Setup-%APP_VERSION%.exe
set DIST_DIR=%PROJECT_DIR%\dist
set INSTALLER_PATH=%DIST_DIR%\%INSTALLER_NAME%
set CHECKSUM_PATH=%DIST_DIR%\checksum.txt
set PS_TEMP=%TEMP%\foldreel_checksum_%RANDOM%.ps1
set LOCK_FILE=%PROJECT_DIR%\.building

:: A stale lock from a build that was killed rather than left to finish (e.g.
:: closing the window instead of letting it hit :done or :die) would block
:: every future build forever, so a lock older than this run is ignored -
:: it's just clean.bat's cue to warn, not a hard mutex.
echo %DATE% %TIME% (PID %RANDOM%) > "%LOCK_FILE%"

echo.
echo =============================================
echo   Foldreel Build  v%APP_VERSION%
echo =============================================
echo.

:: -- Step -1: don't fight a running copy of the app -----------
:: A running Foldreel/foldreel-backend still holds files under dist\win-unpacked
:: open, which makes electron-builder's packaging step fail outright (hit
:: this for real: "remove ...\locales: used by another process").
tasklist /FI "IMAGENAME eq Foldreel.exe" 2>nul | find /I "Foldreel.exe" >nul
if not errorlevel 1 (
    echo Closing the running Foldreel app so packaging doesn't hit locked files...
    taskkill /F /IM Foldreel.exe >nul 2>nul
    taskkill /F /IM foldreel-backend.exe >nul 2>nul
    echo.
)

:: -- Step 0: bundled tools (gallery-dl, yt-dlp, ffmpeg, aria2c) ------------
if not exist "%PROJECT_DIR%\bin\gallery-dl.exe" (
    echo [0/4] Fetching bundled tools into bin\...
    powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%\scripts\fetch-bin-tools.ps1"
    if errorlevel 1 ( echo ERROR: could not populate bin\ & goto :die )
) else (
    echo [0/4] bin\ tools present - skipping fetch.
)
echo.

:: -- Step 1: Python backend ---------------------------------
echo [1/4] Building Python backend with PyInstaller...
cd /d "%PROJECT_DIR%\backend"
%PY% -m pip install -r requirements.txt --quiet --disable-pip-version-check
:: --log-level=WARN: PyInstaller's default INFO level prints a line for every
:: single hook and hidden import it processes (hundreds of them); WARN still
:: surfaces real problems, it just drops the noise.
%PY% -m PyInstaller foldreel_backend.spec --clean --noconfirm --log-level=WARN
if errorlevel 1 ( echo ERROR: PyInstaller failed. & goto :die )
echo       Done. Output: backend\dist\foldreel-backend.exe
echo.

:: -- Step 2: React frontend --------------------------------
echo [2/4] Building React frontend...
cd /d "%PROJECT_DIR%\frontend"
call yarn install --frozen-lockfile
call yarn build
if errorlevel 1 ( echo ERROR: React build failed. & goto :die )
echo       Done. Output: frontend\build\
echo.

:: -- Step 3: electron-builder ------------------------------
echo [3/4] Packaging installer with electron-builder...
cd /d "%PROJECT_DIR%"
call npm install --silent
call npm run dist
if errorlevel 1 ( echo ERROR: electron-builder failed. & goto :die )
:: npm run dist can exit 0 while still not producing the installer (seen
:: this for real too), so a missing file here is its own hard failure rather
:: than the softer "skip the checksum" this used to fall through to.
if not exist "%INSTALLER_PATH%" ( echo ERROR: electron-builder reported success but %INSTALLER_NAME% is missing. & goto :die )
echo       Done. Output: dist\%INSTALLER_NAME%
echo.

:: -- Step 4: SHA-256 checksum ------------------------------
echo [4/4] Generating SHA-256 checksum...

echo $src = "%INSTALLER_PATH%"                                       > "%PS_TEMP%"
echo $out = "%CHECKSUM_PATH%"                                       >> "%PS_TEMP%"
echo $h   = (Get-FileHash -LiteralPath $src -Algorithm SHA256).Hash >> "%PS_TEMP%"
echo [System.IO.File]::WriteAllText($out, "SHA256: " + $h + "  %INSTALLER_NAME%") >> "%PS_TEMP%"
echo Write-Host ("       SHA-256: " + $h)                           >> "%PS_TEMP%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_TEMP%"
del "%PS_TEMP%"

:done
del "%LOCK_FILE%" 2>nul
echo.
echo =============================================
echo   Build complete!
echo   Installer : dist\%INSTALLER_NAME%
echo =============================================
echo.
if not defined FOLDREEL_NOPROMPT pause
exit /b 0

:die
del "%LOCK_FILE%" 2>nul
if not defined FOLDREEL_NOPROMPT pause
exit /b 1

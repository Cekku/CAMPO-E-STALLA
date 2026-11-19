@echo off
title Archivio documenti - riaccendi il ponte
cd /d "%~dp0"
rem Spegne guardiano e ponte e li riaccende senza finestre. Se qualcosa non va guarda
rem %USERPROFILE%\ArchivioAzienda\ponte-log.txt
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match 'ponte-(guardiano|archivio)\.py' } | Sort-Object { $_.CommandLine -notmatch 'guardiano' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
ping -n 3 127.0.0.1 >nul
for /f "delims=" %%P in ('where pythonw 2^>nul') do (set "PYW=%%P" & goto trovato)
echo Non trovo pythonw: Python e' installato?
pause
exit /b 1
:trovato
start "" "%PYW%" ponte-guardiano.py
echo Guardiano acceso. Attendo il ponte...
for /l %%I in (1,1,20) do (
  powershell -NoProfile -Command "try { $r = Invoke-WebRequest http://127.0.0.1:1236/stato -Headers @{Origin='http://127.0.0.1:8765'} -UseBasicParsing -TimeoutSec 3; exit 0 } catch { if ($_.Exception.Response) { exit 0 } else { exit 1 } }" && goto ok
  ping -n 3 127.0.0.1 >nul
)
echo Il ponte non risponde ancora: guarda %USERPROFILE%\ArchivioAzienda\ponte-log.txt
pause
exit /b 1
:ok
echo Il ponte risponde su http://127.0.0.1:1236
ping -n 4 127.0.0.1 >nul

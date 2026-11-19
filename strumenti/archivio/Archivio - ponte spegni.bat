@echo off
title Archivio documenti - spegni il ponte
rem Ferma il guardiano e il ponte (anche quello aperto a mano). Il guardiano riparte da solo al prossimo
rem accesso a Windows o fra 15 minuti (attivita "Archivio documenti - ponte"): per lasciarlo spento davvero
rem usa "Archivio - ponte (avvio automatico).bat" con la parola togli.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match 'ponte-(guardiano|archivio)\.py' }; $p | Sort-Object { $_.CommandLine -notmatch 'guardiano' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; Write-Host ('Chiuso: ' + $_.Name + ' ' + $_.ProcessId) }; if (-not $p) { Write-Host 'Il ponte non era acceso.' }"
echo.
echo Fatto.
pause

@echo off
title Archivio documenti - avvio automatico del ponte
cd /d "%~dp0"
rem Uso:  "Archivio - ponte (avvio automatico).bat" installa   crea/aggiorna le attivita di Windows
rem       "Archivio - ponte (avvio automatico).bat" togli      le toglie (il ponte va acceso a mano)
rem       "Archivio - ponte (avvio automatico).bat" stato      mostra cosa c'e' e quando parte
rem Senza parola chiede cosa fare. Attivita dell'utente, senza privilegi di amministratore.
set "AZ=%~1"
if "%AZ%"=="" (
  echo Cosa vuoi fare?  installa / togli / stato
  set /p AZ="> "
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Archivio - attivita di Windows.ps1" -Azione %AZ%
echo.
pause

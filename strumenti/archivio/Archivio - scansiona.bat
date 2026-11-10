@echo off
title Archivio documenti - scansione
cd /d "%~dp0"
python archivio.py scansiona
echo.
python archivio.py doppioni
pause

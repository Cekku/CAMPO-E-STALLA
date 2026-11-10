@echo off
title Archivio documenti - file nuovi
cd /d "%~dp0"
rem scansione, testo, OCR, regole e modello sul PC (LM Studio si accende da solo se e' installato)
python archivio.py nuovi
pause

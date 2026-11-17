@echo off
title Archivio documenti - rileggi le scansioni vecchie
cd /d "%~dp0"
rem rilegge con PP-OCR le scansioni lette prima con Tesseract, per al massimo 10 ore (si riprende da dove era rimasto)
rem lasciare il PC acceso e collegato alla corrente, per esempio di notte
python archivio.py rileggi-ocr --minuti 600
python archivio.py stato-ocr
pause

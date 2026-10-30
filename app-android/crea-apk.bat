@echo off
rem Crea l'APK firmato di Campo e Stalla con i file attuali del sito.
rem Serve: Java 21 in ..\..\.jdk, Android SDK di Android Studio, chiave in ..\..\chiave-android
cd /d "%~dp0"
for /d %%J in ("%~dp0..\..\.jdk\jdk-21*") do set "JAVA_HOME=%%~fJ"
if not defined JAVA_HOME ( echo Manca Java 21 nella cartella .jdk & pause & exit /b 1 )
if not exist node_modules call npm install --no-audit --no-fund || ( pause & exit /b 1 )
call npm run sync || ( pause & exit /b 1 )
cd android
call gradlew.bat assembleRelease --console=plain || ( pause & exit /b 1 )
copy /y "app\build\outputs\apk\release\app-release.apk" "%~dp0..\..\Campo-e-Stalla.apk" >nul
echo.
echo APK pronto: %~dp0..\..\Campo-e-Stalla.apk
pause

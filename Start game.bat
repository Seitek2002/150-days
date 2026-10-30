@echo off
rem Builds and starts 150 Days. Double-click this file.
cd /d "%~dp0"
call npm start
if errorlevel 1 pause

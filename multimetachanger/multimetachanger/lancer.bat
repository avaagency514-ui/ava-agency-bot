@echo off
cd /d "%~dp0"
title MultiMetaChanger v2.0
color 0B

echo Lancement de MultiMetaChanger GUI...
echo (Laissez cette fenetre ouverte tant que vous utilisez le logiciel)
echo.

venv\Scripts\python app.py
pause

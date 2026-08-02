@echo off
title MultiMetaChanger v2.0 - Lanceur
color 0B
cd /d "%~dp0"

echo ========================================================
echo        Lancement de MultiMetaChanger v2.0
echo ========================================================
echo.

:: 1. Verifier si Python est installe
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Python n'est pas installe ou n'est pas dans le PATH.
    echo Veuillez installer Python depuis le Microsoft Store ou python.org
    echo Cochez bien la case "Add Python to PATH" lors de l'installation.
    pause
    exit /b
)

:: 2. Verifier si l'environnement virtuel existe
if not exist "venv\Scripts\python.exe" (
    echo [*] Premier lancement detecte. Configuration en cours...
    echo [*] Creation de l'environnement virtuel...
    python -m venv venv
    if %errorlevel% neq 0 (
        echo [ERREUR] Impossible de creer l'environnement virtuel.
        pause
        exit /b
    )
)

:: 3. Installer/Verifier les dependances
echo [*] Verification des dependances (patientez quelques secondes)...
venv\Scripts\python -m pip install --upgrade pip >nul 2>&1
venv\Scripts\python -m pip install -r requirements.txt >nul 2>&1

:: 4. Lancer l'application
echo.
echo [*] Demarrage de l'interface...
echo (Laissez cette fenetre ouverte pendant que vous utilisez le logiciel)
echo.
venv\Scripts\python app.py

pause

@echo off
chcp 65001 >nul
cd /d "C:\Users\BOSS\.gemini\antigravity\scratch\ava-agency-bot"

echo ========================================================
echo   AVA AGENCY BOT - Redémarrage Rapide
echo ========================================================
echo.
echo Relance du bot en cours...

call pm2 restart ecosystem.config.js --update-env
call pm2 save

echo.
echo ✅ Bot AVA redémarré avec succès !
echo Le bot tourne en continu en arrière-plan.
echo.
timeout /t 3 >nul
exit /b 0

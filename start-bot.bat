@echo off
cd /d "C:\Users\BOSS\.gemini\antigravity\scratch\ava-agency-bot"
echo [AVA Bot] Demarrage automatique via PM2...
call pm2 resurrect >nul 2>&1
call pm2 start ecosystem.config.js --update-env >nul 2>&1
call pm2 save >nul 2>&1
exit /b 0

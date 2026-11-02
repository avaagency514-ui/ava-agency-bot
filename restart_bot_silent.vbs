' Script VBS pour redémarrer le bot avec notification propre
Set WshShell = CreateObject("WScript.Shell")
botDir = "C:\Users\BOSS\.gemini\antigravity\scratch\ava-agency-bot"

' Exécute le redémarrage PM2 en tâche masquée
cmd = "cmd.exe /c cd /d """ & botDir & """ && pm2 restart ecosystem.config.js --update-env && pm2 save"
WshShell.Run cmd, 0, True

' Affiche une jolie confirmation
WshShell.Popup "✅ Bot AVA Agency redémarré avec succès !" & vbCrLf & "Le bot et le tracker Telegram tournent en arrière-plan.", 3, "AVA Agency Bot", 64

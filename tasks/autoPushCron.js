/**
 * tasks/autoPushCron.js
 * Démarre le cron de vérification et d'envoi automatique pour l'Auto-Push Telegram.
 */
const { startAutoPushCron } = require('../services/pushService');

function startAutoPushTask(client) {
  startAutoPushCron(client);
}

module.exports = { startAutoPushTask };

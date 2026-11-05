const { startAlertes } = require('./alertes');
const { startBilan } = require('./bilan');
const { startTgTrackerReport } = require('./tgTrackerReport');
const { startChatterDailyReport } = require('./chatterDailyReport');
const { startChatterShiftWatchdog } = require('./chatterShiftWatchdog');
const { startComptaMonthlyCron } = require('./comptaMonthlyCron');
const { startAutoPushTask } = require('./autoPushCron');

/**
 * Démarre toutes les tâches planifiées du bot
 * @param {import('discord.js').Client} client 
 */
function startTasks(client) {
  console.log('⏰ Démarrage des tâches planifiées...');
  startAlertes(client);
  startBilan(client);
  startTgTrackerReport(client);
  startChatterDailyReport(client);
  startChatterShiftWatchdog(client);
  startComptaMonthlyCron(client);
  startAutoPushTask(client);
  console.log('✅ Toutes les tâches sont actives');
}

module.exports = { startTasks };

const { startAlertes } = require('./alertes');
const { startBilan } = require('./bilan');

/**
 * Démarre toutes les tâches planifiées du bot
 * @param {import('discord.js').Client} client 
 */
function startTasks(client) {
  console.log('⏰ Démarrage des tâches planifiées...');
  startAlertes(client);
  startBilan(client);
  console.log('✅ Toutes les tâches sont actives');
}

module.exports = { startTasks };

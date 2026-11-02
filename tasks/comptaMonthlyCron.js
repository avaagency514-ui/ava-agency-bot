/**
 * tasks/comptaMonthlyCron.js
 * Tâche planifiée mensuelle :
 * - Déclenchée le 1er de chaque mois à 00h05 (Heure de Paris)
 * - Initialise automatiquement les charges récurrentes mensuelles :
 *   • Abonnement Telegram Premium ($3.99/mois)
 *   • Salaire Modèle fixe ($700.00/mois)
 *   • Salaires Managers fixes ($200.00/mois soit 2x $100.00)
 * - Actualise automatiquement le tableau de bord #compatabiliter pour le nouveau mois
 */
'use strict';

const cron = require('node-cron');
const { initMonthlyRecurringExpenses, setupComptaChannel } = require('../services/comptaService');

function startComptaMonthlyCron(client) {
  // 1er jour du mois à 00h05 (Europe/Paris)
  cron.schedule('5 0 1 * *', async () => {
    console.log('📅 [Compta Mensuelle] Bascule vers le nouveau mois en cours...');
    try {
      initMonthlyRecurringExpenses();
      await setupComptaChannel(client);
      console.log('✅ [Compta Mensuelle] Nouveau mois initialisé et panneau actualisé.');
    } catch (err) {
      console.error('❌ [Compta Mensuelle] Erreur lors du cron mensuel :', err);
    }
  }, {
    timezone: process.env.TIMEZONE || 'Europe/Paris',
  });

  console.log('✅ Cron Compta Mensuelle démarré (le 1er du mois à 00h05)');
}

module.exports = { startComptaMonthlyCron };

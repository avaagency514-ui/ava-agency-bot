/**
 * tasks/tgTrackerReport.js
 * Cron quotidien : rapport Telegram subs → Discord (Minuit 00h00 heure de Paris)
 * Inclut un mécanisme double (Cron + Watchdog) pour garantir le déclenchement sans aucun raté
 */
'use strict';

const cron = require('node-cron');
const { sendDailyTrackerReport } = require('../services/tgTracker');

function startTgTrackerReport(client) {
  const heure = process.env.TG_REPORT_HEURE !== undefined ? parseInt(process.env.TG_REPORT_HEURE, 10) : 0;
  const minute = process.env.TG_REPORT_MINUTE !== undefined ? parseInt(process.env.TG_REPORT_MINUTE, 10) : 0;
  const timezone = process.env.TIMEZONE || 'Europe/Paris';

  let lastReportDate = null;

  async function triggerReport(source = 'cron') {
    const todayParis = new Intl.DateTimeFormat('fr-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());

    if (lastReportDate === todayParis) {
      return;
    }

    lastReportDate = todayParis;
    console.log(`📊 TG Tracker — Génération du rapport quotidien (Minuit 00h00 Paris, déclenché via ${source})...`);
    try {
      await sendDailyTrackerReport(client);
    } catch (err) {
      console.error(`❌ Erreur lors de l'envoi du rapport quotidien TG Tracker (${source}):`, err);
    }
  }

  // 1. Cron principal avec recoverMissedExecutions: true
  // Cela empêche node-cron d'ignorer la seconde 0 si une autre tâche tourne au même instant
  cron.schedule(`${minute} ${heure} * * *`, async () => {
    await triggerReport('cron');
  }, {
    timezone,
    recoverMissedExecutions: true
  });

  // 2. Watchdog de sécurité (vérifie toutes les 20 secondes)
  // Si le cron a été retardé ou sauté par une latence système à la seconde pile,
  // le watchdog rattrape l'exécution dès qu'on se trouve dans la minute cible.
  setInterval(async () => {
    try {
      const now = new Date();
      const parts = new Intl.DateTimeFormat('fr-FR', {
        timeZone: timezone,
        hour: 'numeric',
        minute: 'numeric',
        hourCycle: 'h23'
      }).formatToParts(now);

      const h = parseInt(parts.find(p => p.type === 'hour')?.value, 10);
      const m = parseInt(parts.find(p => p.type === 'minute')?.value, 10);

      if (h === heure && m === minute) {
        await triggerReport('watchdog');
      }
    } catch (err) {
      console.error('⚠️ Erreur watchdog TG Tracker:', err.message);
    }
  }, 20000);

  console.log(`✅ TG Tracker rapport cron & watchdog démarrés (${String(heure).padStart(2, '0')}h${String(minute).padStart(2, '0')} heure de Paris)`);
}

module.exports = { startTgTrackerReport };

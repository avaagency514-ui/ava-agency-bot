/**
 * tasks/chatterDailyReport.js
 * Cron quotidien : rapport des ventes Chatters → Discord (#1565373809337311242)
 * Se déclenche chaque jour à Minuit (00h00 heure de Paris) avec mention @everyone
 * Inclut un mécanisme double (Cron + Watchdog) pour garantir le déclenchement sans aucun raté
 */
'use strict';

const cron = require('node-cron');
const { sendDailyChatterSalesReport } = require('../services/chatterService');

function startChatterDailyReport(client) {
  const heure = process.env.CHATTER_REPORT_HEURE !== undefined ? parseInt(process.env.CHATTER_REPORT_HEURE, 10) : 0;
  const minute = process.env.CHATTER_REPORT_MINUTE !== undefined ? parseInt(process.env.CHATTER_REPORT_MINUTE, 10) : 0;
  const timezone = process.env.TIMEZONE || 'Europe/Paris';

  let lastReportDate = null;

  async function triggerReport(source = 'cron') {
    const todayParis = new Intl.DateTimeFormat('fr-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    if (lastReportDate === todayParis) {
      return;
    }

    lastReportDate = todayParis;
    console.log(`📊 Chatter — Génération du rapport quotidien des ventes (${String(heure).padStart(2, '0')}h${String(minute).padStart(2, '0')} Paris, déclenché via ${source})...`);
    try {
      await sendDailyChatterSalesReport(client);
    } catch (err) {
      console.error(`❌ Erreur lors de l'envoi du rapport quotidien Chatter (${source}):`, err);
    }
  }

  // 1. Cron principal avec recoverMissedExecutions: true
  cron.schedule(`${minute} ${heure} * * *`, async () => {
    await triggerReport('cron');
  }, {
    timezone,
    recoverMissedExecutions: true,
  });

  // 2. Watchdog de sécurité (vérifie toutes les 20 secondes)
  setInterval(async () => {
    try {
      const now = new Date();
      const parts = new Intl.DateTimeFormat('fr-FR', {
        timeZone: timezone,
        hour: 'numeric',
        minute: 'numeric',
        hourCycle: 'h23',
      }).formatToParts(now);

      const h = parseInt(parts.find(p => p.type === 'hour')?.value, 10);
      const m = parseInt(parts.find(p => p.type === 'minute')?.value, 10);

      if (h === heure && m === minute) {
        await triggerReport('watchdog');
      }
    } catch (err) {
      console.error('⚠️ Erreur watchdog Chatter Rapport:', err.message);
    }
  }, 20000);

  console.log(`✅ Chatter Rapport des Ventes cron & watchdog démarrés (${String(heure).padStart(2, '0')}h${String(minute).padStart(2, '0')} heure de Paris, canal: ${process.env.CHANNEL_CHATTER_DAILY_REPORT || '1565373809337311242'})`);
}

module.exports = { startChatterDailyReport };

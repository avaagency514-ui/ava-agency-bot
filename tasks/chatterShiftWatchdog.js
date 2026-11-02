/**
 * tasks/chatterShiftWatchdog.js
 * Surveillance automatique des prises de shift, des retards (>15 min) et des absences (5 jours sans excuse)
 * Exécute une vérification chaque minute pour la ponctualité des shifts
 */
'use strict';

const cron = require('node-cron');
const {
  getAllChatters,
  parseShiftHours,
  recordChatterStrike,
  recordChatterAbsence,
} = require('../services/chatterService');
const { db } = require('../database/db');

/**
 * Détermine si le chatter est actuellement dans son shift et en retard de 15 min ou plus
 */
function checkShiftLateness(curHour, curMinute, shiftHours) {
  const curTotalMins = curHour * 60 + curMinute;
  const startMins = shiftHours.startHour * 60 + shiftHours.startMinute;
  const endMins = shiftHours.endHour * 60 + shiftHours.endMinute;

  // Cas 1 : Shift classique en journée (ex: 08h00 - 14h00, ou 14h00 - 20h00)
  if (startMins < endMins) {
    if (curTotalMins >= startMins + 15 && curTotalMins < endMins) {
      return {
        isLate: true,
        lateMinutes: curTotalMins - startMins,
      };
    }
    return { isLate: false, lateMinutes: 0 };
  }

  // Cas 2 : Shift de nuit traversant minuit (ex: 20h00 - 02h00)
  if (startMins > endMins) {
    // Phase 1 : De startMins + 15 jusqu'à 23h59 (ex: 20h15 - 23h59)
    if (curTotalMins >= startMins + 15) {
      return {
        isLate: true,
        lateMinutes: curTotalMins - startMins,
      };
    }
    // Phase 2 : De 00h00 jusqu'à endMins (ex: 00h00 - 02h00)
    if (curTotalMins < endMins) {
      return {
        isLate: true,
        lateMinutes: (1440 - startMins) + curTotalMins,
      };
    }
    return { isLate: false, lateMinutes: 0 };
  }

  return { isLate: false, lateMinutes: 0 };
}

function startChatterShiftWatchdog(client) {
  const timezone = process.env.TIMEZONE || 'Europe/Paris';

  // 1. Surveillance chaque minute des retards de pointage (> 15 min)
  cron.schedule('* * * * *', async () => {
    try {
      const nowParis = new Date();
      const parts = new Intl.DateTimeFormat('fr-FR', {
        timeZone: timezone,
        hour: 'numeric',
        minute: 'numeric',
        hourCycle: 'h23',
      }).formatToParts(nowParis);

      const curHour = parseInt(parts.find(p => p.type === 'hour')?.value, 10);
      const curMinute = parseInt(parts.find(p => p.type === 'minute')?.value, 10);

      const dateStr = new Intl.DateTimeFormat('fr-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(nowParis);

      const chatters = getAllChatters();

      for (const chatter of chatters) {
        // Ignorer les chatters exclus / virés / supprimés
        if (chatter.status === 'Viré' || chatter.status === 'Supprimé') continue;

        const shiftHours = parseShiftHours(chatter.shift);
        if (!shiftHours) continue; // Pas d'horaire fixe

        const lateness = checkShiftLateness(curHour, curMinute, shiftHours);
        if (!lateness.isLate) continue;

        // Vérifier si le chatter a un shift ouvert ou a déjà pointé récemment
        const activeShift = db.prepare(`
          SELECT * FROM chatter_shifts
          WHERE chatter_id = ? AND (
            ended_at IS NULL
            OR datetime(started_at, 'localtime') >= datetime('now', '-12 hours', 'localtime')
          )
          ORDER BY id DESC LIMIT 1
        `).get(chatter.id);

        // S'il n'a pas pointé du tout
        if (!activeShift) {
          // Vérifier si un strike a déjà été émis aujourd'hui pour ce retard
          const existingStrike = db.prepare(`
            SELECT * FROM chatter_strikes
            WHERE chatter_id = ? AND date = ? AND strike_type = 'retard'
          `).get(chatter.id, dateStr);

          if (!existingStrike) {
            console.log(`⚠️ ALERTE WATCHDOG: ${chatter.name} est en retard de ${lateness.lateMinutes} min sans pointage (shift: ${chatter.shift})`);
            await recordChatterStrike(
              client,
              chatter.id,
              'retard',
              `Retard constaté de ${lateness.lateMinutes} minutes sans prise de shift (Shift prévu : ${chatter.shift})`
            ).catch(err => console.error(`Erreur recordChatterStrike pour ${chatter.name}:`, err));
          }
        }
      }
    } catch (err) {
      console.error('⚠️ Erreur Watchdog Shifts Chatters :', err.message);
    }
  }, { timezone });

  // 2. Bilan quotidien des absences à 23h55 (vérifie si un chatter avec shift n'a pas travaillé du tout aujourd'hui)
  cron.schedule('55 23 * * *', async () => {
    try {
      console.log('🌙 Vérification quotidienne des absences non excusées pour les chatters...');
      const chatters = getAllChatters();

      for (const chatter of chatters) {
        if (chatter.status === 'Viré' || chatter.status === 'Supprimé') continue;

        const shiftHours = parseShiftHours(chatter.shift);
        if (!shiftHours) continue;

        // A-t-il travaillé aujourd'hui ?
        const workedToday = db.prepare(`
          SELECT COUNT(*) as count FROM chatter_shifts
          WHERE chatter_id = ? AND (
            date(started_at, 'localtime') = date('now', 'localtime')
            OR datetime(started_at, 'localtime') >= datetime('now', '-18 hours', 'localtime')
          )
        `).get(chatter.id);

        if (!workedToday || workedToday.count === 0) {
          console.log(`⚠️ ABSENCE DÉTECTÉE: ${chatter.name} n'a effectué aucun shift aujourd'hui.`);
          await recordChatterAbsence(client, chatter.id, null).catch(err => {
            console.error(`Erreur recordChatterAbsence pour ${chatter.name}:`, err);
          });
        }
      }
    } catch (err) {
      console.error('⚠️ Erreur vérification absences chatters :', err.message);
    }
  }, { timezone });

  console.log('✅ Chatter Shift Watchdog démarré (Surveillance retards > 15 min & règle des 5 jours d\'absence)');
}

module.exports = { startChatterShiftWatchdog, checkShiftLateness };

/**
 * services/tgRemuneration.js
 * Système de rémunération des VAs basé sur les subs Telegram valides
 *
 * Règles :
 *  - 1$ pour 3 subs valides (Europe + US)
 *  - Minimum 30 subs valides cumulés avant tout paiement
 *  - Prime de 10$ en fin de mois si 500 subs valides cumulés atteints
 */

'use strict';

const { db } = require('../database/db');

// ─── Normalisation locale des noms de VAs (miroir de tgTracker.normalizeVaName) ─
// (Dupliquée ici pour éviter l'import circulaire tgTracker ↔ tgRemuneration)
function normalizeVaNameLocal(name) {
  if (!name) return 'Lien direct/public';
  let cleaned = name.trim();
  if (/^malachi(\s+|$)/i.test(cleaned)) {
    cleaned = cleaned.replace(/^malachi/i, 'malachie');
  }
  return cleaned;
}

// ─── Initialisation de la table ──────────────────────────────────────────────
function initRemunerationTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tg_remuneration (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      va_name             TEXT    NOT NULL UNIQUE,
      paid_subs_count     INTEGER NOT NULL DEFAULT 0,
      total_earned        REAL    NOT NULL DEFAULT 0,
      bonus_paid_months   TEXT    NOT NULL DEFAULT '[]',
      updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

// ─── Obtenir ou créer la ligne de rémunération pour une VA ───────────────────
function getOrCreateVA(vaName) {
  db.prepare(`
    INSERT OR IGNORE INTO tg_remuneration (va_name) VALUES (?)
  `).run(vaName);

  return db.prepare(`SELECT * FROM tg_remuneration WHERE va_name = ?`).get(vaName);
}

// ─── Normalisation SQL inline des noms de VAs (cohérence avec tgTracker.js) ──
function vaNameCondition(vaName) {
  // Cherche aussi les variantes orthographiques (ex: malachi = malachie)
  const variants = [vaName];
  if (vaName.toLowerCase().startsWith('malachie ')) {
    variants.push('malachi' + vaName.slice('malachie'.length));
  }
  return variants;
}

// ─── Compter les subs valides (cumulatif depuis le début — FRANCE UNIQUEMENT) 
function getEligibleSubsCount(vaName) {
  const variants = vaNameCondition(vaName);
  const placeholders = variants.map(() => '?').join(',');
  const row = db.prepare(`
    SELECT COUNT(*) as cnt FROM tg_subs 
    WHERE va_name IN (${placeholders}) AND eligible = 1 AND canal = 'FR' AND ts <= datetime('now', 'localtime')
  `).get(...variants);
  return row ? row.cnt : 0;
}

// ─── Calculer la situation d'une VA ──────────────────────────────────────────
function buildVAReport(vaName) {
  const remun        = getOrCreateVA(vaName);
  const totalEligible = getEligibleSubsCount(vaName);
  const paidSubsCount = remun.paid_subs_count;
  const totalEarned   = remun.total_earned;

  // Subs pas encore comptabilisés dans un paiement
  const pendingSubs = totalEligible - paidSubsCount;

  // Palier minimum de 30 subs valides pour déclencher un paiement
  const MINIMUM_SUBS = 30;
  const SUBS_PER_DOLLAR = 3;
  const BONUS_THRESHOLD = 500;
  const BONUS_AMOUNT = 10;

  const canPay       = pendingSubs >= MINIMUM_SUBS;
  const payableSubs  = canPay ? Math.floor(pendingSubs / SUBS_PER_DOLLAR) * SUBS_PER_DOLLAR : 0;
  const payableAmount = canPay ? Math.floor(pendingSubs / SUBS_PER_DOLLAR) : 0;

  // Prime fin de mois
  const currentMonth  = new Date().toISOString().slice(0, 7); // ex: "2026-10"
  let bonusPaidMonths = [];
  try { bonusPaidMonths = JSON.parse(remun.bonus_paid_months); } catch {}
  const bonusAlreadyPaid = bonusPaidMonths.includes(currentMonth);
  const bonusDue = totalEligible >= BONUS_THRESHOLD && !bonusAlreadyPaid;

  return {
    vaName,
    totalEligible,
    paidSubsCount,
    pendingSubs,
    canPay,
    payableSubs,
    payableAmount,        // en dollars (nombre entier)
    totalEarned,
    bonusDue,
    bonusAlreadyPaid,
    bonusPaidMonths,
    currentMonth,
  };
}

// ─── Rapport global de toutes les VAs ────────────────────────────────────────
function buildAllVAsReport() {
  // On prend toutes les VAs actives + toutes celles qui ont des subs sur le canal FR
  // Normalisation pour éviter les doublons malachi/malachie
  const vasFromSubs = db.prepare(`
    SELECT DISTINCT va_name FROM tg_subs 
    WHERE va_name != 'Lien direct/public' AND canal = 'FR' AND ts <= datetime('now', 'localtime')
  `).all().map(r => normalizeVaNameLocal(r.va_name));

  const vasFromTable = db.prepare(`SELECT DISTINCT va_name FROM tg_remuneration`).all().map(r => normalizeVaNameLocal(r.va_name));

  // Union des deux sans doublons
  const allVAs = [...new Set([...vasFromSubs, ...vasFromTable])].sort();

  return allVAs.map(vaName => buildVAReport(vaName));
}

// ─── Valider un paiement pour une VA (marquer les subs comme payés) ──────────
function processPayout(vaName) {
  const report = buildVAReport(vaName);
  if (!report.canPay || report.payableAmount <= 0) return { success: false, reason: 'Conditions non remplies' };

  db.prepare(`
    UPDATE tg_remuneration
    SET paid_subs_count = paid_subs_count + ?,
        total_earned    = total_earned + ?,
        updated_at      = datetime('now')
    WHERE va_name = ?
  `).run(report.payableSubs, report.payableAmount, vaName);

  return { success: true, paidSubs: report.payableSubs, amount: report.payableAmount };
}

// ─── Valider la prime de fin de mois pour une VA ─────────────────────────────
function processMonthBonus(vaName) {
  const report = buildVAReport(vaName);
  if (!report.bonusDue) return { success: false, reason: report.bonusAlreadyPaid ? 'Prime déjà versée ce mois' : 'Seuil 500 subs non atteint' };

  const updatedMonths = JSON.stringify([...report.bonusPaidMonths, report.currentMonth]);
  db.prepare(`
    UPDATE tg_remuneration
    SET total_earned      = total_earned + 10,
        bonus_paid_months = ?,
        updated_at        = datetime('now')
    WHERE va_name = ?
  `).run(updatedMonths, vaName);

  return { success: true, month: report.currentMonth, amount: 10 };
}

// ─── Formatter le bloc rémunération pour le rapport Discord ──────────────────
function formatRemunerationBlock() {
  const reports = buildAllVAsReport();
  if (reports.length === 0) return null;

  const lines = [];
  lines.push('');
  lines.push('💰 **── RÉMUNÉRATIONS ──**');

  let totalDue      = 0;
  let totalBonusDue = 0;
  const bonusVAs    = [];

  for (const r of reports) {
    if (r.totalEligible === 0 && r.totalEarned === 0) continue; // Ignorer les VAs sans aucun sub valide

    let statusLine = `👤 **${r.vaName}**`;
    statusLine += ` — ${r.totalEligible} sub(s) valide(s)`;

    if (r.pendingSubs > 0) {
      if (r.canPay) {
        const dollars = Math.floor(r.pendingSubs / 3);
        statusLine += ` · 💵 **$${dollars} à payer** (${r.pendingSubs} subs en attente)`;
        totalDue += dollars;
      } else {
        statusLine += ` · ⏳ ${r.pendingSubs} subs en attente *(min. 30 requis)*`;
      }
    } else {
      statusLine += ` · ✅ Tout à jour`;
    }

    if (r.totalEarned > 0) {
      statusLine += ` · 📦 Total cumulé: **\$${r.totalEarned.toFixed(2)}**`;
    }

    lines.push(statusLine);

    if (r.bonusDue) {
      bonusVAs.push(r.vaName);
      totalBonusDue += 10;
    }
  }

  if (bonusVAs.length > 0) {
    lines.push('');
    lines.push(`🏆 **PRIME FIN DE MOIS (+10\$)** : ${bonusVAs.map(v => `**${v}**`).join(', ')} — 500 subs atteints !`);
  }

  if (totalDue > 0 || totalBonusDue > 0) {
    lines.push('');
    lines.push(`💳 **TOTAL À VERSER CE JOUR : \$${(totalDue + totalBonusDue).toFixed(2)}**`);
  }

  return lines.join('\n');
}

// ─── Valider tous les paiements des VAs ayant atteint l'objectif (>= 30 subs) ──
function processPayoutAll() {
  const reports = buildAllVAsReport();
  const paid = [];
  const continued = [];

  for (const r of reports) {
    if (r.canPay && r.payableAmount > 0) {
      const res = processPayout(r.vaName);
      if (res.success) {
        paid.push({ vaName: r.vaName, subs: res.paidSubs, amount: res.amount });
      }
    } else if (r.pendingSubs > 0) {
      continued.push({ vaName: r.vaName, pendingSubs: r.pendingSubs });
    }
  }

  return { paid, continued };
}

module.exports = {
  initRemunerationTable,
  getOrCreateVA,
  getEligibleSubsCount,
  buildVAReport,
  buildAllVAsReport,
  processPayout,
  processPayoutAll,
  processMonthBonus,
  formatRemunerationBlock,
};

/**
 * services/chatterService.js
 * Gestion complète des Chatters, des Ventes PPV, des Commissions et des Paies bimensuelles
 */
'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { db } = require('../database/db');

// ─── Initialisation des tables SQLite ─────────────────────────────────────────
function initChatterTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chatters (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      name              TEXT NOT NULL UNIQUE,
      discord_user_id   TEXT,
      assigned_account  TEXT NOT NULL DEFAULT 'Kim',
      shift             TEXT NOT NULL DEFAULT 'Matin (08h-14h)',
      commission_rate   REAL NOT NULL DEFAULT 10.0,
      sales_target      REAL NOT NULL DEFAULT 500.0,
      status            TEXT NOT NULL DEFAULT 'Actif', -- 'Actif' ou 'Repos'
      role              TEXT NOT NULL DEFAULT 'Chatter',
      override_rate     REAL NOT NULL DEFAULT 0.0,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chatter_sales (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      chatter_id        INTEGER NOT NULL,
      chatter_name      TEXT NOT NULL,
      discord_user_id   TEXT,
      sub_name          TEXT NOT NULL,
      ppv_name          TEXT NOT NULL,
      amount            REAL NOT NULL,
      commission_rate   REAL NOT NULL,
      commission_earned REAL NOT NULL,
      is_paid           INTEGER NOT NULL DEFAULT 0,
      payout_id         INTEGER DEFAULT NULL,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (chatter_id) REFERENCES chatters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chatter_payouts (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      chatter_id        INTEGER,
      chatter_name      TEXT NOT NULL,
      total_sales       REAL NOT NULL,
      total_commission  REAL NOT NULL,
      sales_count       INTEGER NOT NULL,
      paid_by           TEXT NOT NULL,
      paid_at           TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chatter_shifts (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      chatter_id        INTEGER NOT NULL,
      chatter_name      TEXT NOT NULL,
      discord_user_id   TEXT,
      shift_type        TEXT NOT NULL,
      started_at        TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at          TEXT DEFAULT NULL,
      duration_minutes  INTEGER DEFAULT 0,
      is_late           INTEGER DEFAULT 0,
      late_minutes      INTEGER DEFAULT 0,
      FOREIGN KEY (chatter_id) REFERENCES chatters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chatter_strikes (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      chatter_id        INTEGER NOT NULL,
      chatter_name      TEXT NOT NULL,
      strike_type       TEXT NOT NULL, -- 'retard' ou 'absence'
      date              TEXT NOT NULL, -- YYYY-MM-DD
      details           TEXT,
      resolved          INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (chatter_id) REFERENCES chatters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chatter_penalties (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      chatter_id        INTEGER NOT NULL,
      chatter_name      TEXT NOT NULL,
      amount            REAL NOT NULL DEFAULT 1.0,
      reason            TEXT NOT NULL,
      is_paid           INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (chatter_id) REFERENCES chatters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chatter_absences (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      chatter_id        INTEGER NOT NULL,
      chatter_name      TEXT NOT NULL,
      date              TEXT NOT NULL, -- YYYY-MM-DD
      is_excused        INTEGER NOT NULL DEFAULT 0,
      excuse_note       TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (chatter_id) REFERENCES chatters(id) ON DELETE CASCADE
    );
  `);

  // Seeding initial des 7 chatters depuis la capture d'écran s'ils n'existent pas
  const countRow = db.prepare('SELECT COUNT(*) as count FROM chatters').get();
  if (countRow.count === 0) {
    const initialChatters = [
      { name: 'JoJo',      account: 'Kim', shift: 'Soir (20h-02h)',  rate: 15.0, target: 500.0, status: 'Actif', sale: 12.00,  comm: 1.80 },
      { name: 'Franck',    account: 'Kim', shift: 'Matin (08h-14h)', rate: 10.0, target: 500.0, status: 'Actif', sale: 65.25,  comm: 6.53 },
      { name: 'Roosevelt', account: 'Kim', shift: 'Matin (10h-18h)', rate: 12.0, target: 500.0, status: 'Actif', sale: 72.25,  comm: 8.67 },
      { name: 'Fiacre',    account: 'Kim', shift: 'Soir (18h-02h)',  rate: 10.0, target: 500.0, status: 'Repos', sale: 45.00,  comm: 4.50 },
      { name: 'light',     account: 'Kim', shift: 'Nuit (02h-10h)',  rate: 10.0, target: 500.0, status: 'Repos', sale: 259.00, comm: 25.90 },
      { name: 'Ester',     account: 'Kim', shift: 'Matin (10h-18h)', rate: 10.0, target: 500.0, status: 'Repos', sale: 46.00,  comm: 4.60 },
      { name: 'Moise',     account: 'Kim', shift: 'Week-end',        rate: 10.0, target: 500.0, status: 'Repos', sale: 0.0,    comm: 0.0 },
    ];

    const insertChatter = db.prepare(`
      INSERT INTO chatters (name, assigned_account, shift, commission_rate, sales_target, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertSale = db.prepare(`
      INSERT INTO chatter_sales (chatter_id, chatter_name, sub_name, ppv_name, amount, commission_rate, commission_earned, is_paid)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `);

    for (const c of initialChatters) {
      const res = insertChatter.run(c.name, c.account, c.shift, c.rate, c.target, c.status);
      const chatterId = res.lastInsertRowid;
      if (c.sale > 0) {
        insertSale.run(chatterId, c.name, 'Sub initial', 'PPV Initial', c.sale, c.rate, c.comm);
      }
    }
    console.log('✅ Chatters initiaux importés avec succès (7 chatters configurés).');
  }

  // Migration des colonnes pour le support des rôles et commissions d'équipe (Manager Chatter)
  try {
    db.exec(`ALTER TABLE chatters ADD COLUMN role TEXT NOT NULL DEFAULT 'Chatter'`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE chatters ADD COLUMN override_rate REAL NOT NULL DEFAULT 0.0`);
  } catch (e) {}

  ensureUrielManagerChatter();
}

function ensureUrielManagerChatter() {
  try {
    const uriel = db.prepare('SELECT * FROM chatters WHERE LOWER(name) = ?').get('uriel');
    if (!uriel) {
      db.prepare(`
        INSERT INTO chatters (name, assigned_account, shift, commission_rate, override_rate, role, sales_target, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('Uriel', 'Kim', 'Manager (Tous Shifts)', 12.0, 3.0, 'Manager Chatter', 1000.0, 'Actif');
      console.log('✅ Manager Chatter Uriel (12% perso / 3% équipe) initialisé.');
    } else {
      db.prepare(`
        UPDATE chatters 
        SET commission_rate = 12.0, override_rate = 3.0, role = 'Manager Chatter', status = 'Actif'
        WHERE id = ?
      `).run(uriel.id);
      console.log('✅ Manager Chatter Uriel (12% perso / 3% équipe) mis à jour.');
    }
  } catch (err) {
    console.error('⚠️ Erreur ensureUrielManagerChatter:', err.message);
  }
}

// ─── Fonctions CRUD Chatters ──────────────────────────────────────────────────
function getAllChatters() {
  return db.prepare('SELECT * FROM chatters ORDER BY name ASC').all();
}

function getChatterById(id) {
  return db.prepare('SELECT * FROM chatters WHERE id = ?').get(id);
}

function getChatterByDiscordId(discordUserId) {
  if (!discordUserId) return null;
  return db.prepare('SELECT * FROM chatters WHERE discord_user_id = ?').get(discordUserId);
}

function getChatterByName(name) {
  if (!name) return null;
  return db.prepare('SELECT * FROM chatters WHERE LOWER(name) = LOWER(?)').get(name.trim());
}

function addChatter({ name, discordUserId = null, assignedAccount = 'Kim', shift = 'Matin (08h-14h)', commissionRate = 10.0, salesTarget = 500.0, status = 'Actif' }) {
  const res = db.prepare(`
    INSERT INTO chatters (name, discord_user_id, assigned_account, shift, commission_rate, sales_target, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(name.trim(), discordUserId || null, assignedAccount.trim(), shift.trim(), Number(commissionRate) || 10.0, Number(salesTarget) || 500.0, status);
  return getChatterById(res.lastInsertRowid);
}

function updateChatterStatus(chatterId, status) {
  db.prepare('UPDATE chatters SET status = ? WHERE id = ?').run(status, chatterId);
  return getChatterById(chatterId);
}

function updateChatterShift(chatterId, shift) {
  db.prepare('UPDATE chatters SET shift = ? WHERE id = ?').run(shift, chatterId);
  return getChatterById(chatterId);
}

function updateChatterCommission(chatterId, rate) {
  db.prepare('UPDATE chatters SET commission_rate = ? WHERE id = ?').run(Number(rate), chatterId);
  return getChatterById(chatterId);
}

function linkChatterDiscord(chatterId, discordUserId) {
  db.prepare('UPDATE chatters SET discord_user_id = ? WHERE id = ?').run(discordUserId, chatterId);
  return getChatterById(chatterId);
}

function deleteChatter(chatterId) {
  const chatter = getChatterById(chatterId);
  if (!chatter) throw new Error('Chatter introuvable.');

  db.prepare('DELETE FROM chatter_sales WHERE chatter_id = ?').run(chatterId);
  db.prepare('DELETE FROM chatters WHERE id = ?').run(chatterId);

  return chatter;
}

// ─── Enregistrement d'une vente ───────────────────────────────────────────────
function recordSale({ chatterId, subName, ppvName, amount, discordUserId = null }) {
  const chatter = getChatterById(chatterId);
  if (!chatter) throw new Error('Chatter introuvable.');

  const saleAmount = Math.round(Number(amount) * 100) / 100;
  if (isNaN(saleAmount) || saleAmount <= 0) throw new Error('Montant invalide.');

  const rate = chatter.commission_rate || 10.0;
  const commission = Math.round((saleAmount * (rate / 100)) * 100) / 100;

  const res = db.prepare(`
    INSERT INTO chatter_sales (chatter_id, chatter_name, discord_user_id, sub_name, ppv_name, amount, commission_rate, commission_earned, is_paid)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    chatter.id,
    chatter.name,
    discordUserId || chatter.discord_user_id || null,
    subName.trim(),
    ppvName.trim(),
    saleAmount,
    rate,
    commission
  );

  // Commission override manager (ex: Uriel 3% sur toutes les ventes des chatters qu'il dirige)
  let managerCommissionEarned = 0;
  let managerName = null;

  try {
    const managers = db.prepare(`
      SELECT * FROM chatters 
      WHERE (role = 'Manager Chatter' OR override_rate > 0) 
        AND status = 'Actif'
        AND id != ?
    `).all(chatter.id);

    for (const mgr of managers) {
      const mgrRate = mgr.override_rate || 3.0;
      const mgrCommission = Math.round((saleAmount * (mgrRate / 100)) * 100) / 100;
      if (mgrCommission > 0) {
        db.prepare(`
          INSERT INTO chatter_sales (chatter_id, chatter_name, discord_user_id, sub_name, ppv_name, amount, commission_rate, commission_earned, is_paid)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
        `).run(
          mgr.id,
          mgr.name,
          mgr.discord_user_id || null,
          subName.trim(),
          `👔 Override Manager (${mgrRate}%) [${chatter.name}]`,
          saleAmount,
          mgrRate,
          mgrCommission
        );
        managerCommissionEarned += mgrCommission;
        managerName = mgr.name;
      }
    }
  } catch (err) {
    console.error('Erreur override manager chatter:', err.message);
  }

  return {
    saleId: res.lastInsertRowid,
    chatter,
    subName: subName.trim(),
    ppvName: ppvName.trim(),
    amount: saleAmount,
    commissionRate: rate,
    commissionEarned: commission,
    managerCommissionEarned,
    managerName,
  };
}

// ─── Statistiques d'un chatter ────────────────────────────────────────────────
function getChatterStats(chatterId) {
  const chatter = getChatterById(chatterId);
  if (!chatter) return null;

  const pending = db.prepare(`
    SELECT COUNT(*) as count,
           COALESCE(SUM(amount), 0) as total_sales,
           COALESCE(SUM(commission_earned), 0) as total_commission
    FROM chatter_sales
    WHERE chatter_id = ? AND is_paid = 0
  `).get(chatterId);

  const historical = db.prepare(`
    SELECT COUNT(*) as count,
           COALESCE(SUM(total_commission), 0) as total_paid
    FROM chatter_payouts
    WHERE chatter_id = ?
  `).get(chatterId);

  const pendingPenalties = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total_penalties,
           COUNT(*) as count
    FROM chatter_penalties
    WHERE chatter_id = ? AND is_paid = 0
  `).get(chatterId);

  const strikes = db.prepare(`
    SELECT COUNT(*) as count
    FROM chatter_strikes
    WHERE chatter_id = ? AND resolved = 0
  `).get(chatterId);

  const unexcused = db.prepare(`
    SELECT COUNT(*) as count
    FROM chatter_absences
    WHERE chatter_id = ? AND is_excused = 0
  `).get(chatterId);

  const grossCommission = Math.round(pending.total_commission * 100) / 100;
  const penaltyAmount = Math.round((pendingPenalties ? pendingPenalties.total_penalties : 0) * 100) / 100;
  const netCommission = Math.max(0, Math.round((grossCommission - penaltyAmount) * 100) / 100);

  const progress = chatter.sales_target > 0 ? (pending.total_sales / chatter.sales_target) * 100 : 0;

  return {
    chatter,
    pendingSalesCount: pending.count,
    pendingTotalSales: Math.round(pending.total_sales * 100) / 100,
    grossCommission,
    penaltyAmount,
    pendingTotalCommission: netCommission,
    strikeCount: strikes ? strikes.count : 0,
    unexcusedDays: unexcused ? unexcused.count : 0,
    historicalTotalPaid: Math.round(historical.total_paid * 100) / 100,
    progress: Math.min(progress, 100),
    target: chatter.sales_target,
  };
}

// ─── Tableau de bord global (Données style Google Sheets) ─────────────────────
function getGlobalDashboardData() {
  const chatters = getAllChatters();
  const chatterList = [];

  let grandTotalSales = 0;
  let grandTotalCommission = 0;
  let activeShiftCount = 0;

  for (const c of chatters) {
    const stats = getChatterStats(c.id);
    grandTotalSales += stats.pendingTotalSales;
    grandTotalCommission += stats.pendingTotalCommission;
    if (c.status.toLowerCase() === 'actif') activeShiftCount++;

    chatterList.push({
      id: c.id,
      name: c.name,
      role: c.role || 'Chatter',
      overrideRate: c.override_rate || 0.0,
      discordUserId: c.discord_user_id,
      account: c.assigned_account,
      shift: c.shift,
      status: c.status,
      rate: c.commission_rate,
      target: c.sales_target,
      sales: stats.pendingTotalSales,
      commission: stats.pendingTotalCommission,
      salesCount: stats.pendingSalesCount,
      progress: stats.progress,
    });
  }

  // Tri par montant des ventes décroissant
  chatterList.sort((a, b) => b.sales - a.sales);

  return {
    totalChatters: chatters.length,
    activeShiftCount,
    grandTotalSales: Math.round(grandTotalSales * 100) / 100,
    grandTotalCommission: Math.round(grandTotalCommission * 100) / 100,
    averageRate: grandTotalSales > 0 ? Math.round((grandTotalCommission / grandTotalSales) * 1000) / 10 : 10.0,
    chatterList,
  };
}

// ─── Validation des paiements (Cycle de 2 semaines) ───────────────────────────
function processChatterPayout(chatterId, paidBy = 'Fondateur') {
  const chatter = getChatterById(chatterId);
  if (!chatter) throw new Error('Chatter introuvable.');

  const stats = getChatterStats(chatterId);
  if (stats.pendingTotalCommission <= 0) {
    return { success: false, message: 'Aucune commission en attente de paiement pour ce chatter.' };
  }

  const payoutRes = db.prepare(`
    INSERT INTO chatter_payouts (chatter_id, chatter_name, total_sales, total_commission, sales_count, paid_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(chatter.id, chatter.name, stats.pendingTotalSales, stats.pendingTotalCommission, stats.pendingSalesCount, paidBy);

  const payoutId = payoutRes.lastInsertRowid;

  // Marquer toutes les ventes comme payées
  db.prepare(`
    UPDATE chatter_sales
    SET is_paid = 1, payout_id = ?
    WHERE chatter_id = ? AND is_paid = 0
  `).run(payoutId, chatter.id);

  // Clôturer les pénalités et réinitialiser les avertissements pour le nouveau cycle
  db.prepare('UPDATE chatter_penalties SET is_paid = 1 WHERE chatter_id = ? AND is_paid = 0').run(chatter.id);
  db.prepare('UPDATE chatter_strikes SET resolved = 1 WHERE chatter_id = ? AND resolved = 0').run(chatter.id);

  return {
    success: true,
    chatterName: chatter.name,
    amount: stats.pendingTotalCommission,
    salesCount: stats.pendingSalesCount,
    totalSales: stats.pendingTotalSales,
    payoutId,
  };
}

function processAllChatterPayouts(paidBy = 'Fondateur') {
  const chatters = getAllChatters();
  const paidList = [];

  for (const c of chatters) {
    const stats = getChatterStats(c.id);
    if (stats.pendingTotalCommission > 0) {
      const res = processChatterPayout(c.id, paidBy);
      if (res.success) {
        paidList.push(res);
      }
    }
  }

  return paidList;
}

// ─── Helpers visuels (Barre de progression) ──────────────────────────────────
function renderProgressBar(percentage, size = 10) {
  const filled = Math.min(Math.max(Math.round((percentage / 100) * size), 0), size);
  const empty = size - filled;
  return '`[' + '█'.repeat(filled) + '░'.repeat(empty) + ']`';
}

// ─── Gestion des Shifts & Pointages ──────────────────────────────────────────
function parseShiftHours(shiftStr) {
  if (!shiftStr) return null;
  const matches = [...shiftStr.matchAll(/(\d{1,2})h(?:(\d{2}))?/gi)];
  if (matches.length >= 2) {
    const startHour = parseInt(matches[0][1], 10);
    const startMinute = matches[0][2] ? parseInt(matches[0][2], 10) : 0;
    const endHour = parseInt(matches[1][1], 10);
    const endMinute = matches[1][2] ? parseInt(matches[1][2], 10) : 0;
    return { startHour, startMinute, endHour, endMinute };
  }
  return null;
}

function clockInChatter(chatterId, discordUserId = null) {
  const chatter = getChatterById(chatterId);
  if (!chatter) throw new Error('Chatter introuvable.');

  const openShift = db.prepare('SELECT * FROM chatter_shifts WHERE chatter_id = ? AND ended_at IS NULL').get(chatter.id);
  if (openShift) {
    return { success: false, alreadyActive: true, shift: openShift, chatter };
  }

  let isLate = 0;
  let lateMinutes = 0;
  const shiftHours = parseShiftHours(chatter.shift);

  if (shiftHours) {
    const nowParis = new Date();
    const parts = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(nowParis);

    const curHour = parseInt(parts.find(p => p.type === 'hour')?.value, 10);
    const curMinute = parseInt(parts.find(p => p.type === 'minute')?.value, 10);

    const curTotalMins = curHour * 60 + curMinute;
    const schedStartMins = shiftHours.startHour * 60 + shiftHours.startMinute;

    if (curTotalMins > schedStartMins + 5) {
      isLate = 1;
      lateMinutes = curTotalMins - schedStartMins;
    }
  }

  updateChatterStatus(chatter.id, 'Actif');
  if (discordUserId && !chatter.discord_user_id) {
    linkChatterDiscord(chatter.id, discordUserId);
  }

  const res = db.prepare(`
    INSERT INTO chatter_shifts (chatter_id, chatter_name, discord_user_id, shift_type, started_at, is_late, late_minutes)
    VALUES (?, ?, ?, ?, datetime('now'), ?, ?)
  `).run(chatter.id, chatter.name, discordUserId || chatter.discord_user_id || null, chatter.shift, isLate, lateMinutes);

  return {
    success: true,
    alreadyActive: false,
    shiftId: res.lastInsertRowid,
    chatter: getChatterById(chatter.id),
    isLate: isLate === 1,
    lateMinutes,
  };
}

function clockOutChatter(chatterId) {
  const chatter = getChatterById(chatterId);
  if (!chatter) throw new Error('Chatter introuvable.');

  const openShift = db.prepare('SELECT * FROM chatter_shifts WHERE chatter_id = ? AND ended_at IS NULL ORDER BY id DESC LIMIT 1').get(chatter.id);
  updateChatterStatus(chatter.id, 'Repos');

  let durationMinutes = 0;
  let salesDuringShift = 0;
  let commDuringShift = 0;
  let salesCount = 0;

  if (openShift) {
    const diffRes = db.prepare(`
      SELECT CAST((strftime('%s', 'now') - strftime('%s', started_at)) / 60 AS INTEGER) as diff_mins
      FROM chatter_shifts WHERE id = ?
    `).get(openShift.id);
    durationMinutes = diffRes ? Math.max(0, diffRes.diff_mins) : 0;

    const salesData = db.prepare(`
      SELECT COUNT(*) as count,
             COALESCE(SUM(amount), 0) as total_sales,
             COALESCE(SUM(commission_earned), 0) as total_comm
      FROM chatter_sales
      WHERE chatter_id = ? AND created_at >= ?
    `).get(chatter.id, openShift.started_at);

    salesCount = salesData ? salesData.count : 0;
    salesDuringShift = salesData ? Math.round(salesData.total_sales * 100) / 100 : 0;
    commDuringShift = salesData ? Math.round(salesData.total_comm * 100) / 100 : 0;

    db.prepare(`
      UPDATE chatter_shifts
      SET ended_at = datetime('now'), duration_minutes = ?
      WHERE id = ?
    `).run(durationMinutes, openShift.id);
  }

  return {
    success: true,
    shift: openShift,
    chatter: getChatterById(chatter.id),
    durationMinutes,
    salesCount,
    salesDuringShift,
    commDuringShift,
  };
}

async function postShiftStartNotification(client, shiftResult) {
  const { chatter, isLate, lateMinutes } = shiftResult;
  const nowParis = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date());

  const chatterMention = chatter.discord_user_id ? `<@${chatter.discord_user_id}>` : `**${chatter.name}**`;

  const embed = new EmbedBuilder()
    .setColor(isLate ? 0xffaa00 : 0x00ff88)
    .setTitle(isLate ? '⚠️ PRISE DE SHIFT AVEC RETARD' : '🟢 NOUVELLE PRISE DE SHIFT')
    .addFields(
      { name: '👤 Chatter', value: `${chatterMention} (**${chatter.name}**)`, inline: true },
      { name: '💼 Compte Assigné', value: `\`${chatter.assigned_account}\``, inline: true },
      { name: '⏱️ Shift Prévu', value: `\`${chatter.shift}\``, inline: true },
      { name: '⏰ Heure de Pointage', value: `\`${nowParis}\``, inline: true },
      { name: '📌 Ponctualité', value: isLate ? `⚠️ **Retard de ${lateMinutes} min**` : '✅ **À l\'heure**', inline: true }
    )
    .setFooter({ text: 'AVA Agency • Pointage en direct' })
    .setTimestamp();

  // 1. Salon côté Chatter (#pointage 1553741516462362794)
  const chatterChannelId = process.env.CHANNEL_CHATTER_SHIFT_CHATTER || '1553741516462362794';
  const chChannel = await client.channels.fetch(chatterChannelId).catch(() => null);
  if (chChannel) await chChannel.send({ embeds: [embed] }).catch(() => {});

  // 2. Salon côté Fondateur (#pointage-de-chatter 1565378486619865270)
  const founderChannelId = process.env.CHANNEL_CHATTER_SHIFT_FOUNDER || '1565378486619865270';
  const fChannel = await client.channels.fetch(founderChannelId).catch(() => null);
  if (fChannel) await fChannel.send({ embeds: [embed] }).catch(() => {});
}

async function postShiftEndNotification(client, shiftResult) {
  const { chatter, durationMinutes, salesCount, salesDuringShift, commDuringShift } = shiftResult;
  const hours = Math.floor(durationMinutes / 60);
  const mins = durationMinutes % 60;
  const durationStr = `${hours}h ${String(mins).padStart(2, '0')}min`;

  const chatterMention = chatter.discord_user_id ? `<@${chatter.discord_user_id}>` : `**${chatter.name}**`;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🔴 FIN DE SHIFT ENREGISTRÉE')
    .addFields(
      { name: '👤 Chatter', value: `${chatterMention} (**${chatter.name}**)`, inline: true },
      { name: '💼 Compte', value: `\`${chatter.assigned_account}\``, inline: true },
      { name: '⏱️ Shift', value: `\`${chatter.shift}\``, inline: true },
      { name: '⌛ Durée Effective', value: `\`${durationStr}\``, inline: true },
      { name: '💵 Ventes du Shift', value: `**$${salesDuringShift.toFixed(2)}** (${salesCount} vente(s))`, inline: true },
      { name: '💎 Commissions Gagnées', value: `**+$${commDuringShift.toFixed(2)}**`, inline: true }
    )
    .setFooter({ text: 'AVA Agency • Fin de Service' })
    .setTimestamp();

  // 1. Salon côté Chatter (#pointage 1553741516462362794)
  const chatterChannelId = process.env.CHANNEL_CHATTER_SHIFT_CHATTER || '1553741516462362794';
  const chChannel = await client.channels.fetch(chatterChannelId).catch(() => null);
  if (chChannel) await chChannel.send({ embeds: [embed] }).catch(() => {});

  // 2. Salon côté Fondateur (#pointage-de-chatter 1565378486619865270)
  const founderChannelId = process.env.CHANNEL_CHATTER_SHIFT_FOUNDER || '1565378486619865270';
  const fChannel = await client.channels.fetch(founderChannelId).catch(() => null);
  if (fChannel) await fChannel.send({ embeds: [embed] }).catch(() => {});
}

async function recordChatterStrike(client, chatterId, strikeType, details = '') {
  const chatter = getChatterById(chatterId);
  if (!chatter) return null;

  const todayStr = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const existing = db.prepare(`
    SELECT * FROM chatter_strikes
    WHERE chatter_id = ? AND strike_type = ? AND date = ?
  `).get(chatter.id, strikeType, todayStr);

  if (existing) return null;

  db.prepare(`
    INSERT INTO chatter_strikes (chatter_id, chatter_name, strike_type, date, details, resolved)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(chatter.id, chatter.name, strikeType, todayStr, details);

  const strikesRow = db.prepare('SELECT COUNT(*) as count FROM chatter_strikes WHERE chatter_id = ? AND resolved = 0').get(chatter.id);
  const strikeCount = strikesRow ? strikesRow.count : 1;

  let penaltyApplied = false;
  if (strikeCount > 3) {
    db.prepare(`
      INSERT INTO chatter_penalties (chatter_id, chatter_name, amount, reason)
      VALUES (?, ?, 1.0, ?)
    `).run(chatter.id, chatter.name, `Pénalité automatique : ${strikeCount} avertissements cumulés (${details})`);
    penaltyApplied = true;
  }

  const chatterMention = chatter.discord_user_id ? `<@${chatter.discord_user_id}>` : `**${chatter.name}**`;

  // 1. Salon côté Chatter (#discussion 1567216877682298890)
  const warningChannelId = process.env.CHANNEL_CHATTER_WARNINGS_CHATTER || '1567216877682298890';
  const warnChannel = await client.channels.fetch(warningChannelId).catch(() => null);
  if (warnChannel) {
    const warnEmbed = new EmbedBuilder()
      .setColor(penaltyApplied ? 0xff0000 : 0xffaa00)
      .setTitle(`⚠️ AVERTISSEMENT DISCIPLINAIRE — ${chatter.name.toUpperCase()}`)
      .setDescription(
        `Bonjour ${chatterMention},\n\n` +
        `Votre shift prévu (**${chatter.shift}**) n'a pas été respecté : **${details}**.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📊 **Total Avertissements actifs :** \`${strikeCount} / 3\`\n` +
        (penaltyApplied
          ? `⛔ **SANCTION APPLIQUÉE :** Vous avez dépassé la limite de 3 avertissements. **Une pénalité de 1.00$ a été automatiquement déduite de vos commissions.**\n`
          : `ℹ️ *Attention : À partir du 4ème avertissement, 1.00$ sera automatiquement déduit de vos revenus à chaque récidive.*\n`) +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👉 Rendez-vous immédiatement dans <#${process.env.CHANNEL_CHATTER_SHIFT_CHATTER || '1553741516462362794'}> pour pointer !`
      )
      .setFooter({ text: 'AVA Agency • Discipline & Respect des Horaires' })
      .setTimestamp();

    await warnChannel.send({
      content: `${chatterMention} ⚠️ **Avertissement de retard / absence pour votre shift !**`,
      allowedMentions: { users: chatter.discord_user_id ? [chatter.discord_user_id] : [] },
      embeds: [warnEmbed],
    }).catch(() => {});
  }

  // 2. Salon côté Fondateur (#discussion 1551866760418820117)
  const sanctionsChannelId = process.env.CHANNEL_CHATTER_SANCTIONS_FOUNDER || '1551866760418820117';
  const sChannel = await client.channels.fetch(sanctionsChannelId).catch(() => null);
  if (sChannel) {
    const adminEmbed = new EmbedBuilder()
      .setColor(penaltyApplied ? 0xff0000 : 0xffaa00)
      .setTitle(`🚨 ALERTE RETARD / ABSENCE — CHATTER`)
      .setDescription(
        `👤 **Chatter :** **${chatter.name}** (${chatterMention})\n` +
        `💼 **Compte :** \`${chatter.assigned_account}\`\n` +
        `⏱️ **Shift :** \`${chatter.shift}\`\n` +
        `⚠️ **Motif :** ${details}\n` +
        `📈 **Avertissements cumulés :** \`${strikeCount}\`\n` +
        (penaltyApplied ? `💰 **Déduction appliquée :** \`-1.00$\` sur les commissions du chatter.` : `ℹ️ Aucun prélèvement pour le moment (< 4 avertissements).`)
      )
      .setFooter({ text: 'AVA Agency • Surveillance Fondateurs' })
      .setTimestamp();

    await sChannel.send({ embeds: [adminEmbed] }).catch(() => {});
  }

  return { strikeCount, penaltyApplied };
}

async function recordChatterAbsence(client, chatterId, excuseNote = null) {
  const chatter = getChatterById(chatterId);
  if (!chatter) return null;

  const todayStr = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const isExcused = excuseNote ? 1 : 0;
  db.prepare(`
    INSERT INTO chatter_absences (chatter_id, chatter_name, date, is_excused, excuse_note)
    VALUES (?, ?, ?, ?, ?)
  `).run(chatter.id, chatter.name, todayStr, isExcused, excuseNote || null);

  if (isExcused) {
    return { consecutiveUnexcused: 0, fired: false };
  }

  const absences = db.prepare(`
    SELECT * FROM chatter_absences
    WHERE chatter_id = ?
    ORDER BY date DESC
    LIMIT 10
  `).all(chatter.id);

  let consecutive = 0;
  for (const a of absences) {
    if (a.is_excused === 0) {
      consecutive++;
    } else {
      break;
    }
  }

  let fired = false;
  const chatterMention = chatter.discord_user_id ? `<@${chatter.discord_user_id}>` : `**${chatter.name}**`;

  if (consecutive >= 5) {
    updateChatterStatus(chatter.id, 'Viré');
    fired = true;

    const sChannelId = process.env.CHANNEL_CHATTER_SANCTIONS_FOUNDER || '1551866760418820117';
    const sChannel = await client.channels.fetch(sChannelId).catch(() => null);
    if (sChannel) {
      const firedEmbed = new EmbedBuilder()
        .setColor(0x8b0000)
        .setTitle('🚫 RENVOI DÉFINITIF D\'UN CHATTER')
        .setDescription(
          `Le chatter **${chatter.name}** (${chatterMention}) a accumulé **5 jours consécutifs d'absence sans excuse**.\n\n` +
          `Conformément au règlement de l'agence AVA, son profil a été automatiquement **désactivé et exclu** de l'équipe active.`
        )
        .setTimestamp();
      await sChannel.send({ embeds: [firedEmbed] }).catch(() => {});
    }

    const wChannelId = process.env.CHANNEL_CHATTER_WARNINGS_CHATTER || '1567216877682298890';
    const wChannel = await client.channels.fetch(wChannelId).catch(() => null);
    if (wChannel) {
      await wChannel.send({
        content: `🚫 ${chatterMention} **Votre profil a été définitivement retiré de l'équipe pour 5 jours consécutifs d'absence sans excuse.**`,
      }).catch(() => {});
    }
  } else {
    // Alerte pour les absences quotidiennes (< 5 jours)
    const wChannelId = process.env.CHANNEL_CHATTER_WARNINGS_CHATTER || '1567216877682298890';
    const wChannel = await client.channels.fetch(wChannelId).catch(() => null);
    if (wChannel) {
      const absentEmbed = new EmbedBuilder()
        .setColor(0xff5500)
        .setTitle(`📅 ABSENCE CONSTATÉE — ${chatter.name.toUpperCase()}`)
        .setDescription(
          `Bonjour ${chatterMention},\n\n` +
          `Vous n'avez effectué aucun pointage pour votre shift (**${chatter.shift}**) en date du **${todayStr}**.\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `⚠️ **Absences consécutives sans excuse :** \`${consecutive} / 5 jours\`\n` +
          `> ⛔ *Rappel du règlement : Au bout de 5 jours consécutifs d'absence sans justificatif, vous serez automatiquement et définitivement exclu de l'agence.*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `Si vous avez un motif valable, contactez immédiatement l'équipe fondatrice.`
        )
        .setFooter({ text: 'AVA Agency • Suivi des Absences' })
        .setTimestamp();

      await wChannel.send({
        content: `${chatterMention} ⚠️ **Avis d'absence non justifiée enregistré !**`,
        allowedMentions: { users: chatter.discord_user_id ? [chatter.discord_user_id] : [] },
        embeds: [absentEmbed],
      }).catch(() => {});
    }

    const sChannelId = process.env.CHANNEL_CHATTER_SANCTIONS_FOUNDER || '1551866760418820117';
    const sChannel = await client.channels.fetch(sChannelId).catch(() => null);
    if (sChannel) {
      const adminAbsentEmbed = new EmbedBuilder()
        .setColor(0xff5500)
        .setTitle('⚠️ ABSENCE DU JOUR — CHATTER')
        .setDescription(
          `👤 **Chatter :** **${chatter.name}** (${chatterMention})\n` +
          `⏱️ **Shift :** \`${chatter.shift}\` (Compte : \`${chatter.assigned_account}\`)\n` +
          `📅 **Date :** \`${todayStr}\`\n` +
          `📈 **Absences consécutives :** \`${consecutive} / 5\` sans excuse\n` +
          `ℹ️ Pour justifier cette absence, utilisez \`/chatter excuse nom:${chatter.name} motif:...\``
        )
        .setFooter({ text: 'AVA Agency • Surveillance Fondateurs' })
        .setTimestamp();

      await sChannel.send({ embeds: [adminAbsentEmbed] }).catch(() => {});
    }
  }

  return { consecutiveUnexcused: consecutive, fired };
}

async function setupChatterPointageChannel(client) {
  const channelId = process.env.CHANNEL_CHATTER_SHIFT_CHATTER || '1553741516462362794';
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (messages) {
    const oldList = messages.filter(m => m.author.id === client.user.id && m.embeds.length > 0 && m.embeds[0]?.title?.includes('ESPACE POINTAGE'));
    for (const [, oldMsg] of oldList) {
      await oldMsg.delete().catch(() => {});
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0x00ff88)
    .setTitle('⏱️ ESPACE POINTAGE DES SHIFTS — CHATTERS')
    .setDescription(
      `👋 **Bienvenue sur votre espace de pointage AVA Agency !**\n\n` +
      `Le pointage est **obligatoire** à chaque début et fin de service.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📌 **RÈGLES IMPORTANTES & POLICE DES SHIFTS :**\n` +
      `• Cliquez sur **🟢 Prise de Shift** dès votre arrivée sur le compte.\n` +
      `• Cliquez sur **🔴 Fin de Shift** dès que vous quittez votre poste.\n` +
      `• ⚠️ **Retard :** Plus de 15 minutes de retard sans justification = **Avertissement automatique**.\n` +
      `• ⛔ **Pénalité :** Au bout de **3 avertissements**, **1.00$** sera automatiquement déduit de vos commissions !\n` +
      `• 🚫 **Absence injustifiée :** 5 jours consécutifs d'absence sans excuse = **Renvoi définitif** de l'agence.\n` +
      `• 💰 **Déclaration des Ventes :** Toute vente ou PPV non déclarée dans <#${process.env.CHANNEL_CHATTER_REVENU || '1524736963477901415'}> ne sera **pas comptabilisée** lors du paiement !\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .addFields(
      { name: '📍 Salon des Ventes', value: `<#${process.env.CHANNEL_CHATTER_REVENU || '1524736963477901415'}>`, inline: true },
      { name: '💳 Fréquence des Paies', value: 'Tous les 14 jours (bimensuel)', inline: true }
    )
    .setFooter({ text: 'AVA Agency • Gestion des Shifts & Pointage' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('chatter_btn_clock_in').setLabel('🟢 Prise de Shift').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('chatter_btn_clock_out').setLabel('🔴 Fin de Shift').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('chatter_btn_my_stats').setLabel('📊 Mon Statut & Gains').setStyle(ButtonStyle.Secondary)
  );

  await channel.send({ embeds: [embed], components: [row] });
  console.log('✅ Panneau Chatter Pointage publié dans #pointage');
}

// ─── Mise à jour du salon 1 : #💰revenu (Chatters) ───────────────────────────
async function setupChatterRevenuChannel(client) {
  const channelId = process.env.CHANNEL_CHATTER_REVENU || '1524736963477901415';
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  // Purger les anciens messages du bot
  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (messages) {
    const oldList = messages.filter(m => m.author.id === client.user.id);
    for (const [, oldMsg] of oldList) {
      await oldMsg.delete().catch(() => {});
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0x00ff88)
    .setTitle('💸 DÉCLARATION DES VENTES — CHATTERS')
    .setDescription(
      `👋 **Bienvenue sur votre espace de déclaration de ventes !**\n\n` +
      `À chaque vente PPV, pourboire ou contenu exclusif conclu avec un sub, enregistrez-la immédiatement via le bouton ci-dessous pour sécuriser votre commission.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📌 **Comment déclarer une vente :**\n` +
      `1. Clique sur **💰 Déclarer une vente**.\n` +
      `2. Renseigne le pseudo du Sub, le montant exact en \$ et le nom du média PPV.\n` +
      `3. Ta commission est calculée instantanément et ajoutée à ton cumul en attente de virement !\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .addFields(
      { name: '⏱️ Créneaux & Shifts', value: 'N\'oublie pas de basculer en `Actif` quand tu commences à chatter.', inline: true },
      { name: '💳 Fréquence des Paies', value: 'Tous les règlements sont effectués toutes les 2 semaines.', inline: true }
    )
    .setFooter({ text: 'AVA Agency • Espace Chatters' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('chatter_btn_declare_sale').setLabel('💰 Déclarer une vente').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('chatter_btn_my_stats').setLabel('📊 Mes Ventes & Commissions').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('chatter_btn_toggle_shift').setLabel('🔄 Prise / Fin de Shift').setStyle(ButtonStyle.Primary)
  );

  await channel.send({ embeds: [embed], components: [row] });
  console.log('✅ Panneau Chatter Ventes publié dans #💰revenu');
}

// ─── Mise à jour du salon 3 : #ajoute-de-chatter (Administration Fondateurs) ──
async function setupChatterAdminChannel(client) {
  const channelId = process.env.CHANNEL_CHATTER_FOUNDER_ADMIN || '1565370538845667328';
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  // Purger les anciens messages du bot
  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (messages) {
    const oldList = messages.filter(m => m.author.id === client.user.id);
    for (const [, oldMsg] of oldList) {
      await oldMsg.delete().catch(() => {});
    }
  }

  const dash = getGlobalDashboardData();

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('👑 GESTION & PAIES DES CHATTERS — FONDATEURS')
    .setDescription(
      `Espace d'administration central réservé aux fondateurs pour superviser l'équipe, ajouter de nouveaux chatters et effectuer les virements des 2 semaines.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📊 **INDICATEURS EN COURS (CYCLE ACTUEL) :**\n` +
      `👥 **Total Chatters :** \`${dash.totalChatters}\`\n` +
      `🔥 **En Shift / Actifs :** \`${dash.activeShiftCount}\`\n` +
      `📈 **Total Ventes Réalisées :** \`$${dash.grandTotalSales.toFixed(2)}\`\n` +
      `💎 **Total Commissions Dues :** \`$${dash.grandTotalCommission.toFixed(2)}\`\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .setFooter({ text: 'AVA Agency • Administration Chatters' })
    .setTimestamp();

  // Tableau récapitulatif textuel
  let listText = '';
  for (const c of dash.chatterList) {
    const statusEmoji = c.status.toLowerCase() === 'actif' ? '🟢 `Actif`' : '⚪ `Repos`';
    const isMgr = c.role === 'Manager Chatter';
    const title = isMgr ? `👔 **${c.name} (Manager)**` : `**${c.name}**`;
    const rateText = isMgr ? `${c.rate}% perso · ${c.overrideRate || 3}% équipe` : `${c.rate}%`;
    listText += `• ${title} (${c.account} · *${c.shift}*) : **\$${c.sales.toFixed(2)}** ventes $\\rightarrow$ **\$${c.commission.toFixed(2)}** dû (${rateText}) — ${statusEmoji}\n`;
  }

  if (listText) {
    embed.addFields({ name: '📋 Performance par Chatter', value: listText.slice(0, 1024) });
  }

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('chatter_admin_add_btn').setLabel('➕ Ajouter un Chatter').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('chatter_admin_toggle_btn').setLabel('⚡ Basculer Actif / Repos').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('chatter_admin_edit_btn').setLabel('✏️ Modifier Shift / Taux').setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('chatter_admin_dashboard_btn').setLabel('📊 Tableau de Bord Live').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('chatter_admin_delete_btn').setLabel('🗑️ Supprimer un Chatter').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('chatter_admin_payout_btn').setLabel('💳 Valider la Paie (2 semaines)').setStyle(ButtonStyle.Primary)
  );

  await channel.send({ embeds: [embed], components: [row1, row2] });
  console.log('✅ Panneau Chatter Administration publié dans #ajoute-de-chatter');
}

// ─── Notification Vente dans Salon 2 : #revenue-des-chatteur ─────────────────
async function postSaleNotification(client, saleData) {
  const channelId = process.env.CHANNEL_CHATTER_FOUNDER_SALES || '1565370727740342282';
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const { chatter, subName, ppvName, amount, commissionRate, commissionEarned } = saleData;
  const stats = getChatterStats(chatter.id);
  const progressBar = renderProgressBar(stats.progress, 8);
  const agencyShare = Math.round((amount - commissionEarned) * 100) / 100;
  const agencyRate = Math.round((100 - commissionRate) * 10) / 10;
  const previousCommission = Math.max(0, Math.round((stats.pendingTotalCommission - commissionEarned) * 100) / 100);

  const embed = new EmbedBuilder()
    .setColor(0x00ff88)
    .setTitle('🔔 NOUVELLE VENTE DÉCLARÉE !')
    .addFields(
      { name: '👤 Chatter', value: `**${chatter.name}**\n*Compte: ${chatter.assigned_account} · ${chatter.shift}*`, inline: true },
      { name: '👤 Sub / Fan', value: `\`${subName}\``, inline: true },
      { name: '🎬 PPV / Média', value: `\`${ppvName}\``, inline: true },
      { name: '💵 Montant Brut Vente', value: `**$${amount.toFixed(2)}**`, inline: true },
      { name: '📊 Taux Commission', value: `**${commissionRate}%**`, inline: true },
      { name: '💎 Commission Chatter', value: `**+$${commissionEarned.toFixed(2)}**`, inline: true }
    );

  if (saleData.managerCommissionEarned > 0) {
    embed.addFields({
      name: `👔 Commission Manager (${saleData.managerName || 'Uriel'})`,
      value: `**+$${saleData.managerCommissionEarned.toFixed(2)}** *(3% override sur l'équipe)*`,
      inline: true,
    });
  }

  embed.addFields(
    {
      name: '🧮 Détail des Calculs Directs',
      value: `• **Calcul Commission :** \`$${amount.toFixed(2)} × ${commissionRate}% = +$${commissionEarned.toFixed(2)}\`\n` +
             (saleData.managerCommissionEarned > 0 ? `• **Override Manager (${saleData.managerName || 'Uriel'}) :** \`+$${saleData.managerCommissionEarned.toFixed(2)}\` (3%)\n` : '') +
             `• **Part Nette Agence :** \`$${amount.toFixed(2)} - $${(commissionEarned + (saleData.managerCommissionEarned || 0)).toFixed(2)} = $${(agencyShare - (saleData.managerCommissionEarned || 0)).toFixed(2)}\`\n` +
             `• **Progression Cumul :** \`$${previousCommission.toFixed(2)} → $${stats.pendingTotalCommission.toFixed(2)}\``,
      inline: false,
    },
    {
      name: '📈 Total Cumulé en attente (Cycle 2 sem.)',
      value: `**$${stats.pendingTotalCommission.toFixed(2)}** *(sur $${stats.pendingTotalSales.toFixed(2)} de ventes — ${stats.pendingSalesCount} vente(s))*`,
      inline: false,
    },
    {
      name: `🎯 Objectif ($${chatter.sales_target.toFixed(2)})`,
      value: `${progressBar} **${stats.progress.toFixed(1)}%**`,
      inline: false,
    }
  );

  embed.setFooter({ text: 'AVA Agency • Suivi des Ventes en Direct' })
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

// ─── Rapport Quotidien des Ventes (Salon Dédié avec @everyone) ───────────────
function getDailySalesData(targetDateStr = null) {
  const parisFormatter = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dateStr = targetDateStr || parisFormatter.format(new Date());

  const allChatters = getAllChatters();
  const sales = db.prepare(`
    SELECT * FROM chatter_sales
    WHERE date(created_at, 'localtime') = ? OR created_at LIKE ?
    ORDER BY id ASC
  `).all(dateStr, `${dateStr}%`);

  let todayGrandTotalSales = 0;
  let todayGrandTotalCommission = 0;
  const chatterReportMap = {};

  for (const c of allChatters) {
    chatterReportMap[c.id] = {
      chatter: c,
      salesCount: 0,
      totalSales: 0,
      totalCommission: 0,
      salesDetails: [],
    };
  }

  for (const s of sales) {
    todayGrandTotalSales += s.amount;
    todayGrandTotalCommission += s.commission_earned;

    if (!chatterReportMap[s.chatter_id]) {
      chatterReportMap[s.chatter_id] = {
        chatter: { name: s.chatter_name, assigned_account: 'Kim', shift: '-', commission_rate: s.commission_rate, status: 'Inconnu' },
        salesCount: 0,
        totalSales: 0,
        totalCommission: 0,
        salesDetails: [],
      };
    }

    const item = chatterReportMap[s.chatter_id];
    item.salesCount++;
    item.totalSales += s.amount;
    item.totalCommission += s.commission_earned;
    item.salesDetails.push({
      sub: s.sub_name,
      ppv: s.ppv_name,
      amount: s.amount,
      commission: s.commission_earned,
    });
  }

  const chatterList = Object.values(chatterReportMap);
  // Trier par montant des ventes du jour décroissant
  chatterList.sort((a, b) => b.totalSales - a.totalSales);

  const mvp = chatterList.length > 0 && chatterList[0].totalSales > 0 ? chatterList[0] : null;
  const globalCycle = getGlobalDashboardData();

  return {
    dateStr,
    todayGrandTotalSales: Math.round(todayGrandTotalSales * 100) / 100,
    todayGrandTotalCommission: Math.round(todayGrandTotalCommission * 100) / 100,
    todayTotalSalesCount: sales.length,
    mvp,
    chatterList,
    globalCycle,
  };
}

async function sendDailyChatterSalesReport(client, targetDateStr = null, forcedChannelId = null) {
  const targetChannelIds = forcedChannelId
    ? [forcedChannelId]
    : [
        process.env.CHANNEL_CHATTER_DAILY_REPORT || '1565373809337311242',
        process.env.CHANNEL_CHATTER_FOUNDER_SALES || '1565370727740342282',
      ];

  const data = getDailySalesData(targetDateStr);

  const dateObj = new Date(data.dateStr + 'T12:00:00Z');
  const dateFormatted = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Europe/Paris',
  }).format(dateObj);
  const capitalizedDate = dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1);

  // 1. Embed En-tête & Chiffres Clés du Jour
  const headerEmbed = new EmbedBuilder()
    .setColor(0x00ff88)
    .setTitle(`📊 BILAN DU JOUR — VENTES DU ${capitalizedDate.toUpperCase()}`)
    .setDescription(
      `Voici le rapport complet des performances de l'équipe pour la journée !\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💵 **Chiffre d'Affaires du Jour :** \`$${data.todayGrandTotalSales.toFixed(2)}\`\n` +
      `💎 **Commissions Générées Aujourd'hui :** \`$${data.todayGrandTotalCommission.toFixed(2)}\`\n` +
      `🎯 **Nombre de Ventes Conclues :** \`${data.todayTotalSalesCount}\`\n` +
      (data.mvp ? `🏆 **MVP du Jour :** **${data.mvp.chatter.name}** avec **\$${data.mvp.totalSales.toFixed(2)}** de ventes ! 🥇\n` : `ℹ️ *Aucune vente enregistrée pour cette journée.*\n`) +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .setTimestamp();

  // 2. Embed Tableau Récapitulatif par Chatter
  let chatterRowsText = '';
  for (const c of data.chatterList) {
    const stats = getChatterStats(c.chatter.id);
    const statusEmoji = c.chatter.status && c.chatter.status.toLowerCase() === 'actif' ? '🟢' : '⚪';
    const mention = c.chatter.discord_user_id ? `<@${c.chatter.discord_user_id}>` : `**${c.chatter.name}**`;
    const pendingComm = stats ? stats.pendingTotalCommission : c.totalCommission;

    const isMgr = c.chatter.role === 'Manager Chatter';
    const title = isMgr ? `👔 ${mention} *(Manager Chatter · ${c.chatter.commission_rate}% perso / ${c.chatter.override_rate || 3}% équipe)*` : `${mention} (*${c.chatter.shift}* · ${c.chatter.commission_rate}%)`;

    chatterRowsText += `${statusEmoji} ${title}\n` +
      `  └ 📅 **Aujourd'hui :** **\$${c.totalSales.toFixed(2)}** (${c.salesCount} vente(s)) $\\rightarrow$ **+\$${c.totalCommission.toFixed(2)}** comm.\n` +
      `  └ 📈 **Cumul Cycle (2 sem.) :** **\$${pendingComm.toFixed(2)}** en attente\n\n`;
  }

  const detailEmbed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('👥 PERFORMANCE DÉTAILLÉE PAR CHATTER')
    .setDescription(chatterRowsText ? chatterRowsText.slice(0, 4000) : 'Aucun chatter configuré.')
    .addFields(
      {
        name: '💳 Cumul Total Équipe (Cycle de 2 semaines en cours)',
        value: `Total Ventes : **\$${data.globalCycle.grandTotalSales.toFixed(2)}**\nTotal Commissions Dues : **\$${data.globalCycle.grandTotalCommission.toFixed(2)}**\nChatters Actifs : **${data.globalCycle.activeShiftCount} / ${data.globalCycle.totalChatters}**`,
        inline: false,
      }
    )
    .setFooter({ text: 'AVA Agency • Rapport Quotidien Automatique' })
    .setTimestamp();

  const sentChannels = [];
  for (const chId of targetChannelIds) {
    const channel = await client.channels.fetch(chId).catch(() => null);
    if (!channel) {
      console.warn(`⚠️ Salon Rapport Quotidien Chatter introuvable (${chId}).`);
      continue;
    }

    await channel.send({
      content: `@everyone\n📢 **Rapport Quotidien des Ventes Chatters — ${capitalizedDate}**`,
      allowedMentions: { parse: ['everyone', 'users'] },
      embeds: [headerEmbed, detailEmbed],
    }).catch(err => console.error(`Erreur envoi rapport dans ${chId}:`, err));

    console.log(`✅ Rapport quotidien des ventes chatters publié dans #${channel.name || chId}`);
    sentChannels.push(chId);
  }

  return { success: sentChannels.length > 0, channelIds: sentChannels, data };
}

module.exports = {
  initChatterTables,
  getAllChatters,
  getChatterById,
  getChatterByDiscordId,
  getChatterByName,
  addChatter,
  deleteChatter,
  updateChatterStatus,
  updateChatterShift,
  updateChatterCommission,
  linkChatterDiscord,
  recordSale,
  getChatterStats,
  getGlobalDashboardData,
  processChatterPayout,
  processAllChatterPayouts,
  setupChatterRevenuChannel,
  setupChatterAdminChannel,
  setupChatterPointageChannel,
  postSaleNotification,
  postShiftStartNotification,
  postShiftEndNotification,
  parseShiftHours,
  clockInChatter,
  clockOutChatter,
  recordChatterStrike,
  recordChatterAbsence,
  renderProgressBar,
  getDailySalesData,
  sendDailyChatterSalesReport,
};

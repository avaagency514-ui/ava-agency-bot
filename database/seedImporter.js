/**
 * database/seedImporter.js
 * Importation directe et infaillible des données historiques en pure JavaScript.
 * Ne dépend d'aucun ATTACH DATABASE ni d'aucun chemin de fichier binaire SQLite.
 */
'use strict';

const path = require('path');
const fs = require('fs');

function seedDatabaseIfNeeded(db) {
  try {
    const seedJsonPath = path.join(__dirname, 'seed_data.json');
    if (!fs.existsSync(seedJsonPath)) {
      console.warn('⚠️ seed_data.json introuvable à', seedJsonPath);
      return { error: 'seed_data.json not found' };
    }

    const data = JSON.parse(fs.readFileSync(seedJsonPath, 'utf8'));

    let linkCount = 0;
    try {
      const row = db.prepare("SELECT count(*) as c FROM tg_invite_links").get();
      linkCount = row ? row.c : 0;
    } catch {
      linkCount = 0;
    }

    console.log(`🔄 [Seed] Synchronisation des données historiques (${linkCount} liens détectés)...`);

    db.exec('BEGIN TRANSACTION;');

    // 1. Tables de base si elles n'existent pas encore
    db.exec(`
      CREATE TABLE IF NOT EXISTS vas (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        discord_id    TEXT UNIQUE,
        username      TEXT NOT NULL,
        channel_id    TEXT UNIQUE NOT NULL,
        statut        TEXT DEFAULT 'actif',
        notes         TEXT,
        telegram_id   TEXT UNIQUE,
        created_at    TEXT DEFAULT (datetime('now')),
        updated_at    TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS tg_invite_links (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        va_name      TEXT    NOT NULL,
        canal        TEXT    NOT NULL DEFAULT 'FR',
        invite_link  TEXT    NOT NULL,
        created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
        UNIQUE(va_name, canal)
      );

      CREATE TABLE IF NOT EXISTS tg_subs (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        ts           TEXT    NOT NULL DEFAULT (datetime('now')),
        user_id      INTEGER NOT NULL,
        full_name    TEXT,
        username     TEXT,
        language     TEXT,
        va_name      TEXT    NOT NULL DEFAULT 'Inconnu',
        canal        TEXT    NOT NULL DEFAULT 'FR',
        eligible     INTEGER NOT NULL DEFAULT 0,
        report_sent  INTEGER NOT NULL DEFAULT 0,
        country      TEXT,
        invite_link  TEXT,
        has_avatar   INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS tg_remuneration (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        va_name             TEXT    NOT NULL UNIQUE,
        paid_subs_count     INTEGER NOT NULL DEFAULT 0,
        total_earned        REAL    NOT NULL DEFAULT 0,
        bonus_paid_months   TEXT    NOT NULL DEFAULT '[]',
        updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // 2. Nettoyage immédiat des éventuels doublons accumulés
    try {
      db.exec(`
        DELETE FROM tg_subs
        WHERE id NOT IN (
          SELECT MIN(id)
          FROM tg_subs
          GROUP BY user_id, canal, ts
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_tg_subs_uniq ON tg_subs (user_id, canal, ts);
      `);
    } catch (e) {
      console.warn('Index tg_subs:', e.message);
    }

    // 3. VAs
    if (Array.isArray(data.vas)) {
      const q = db.prepare(`
        INSERT OR IGNORE INTO vas (discord_id, username, channel_id, statut, notes, telegram_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const v of data.vas) {
        q.run(v.discord_id || null, v.username, v.channel_id, v.statut || 'actif', v.notes || null, v.telegram_id || null, v.created_at || null, v.updated_at || null);
      }
    }

    // 4. Liens Telegram (Les 38 liens FR + 18 liens US)
    if (Array.isArray(data.links)) {
      const q = db.prepare(`
        INSERT OR IGNORE INTO tg_invite_links (va_name, canal, invite_link, created_at)
        VALUES (?, ?, ?, ?)
      `);
      for (const l of data.links) {
        q.run(l.va_name, l.canal, l.invite_link, l.created_at || null);
      }
    }

    // 5. Rémunérations (Avec mise à jour explicite des montants déjà réglés le 01/11)
    if (Array.isArray(data.tg_remuneration)) {
      const q = db.prepare(`
        INSERT INTO tg_remuneration (va_name, paid_subs_count, total_earned, bonus_paid_months, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(va_name) DO UPDATE SET
          paid_subs_count = MAX(paid_subs_count, excluded.paid_subs_count),
          total_earned    = MAX(total_earned, excluded.total_earned)
      `);
      for (const r of data.tg_remuneration) {
        q.run(r.va_name, r.paid_subs_count || 0, r.total_earned || 0, r.bonus_paid_months || '[]', r.updated_at || null);
      }
    }

    // 6. Subs historiques (Ne duplique jamais grâce à INSERT OR IGNORE + UNIQUE INDEX)
    if (Array.isArray(data.subs)) {
      const q = db.prepare(`
        INSERT OR IGNORE INTO tg_subs (ts, user_id, full_name, username, language, va_name, canal, eligible, report_sent, country, invite_link, has_avatar)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const s of data.subs) {
        q.run(s.ts || '', s.user_id, s.full_name || '', s.username || '', s.language || '', s.va_name || 'Inconnu', s.canal || 'FR', s.eligible || 0, s.report_sent || 0, s.country || '', s.invite_link || '', s.has_avatar || 0);
      }
    }

    db.exec('COMMIT;');

    const finalLinks = db.prepare("SELECT count(*) as c FROM tg_invite_links").get()?.c || 0;
    const finalVas = db.prepare("SELECT count(*) as c FROM vas").get()?.c || 0;
    const finalSubs = db.prepare("SELECT count(*) as c FROM tg_subs").get()?.c || 0;

    console.log(`✅ [Seed] Succès : ${finalLinks} liens, ${finalVas} VAs, ${finalSubs} subs chargés en base !`);
    return { success: true, finalLinks, finalVas, finalSubs };
  } catch (err) {
    try { db.exec('ROLLBACK;'); } catch {}
    console.error('❌ [Seed] Erreur restauration:', err);
    return { error: err.message };
  }
}

module.exports = { seedDatabaseIfNeeded };

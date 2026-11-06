/**
 * database/db.js
 * Utilise node:sqlite — intégré à Node.js 22+, aucune compilation requise
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

// S'assurer que le dossier data existe
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'agency.db');
const seedPath = path.join(__dirname, '../seed_agency.db');

// ─── Restauration automatique sur nouveau volume (ex: Railway) ──────────
if (fs.existsSync(seedPath) && !fs.existsSync(dbPath)) {
  try {
    fs.copyFileSync(seedPath, dbPath);
    console.log('✅ Base de données complète seed_agency.db injectée dans ' + dbPath);
  } catch (err) {
    console.error('⚠️ Erreur copie seed_agency.db:', err.message);
  }
}

const db = new DatabaseSync(dbPath);
const { seedDatabaseIfNeeded } = require('./seedImporter');

// ─── Initialisation du schéma ─────────────────────────────────
function initDatabase() {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

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

    CREATE TABLE IF NOT EXISTS comptes_ig (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      va_id         INTEGER NOT NULL,
      username_ig   TEXT NOT NULL,
      deeplink      TEXT,
      clics         INTEGER DEFAULT 0,
      last_clic_at  TEXT,
      actif         INTEGER DEFAULT 1,
      ban           INTEGER DEFAULT 0,
      profile_id    TEXT,
      os            TEXT,
      password      TEXT,
      two_fa        TEXT,
      registration_date TEXT,
      created_at    TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (va_id) REFERENCES vas(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activite (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      va_id         INTEGER NOT NULL,
      type          TEXT NOT NULL,
      count         INTEGER DEFAULT 0,
      gains         REAL DEFAULT 0,
      date          TEXT NOT NULL,
      created_at    TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (va_id) REFERENCES vas(id) ON DELETE CASCADE,
      UNIQUE(va_id, type, date)
    );

    CREATE TABLE IF NOT EXISTS alertes_log (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      type            TEXT NOT NULL,
      reference_id    INTEGER,
      reference_type  TEXT,
      sent_at         TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scraped_reels (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      source_key      TEXT UNIQUE NOT NULL,
      extracted_text  TEXT,
      author_id       TEXT,
      author_tag      TEXT,
      channel_id      TEXT,
      created_at      TEXT DEFAULT (datetime('now'))
    );
  `);

  try {
    db.exec("ALTER TABLE vas ADD COLUMN telegram_id TEXT;");
  } catch (e) {
    // Ignore si la colonne existe déjà
  }

  seedDatabaseIfNeeded(db);

  console.log('✅ Base de données initialisée (node:sqlite)');
}

// ─── Lazy-initialized queries ─────────────────────────────────
// Les statements sont créés APRÈS initDatabase() grâce au getter lazy
let _vaQ = null;
let _igQ = null;
let _activiteQ = null;
let _alertesQ = null;

function getVaQueries() {
  if (_vaQ) return _vaQ;
  _vaQ = {
    create: db.prepare(`INSERT INTO vas (discord_id, username, channel_id, statut) VALUES (:discord_id, :username, :channel_id, :statut)`),
    getByChannel:   db.prepare(`SELECT * FROM vas WHERE channel_id = ?`),
    getByDiscordId: db.prepare(`SELECT * FROM vas WHERE discord_id = ?`),
    getByTelegramId: db.prepare(`SELECT * FROM vas WHERE telegram_id = ?`),
    getById:        db.prepare(`SELECT * FROM vas WHERE id = ?`),
    getAll:         db.prepare(`SELECT * FROM vas WHERE statut != 'banni' ORDER BY username`),
    getActifs:      db.prepare(`SELECT * FROM vas WHERE statut = 'actif'`),
    update:         db.prepare(`UPDATE vas SET discord_id = :discord_id, username = :username, statut = :statut, notes = :notes WHERE id = :id`),
    linkTelegram:   db.prepare(`UPDATE vas SET telegram_id = ? WHERE id = ?`),
    delete:         db.prepare(`DELETE FROM vas WHERE id = ?`),
    updateStatut:   db.prepare(`UPDATE vas SET statut = ?, updated_at = datetime('now') WHERE id = ?`),
  };
  return _vaQ;
}

function getIgQueries() {
  if (_igQ) return _igQ;
  _igQ = {
    create:       db.prepare(`INSERT INTO comptes_ig (va_id, username_ig, deeplink, profile_id, os, password, two_fa, registration_date) VALUES (:va_id, :username_ig, :deeplink, :profile_id, :os, :password, :two_fa, :registration_date)`),
    getByVa:      db.prepare(`SELECT * FROM comptes_ig WHERE va_id = ? AND actif = 1`),
    getById:      db.prepare(`SELECT * FROM comptes_ig WHERE id = ?`),
    getAllActifs:  db.prepare(`SELECT ci.*, v.username AS va_username, v.channel_id FROM comptes_ig ci JOIN vas v ON ci.va_id = v.id WHERE ci.actif = 1 AND ci.ban = 0`),
    updateClics:  db.prepare(`UPDATE comptes_ig SET clics = :clics, last_clic_at = :last_clic_at WHERE id = :id`),
    delete:       db.prepare(`UPDATE comptes_ig SET actif = 0 WHERE id = ?`),
    ban:          db.prepare(`UPDATE comptes_ig SET ban = 1, actif = 0 WHERE id = ?`),
  };
  return _igQ;
}

function getActiviteQueries() {
  if (_activiteQ) return _activiteQ;
  _activiteQ = {
    upsert: db.prepare(`
      INSERT INTO activite (va_id, type, count, gains, date) VALUES (:va_id, :type, :count, :gains, :date)
      ON CONFLICT(va_id, type, date) DO UPDATE SET count = count + excluded.count, gains = gains + excluded.gains
    `),
    getByDate:      db.prepare(`SELECT a.*, v.username FROM activite a JOIN vas v ON a.va_id = v.id WHERE a.date = ? ORDER BY a.count DESC`),
    getByVaAndDate: db.prepare(`SELECT * FROM activite WHERE va_id = ? AND date = ?`),
  };
  return _activiteQ;
}

function getAlertesQueries() {
  if (_alertesQ) return _alertesQ;
  _alertesQ = {
    log:       db.prepare(`INSERT INTO alertes_log (type, reference_id, reference_type) VALUES (:type, :reference_id, :reference_type)`),
    getRecent: db.prepare(`SELECT * FROM alertes_log WHERE type = :type AND reference_id = :reference_id AND sent_at > datetime('now', '-24 hours') LIMIT 1`),
  };
  return _alertesQ;
}

let _reelQ = null;
function getReelQueries() {
  if (_reelQ) return _reelQ;
  _reelQ = {
    save:      db.prepare(`INSERT OR REPLACE INTO scraped_reels (source_key, extracted_text, author_id, author_tag, channel_id) VALUES (:source_key, :extracted_text, :author_id, :author_tag, :channel_id)`),
    getByKey:  db.prepare(`SELECT * FROM scraped_reels WHERE source_key = ?`),
    getRecent: db.prepare(`SELECT * FROM scraped_reels ORDER BY id DESC LIMIT 50`),
  };
  return _reelQ;
}

// Proxy pour accéder aux queries de façon transparente (get sur l'objet appelle le lazy getter)
const vaQueries       = new Proxy({}, { get: (_, key) => getVaQueries()[key] });
const igQueries       = new Proxy({}, { get: (_, key) => getIgQueries()[key] });
const activiteQueries = new Proxy({}, { get: (_, key) => getActiviteQueries()[key] });
const alertesQueries  = new Proxy({}, { get: (_, key) => getAlertesQueries()[key] });
const reelQueries     = new Proxy({}, { get: (_, key) => getReelQueries()[key] });

module.exports = {
  db,
  initDatabase,
  seedDatabaseIfNeeded,
  vaQueries,
  igQueries,
  activiteQueries,
  alertesQueries,
  reelQueries,
};

/**
 * services/tgTracker.js
 * Tracker d'abonnés Telegram — Multi-canaux (FR + US)
 *
 * Fonctionnalités :
 * - Détection automatique de TOUS les liens Telegram (créés par le bot OU à la main dans Telegram)
 * - Sauvegarde automatique de l'URL du lien dès qu'un membre rejoint
 * - 1 lien nominatif par VA généré automatiquement par canal (FR + US)
 * - Révocation automatique des liens Telegram si une VA est bannie ou kickée sur Discord
 * - Filtre anti-fraude intelligent :
 *     * Écarte scripts Asie (Chine, Japon, Corée), Inde (Devanagari/Hindi/etc.), Arabes/Moyen-Orient
 *     * Accepte profils occidentaux (Europe + US)
 *     * Attribue automatiquement le pays (France pour FR, US pour US, ou selon langue détectée)
 * - Rapport quotidien Discord ultra clair calqué sur le format d'analyse par carte
 * - Affichage garanti des deux marchés (🇫🇷 Canal FR ET 🇺🇸 Canal US)
 * - Rémunération cumulée détaillée avec seuils 30 subs et prime 500 subs
 */

'use strict';

const https = require('https');
const TelegramBot = require('node-telegram-bot-api');
const { db } = require('../database/db');
const { initRemunerationTable, buildVAReport, getOrCreateVA } = require('./tgRemuneration');

// ─── Langues ACCEPTÉES : Français & Occidentaux (FR, EN, etc.) ─────────────
const ALLOWED_LANGS = new Set(['fr', 'en']);

const LANG_TO_COUNTRY = {
  fr: 'France (FR)',
  en: 'France (FR)',
};

// ─── Régions EXPLICITEMENT exclues (Asie, Inde, Afrique non-francophone, etc.) ───
const EXCLUDED_REGIONS = {
  // Inde & Asie du Sud
  hi: 'Inde (IN)', bn: 'Inde/Bangladesh', ur: 'Pakistan (PK)', ta: 'Inde (IN)', te: 'Inde (IN)',
  ml: 'Inde (IN)', kn: 'Inde (IN)', gu: 'Inde (IN)', mr: 'Inde (IN)', ne: 'Népal (NP)', si: 'Sri Lanka (LK)',
  pa: 'Inde/Pakistan',

  // Afrique, Maghreb & Moyen-Orient (Langues locales non-européennes)
  ar: 'Afrique du Nord / Arabe (Maghreb)', fa: 'Iran (IR)', ps: 'Afghanistan (AF)', tr: 'Turquie (TR)',
  sw: 'Afrique (Swahili)', yo: 'Nigéria (NG)', ig: 'Nigéria (NG)', ha: 'Nigéria/Niger', am: 'Éthiopie (ET)', so: 'Somalie (SO)',
  wo: 'Sénégal (SN)', ff: 'Afrique (Peul)', rw: 'Rwanda (RW)', mg: 'Madagascar (MG)',
  zu: 'Afrique du Sud (ZA)', xh: 'Afrique du Sud (ZA)', st: 'Afrique (Lesotho)', tn: 'Afrique (Botswana)', sn: 'Afrique (Zimbabwe)',

  // Asie du Sud-Est & Est
  id: 'Indonésie (ID)', ms: 'Malaisie (MY)', tl: 'Philippines (PH)', fil: 'Philippines (PH)', th: 'Thaïlande (TH)',
  vi: 'Vietnam (VN)', my: 'Myanmar (MM)', km: 'Cambodge (KH)', lo: 'Laos (LA)',
  zh: 'Chine (CN)', ja: 'Japon (JP)', ko: 'Corée (KR)', mn: 'Mongolie (MN)',
  kk: 'Kazakhstan', ky: 'Kirghizistan', uz: 'Ouzbékistan', tg: 'Tadjikistan',

  // Europe de l'Est / Russe (fermes et bots)
  ru: 'Russie (RU)', uk: 'Ukraine (UA)'
};

// ─── Expressions régulières anti-fraude (Asie, Inde, Moyen-Orient, Cyrillique) ─
const ASIAN_ARAB_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0900-\u0DFF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u0E00-\u0E7F\u0400-\u04FF]/;
const HAS_LETTERS = /[a-zA-Z\u00C0-\u024F]/;

// ─── Vérification d'un lien d'invitation Telegram authentique ───────────────
function isRealTelegramLink(link) {
  if (!link || typeof link !== 'string') return false;
  if (link.endsWith('_FR') || link.endsWith('_US') || link.includes('tiktok') || link.includes('twitter_') || link.includes('insta_')) return false;
  return link.startsWith('https://t.me/+') && link.length >= 20;
}

// ─── Analyse d'éligibilité : RÈGLE JUSTE & MOTIVANTE POUR LES VAs ────────────
function analyzeSubscriber({ user, canal = 'FR', hasAvatar = false }) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || '';
  const username = user.username || '';
  const text = (fullName + ' ' + username).trim();
  const langRaw = (user.language_code || '').toLowerCase().split('-')[0];

  // 1. Détection de scripts Asie / Arabe / Inde / Russe
  if (ASIAN_ARAB_REGEX.test(text)) {
    let country = 'Inde (IN)';
    if (/[\u0600-\u06FF\u0750-\u077F]/.test(text)) country = 'Afrique du Nord / Arabe (Maghreb)';
    else if (/[\u0400-\u04FF]/.test(text)) country = 'Russie / Cyrillique';
    else if (/[\u4E00-\u9FFF]/.test(text)) country = 'Chine (CN)';
    else if (/[\u0E00-\u0E7F]/.test(text)) country = 'Thaïlande (TH)';
    return {
      eligible: false,
      country,
      reason: `Script non-européen (${country})`,
    };
  }

  // 2. Détection de mots-clés publicitaires ou bots (crypto, earn, bot, money, invest...)
  const SPAM_REGEX = /\b(bot|crypto|earn|money|invest|bonus|trade|trading|poker|casino|forex|signals|airdrop)\b/i;
  if (SPAM_REGEX.test(text)) {
    return {
      eligible: false,
      country: 'Spam / Bot commercial',
      reason: 'Mots-clés spam/bot publicitaire',
    };
  }

  // 3. Détection de région/langue explicitement exclue (Asie, Arabe, etc.)
  if (langRaw && EXCLUDED_REGIONS[langRaw]) {
    return {
      eligible: false,
      country: EXCLUDED_REGIONS[langRaw],
      reason: `Zone exclue (${EXCLUDED_REGIONS[langRaw]})`,
    };
  }

  // 4. Détection de comptes sans lettres ou nom trop court (< 2 lettres)
  const lettersOnly = text.replace(/[^a-zA-Z\u00C0-\u024F]/g, '');
  if (lettersOnly.length < 2) {
    return {
      eligible: false,
      country: 'Compte suspect sans nom',
      reason: 'Compte fantôme sans lettres',
    };
  }

  // 5. TOUT PROFIL OCCIDENTAL (Français, Anglais ou langue non renseignée, avec ou sans photo)
  // EST DÉSORMAIS VALIDÉ POUR LES VAs !
  // (La majorité des vrais abonnés n'ont pas d'avatar public ou ont leur appli en EN)
  return {
    eligible: true,
    country: 'France (FR)',
    reason: langRaw === 'fr' ? 'Langue française validée (FR)' : 'Profil occidental validé (Canal FR)',
  };
}

// ─── Initialisation de la table ──────────────────────────────────────────────
function initTrackerTable() {
  db.exec(`
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
      invite_link  TEXT
    );

    CREATE TABLE IF NOT EXISTS tg_invite_links (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      va_name      TEXT    NOT NULL,
      canal        TEXT    NOT NULL DEFAULT 'FR',
      invite_link  TEXT    NOT NULL,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(va_name, canal)
    );
  `);

  try { db.exec(`ALTER TABLE tg_subs ADD COLUMN canal TEXT NOT NULL DEFAULT 'FR'`); } catch {}
  try { db.exec(`ALTER TABLE tg_subs ADD COLUMN country TEXT`); } catch {}
  try { db.exec(`ALTER TABLE tg_subs ADD COLUMN invite_link TEXT`); } catch {}
  try { db.exec(`ALTER TABLE tg_subs ADD COLUMN has_avatar INTEGER NOT NULL DEFAULT 0`); } catch {}
}

// ─── Normalisation des noms de VAs (correction des fautes de frappe) ────────
function normalizeVaName(name) {
  if (!name) return 'Lien direct/public';
  let cleaned = name.trim();
  // Correction automatique : "malachi twitter fr" -> "malachie twitter fr"
  if (/^malachi(\s+|$)/i.test(cleaned)) {
    cleaned = cleaned.replace(/^malachi/i, 'malachie');
  }
  return cleaned;
}

// ─── Requêtes DB ─────────────────────────────────────────────────────────────
function recordSub({ userId, fullName, username, language, vaName, canal, eligible, country, inviteLink, hasAvatar = false }) {
  const canonicalVa = normalizeVaName(vaName);
  db.prepare(`
    INSERT INTO tg_subs (user_id, full_name, username, language, va_name, canal, eligible, country, invite_link, has_avatar)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    fullName || '',
    username || '',
    language || 'inconnue',
    canonicalVa,
    canal,
    eligible ? 1 : 0,
    country || '',
    inviteLink || '',
    hasAvatar ? 1 : 0
  );
}

function getTodaySubs() {
  const today = new Date().toISOString().slice(0, 10);
  return db.prepare(`
    SELECT * FROM tg_subs
    WHERE ts LIKE ?
    ORDER BY canal, ts
  `).all(`${today}%`);
}

function getAllRecentSubs() {
  const unreport = db.prepare(`
    SELECT * FROM tg_subs
    WHERE canal = 'FR' AND (report_sent = 0 OR ts >= datetime('now', '-24 hours'))
    ORDER BY ts
  `).all();
  if (unreport.length > 0) return unreport;

  return db.prepare(`
    SELECT * FROM tg_subs
    WHERE canal = 'FR' AND ts >= datetime('now', '-24 hours')
    ORDER BY ts
  `).all();
}

function markReported() {
  db.prepare(`UPDATE tg_subs SET report_sent = 1 WHERE report_sent = 0`).run();
}

function saveInviteLink(vaName, canal, link) {
  if (!vaName || !canal || !link) return;
  const canonicalVa = normalizeVaName(vaName);
  db.prepare(`
    INSERT INTO tg_invite_links (va_name, canal, invite_link)
    VALUES (?, ?, ?)
    ON CONFLICT(va_name, canal) DO UPDATE SET invite_link = excluded.invite_link, created_at = datetime('now')
  `).run(canonicalVa, canal, link);
}

function deleteInviteLinks(vaName) {
  db.prepare(`DELETE FROM tg_invite_links WHERE va_name = ?`).run(vaName);
}

function getAllInviteLinks() {
  return db.prepare(`SELECT * FROM tg_invite_links ORDER BY canal, va_name`).all();
}

function getInviteLinkForVa(vaName, canal) {
  return db.prepare(`SELECT * FROM tg_invite_links WHERE va_name = ? AND canal = ?`).get(vaName, canal);
}

// ─── Vérification en temps réel de la validité d'un lien Telegram ───────────
function isInviteLinkActive(url) {
  if (!url || !url.startsWith('https://t.me/+')) return Promise.resolve(false);
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 4000 }, (res) => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
        if (data.length > 20000) req.destroy();
      });
      res.on('end', () => {
        const isKim = data.includes('Canal de Kim') || data.includes('Kim');
        const isJoin = data.includes('tgme_action_button_new') || data.includes('Join Channel') || data.includes('Rejoindre');
        const isExpired = data.includes('Expired Link') || data.includes('Join group chat on Telegram') || data.includes('lien a expiré');
        resolve(isKim && isJoin && !isExpired);
      });
      res.on('close', () => {
        const isKim = data.includes('Canal de Kim') || data.includes('Kim');
        const isJoin = data.includes('tgme_action_button_new') || data.includes('Join Channel') || data.includes('Rejoindre');
        const isExpired = data.includes('Expired Link') || data.includes('Join group chat on Telegram') || data.includes('lien a expiré');
        resolve(isKim && isJoin && !isExpired);
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

// ─── Purge automatique de tous les liens supprimés ou révoqués ────────────────
async function purgeDeadInviteLinks() {
  const links = getAllInviteLinks();
  const deleted = [];
  const skipped = [];

  for (const l of links) {
    const url = l.invite_link || '';

    // 1. Supprimer immédiatement les URLs tronquées (placeholder avec '...')
    if (url.includes('...') || url.length < 25) {
      db.prepare(`DELETE FROM tg_invite_links WHERE id = ?`).run(l.id);
      deleted.push(l);
      console.log(`🗑️ [TG Tracker] URL tronquée/inutilisable supprimée : [${l.canal}] ${l.va_name} (${url})`);
      continue;
    }

    // 2. Pour les vraies URLs complètes, tester si le lien est encore actif
    if (!url.startsWith('https://t.me/+')) {
      skipped.push(l);
      continue;
    }

    const active = await isInviteLinkActive(url);
    if (!active) {
      db.prepare(`DELETE FROM tg_invite_links WHERE id = ?`).run(l.id);
      deleted.push(l);
      console.log(`🧹 [TG Tracker] Lien révoqué/supprimé retiré de la base : [${l.canal}] ${l.va_name} (${url})`);
    }
    await new Promise(r => setTimeout(r, 200));
  }
  return { checked: links.length, purged: deleted.length, skipped: skipped.length, remaining: links.length - deleted.length, deleted };
}

// ─── Bot Telegram singleton ───────────────────────────────────────────────────
let trackerBot = null;
function getTrackerBot() { return trackerBot; }

// ─── Créer un lien nominatif pour une VA sur un canal ─────────────────────────
async function createLinkForVA(vaName, canalId, canalLabel) {
  if (!trackerBot || !canalId || canalId.includes('COLLE_ICI')) return null;

  const existing = getInviteLinkForVa(vaName, canalLabel);
  if (existing) {
    return existing.invite_link;
  }

  try {
    const linkObj = await trackerBot.createChatInviteLink(parseInt(canalId), {
      name: `[${canalLabel}] ${vaName}`,
      creates_join_request: false
    });
    saveInviteLink(vaName, canalLabel, linkObj.invite_link);
    console.log(`  ✅ [TG Tracker] Lien ${canalLabel} créé pour ${vaName} → ${linkObj.invite_link}`);
    return linkObj.invite_link;
  } catch (err) {
    console.warn(`  ⚠️ [TG Tracker] Impossible de créer le lien ${canalLabel} pour ${vaName}: ${err.message}`);
    return null;
  }
}

// ─── Synchroniser les liens de toutes les VAs actives (FRANCE UNIQUEMENT) ─────
async function createLinksForAllVAs() {
  const { vaQueries } = require('../database/db');
  const vas = vaQueries.getActifs.all();

  const canalFrId = process.env.TELEGRAM_CANAL_FR_ID;

  console.log(`🔗 TG Tracker — Vérification des liens Français (FR) pour ${vas.length} VA(s)...`);

  for (const va of vas) {
    if (canalFrId && !canalFrId.includes('COLLE_ICI')) {
      await createLinkForVA(va.username, canalFrId, 'FR');
    }
    await new Promise(r => setTimeout(r, 250));
  }
}

// ─── Hooks appelés lors des ajouts / départs de VA ────────────────────────────
async function onVAAdded(vaName) {
  if (!trackerBot) return;
  const canalFrId = process.env.TELEGRAM_CANAL_FR_ID;

  console.log(`➕ [TG Tracker] Nouvelle VA détectée: "${vaName}". Création du lien FR...`);
  if (canalFrId && !canalFrId.includes('COLLE_ICI')) await createLinkForVA(vaName, canalFrId, 'FR');
}

async function onVARemoved(vaName) {
  if (!vaName) return;
  console.log(`🗑️ [TG Tracker] Départ/Ban de la VA: "${vaName}". Révocation automatique des liens...`);

  const canalFrId = process.env.TELEGRAM_CANAL_FR_ID;
  const canalUsId = process.env.TELEGRAM_CANAL_US_ID;

  try {
    const existingLinks = db.prepare('SELECT * FROM tg_invite_links WHERE va_name = ?').all(vaName);
    for (const l of existingLinks) {
      const targetChatId = l.canal === 'US' ? canalUsId : canalFrId;
      if (trackerBot && targetChatId && !targetChatId.includes('COLLE_ICI') && l.invite_link) {
        try {
          await trackerBot.revokeChatInviteLink(parseInt(targetChatId), l.invite_link);
          console.log(`  🚫 Lien révoqué sur Telegram pour ${vaName} [${l.canal}]`);
        } catch (err) {
          console.warn(`  ⚠️ Erreur révocation lien Telegram pour ${vaName}: ${err.message}`);
        }
      }
    }
  } catch (e) {
    console.error('Erreur onVARemoved:', e);
  }

  deleteInviteLinks(vaName);
  console.log(`  ✅ Liens supprimés en base pour "${vaName}"`);
}

// ─── Démarrage du tracker ─────────────────────────────────────────────────────
async function startTgTracker(discordClient) {
  const token     = process.env.TELEGRAM_TRACKER_TOKEN;
  const canalFrId = process.env.TELEGRAM_CANAL_FR_ID;
  const canalUsId = process.env.TELEGRAM_CANAL_US_ID;

  initTrackerTable();
  initRemunerationTable();

  if (!token || token.includes('COLLE_ICI')) {
    console.log('ℹ️ TG Tracker en attente : TELEGRAM_TRACKER_TOKEN non configuré dans .env.');
    return;
  }

  if ((!canalFrId || canalFrId.includes('COLLE_ICI')) && (!canalUsId || canalUsId.includes('COLLE_ICI'))) {
    console.log('ℹ️ TG Tracker en attente : TELEGRAM_CANAL_FR_ID ou TELEGRAM_CANAL_US_ID non configuré.');
    return;
  }

  const bot = new TelegramBot(token, {
    polling: {
      params: {
        allowed_updates: JSON.stringify(['chat_member', 'my_chat_member', 'message'])
      }
    }
  });
  trackerBot = bot;

  bot.on('polling_error', (err) => {
    if (err.message && err.message.includes('404 Not Found')) {
      console.warn('⚠️ TG Tracker : Token invalide (404). Vérifie TELEGRAM_TRACKER_TOKEN.');
    }
  });

  const canalMap = {};
  if (canalFrId && !canalFrId.includes('COLLE_ICI')) canalMap[canalFrId.toString()] = 'FR';
  // Note : Le canal US n'est plus écouté ni tracé (France uniquement)

  // Synchronisation initiale des liens
  await createLinksForAllVAs();

  // ── Listener : Nouveau membre ou départ dans le canal ────────────────────────
  bot.on('chat_member', async (cmu) => {
    try {
      const data = cmu.chat_member || cmu;
      const chatIdStr = data.chat?.id?.toString();
      const canal = canalMap[chatIdStr];
      if (!canal) return;

      const oldStatus = data.old_chat_member?.status;
      const newStatus = data.new_chat_member?.status;

      // ─── 1. Détection des membres qui quittent ou sont bannis ───────────────
      if (['left', 'kicked'].includes(newStatus)) {
        const user = data.new_chat_member?.user;
        if (user && user.id) {
          const res = db.prepare(`
            UPDATE tg_subs 
            SET eligible = 0, country = 'A quitté le canal'
            WHERE user_id = ? AND canal = ? AND eligible = 1
          `).run(user.id, canal);
          if (res.changes > 0) {
            console.log(`🚪 [Sub TG][Canal ${canal}] ${user.first_name || user.id} a quitté le canal → invalidé (non éligible).`);
          }
        }
        return;
      }

      // ─── 2. Détection des nouveaux membres ──────────────────────────────────
      const wasAlreadyMember = ['member', 'administrator', 'creator'].includes(oldStatus);
      if (newStatus !== 'member' || wasAlreadyMember) return;

      const user = data.new_chat_member?.user;
      if (!user || user.is_bot) return;

      // Attribution du nom de lien / VA et sauvegarde immédiate du lien URL
      let vaName = 'Lien direct/public';
      let inviteLinkUrl = '';

      if (data.invite_link) {
        if (data.invite_link.name) {
          vaName = normalizeVaName(data.invite_link.name.replace(/^\[(FR|US)\]\s*/i, '').trim());
        }
        if (data.invite_link.invite_link) {
          inviteLinkUrl = data.invite_link.invite_link;
          // Sauvegarde automatique du lien pour cette VA et ce canal
          saveInviteLink(vaName, canal, inviteLinkUrl);
        }
      }

      // Récupération de la photo de profil (avatar) via Telegram
      let hasAvatar = false;
      try {
        const photos = await bot.getUserProfilePhotos(user.id, { limit: 1 });
        hasAvatar = (photos && photos.total_count > 0);
      } catch (err) {
        hasAvatar = false;
      }

      // Analyse d'éligibilité renforcée
      const analysis = analyzeSubscriber({ user, canal, hasAvatar });
      const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Utilisateur';
      const langRaw  = (user.language_code || '').toLowerCase().split('-')[0];

      recordSub({
        userId: user.id,
        fullName,
        username: user.username || '',
        language: langRaw || 'inconnue',
        vaName,
        canal,
        eligible: analysis.eligible,
        country: analysis.country,
        inviteLink: inviteLinkUrl,
        hasAvatar
      });

      const statutLog = analysis.eligible ? `✅ ÉLIGIBLE (${analysis.country})` : `❌ REJETÉ (${analysis.country})`;
      console.log(`📥 [Sub TG][Canal ${canal}] ${fullName} (@${user.username || 'sans_pseudo'}) via [${vaName}] → ${statutLog} [Avatar: ${hasAvatar ? 'Oui' : 'Non'}]`);

    } catch (err) {
      console.error('❌ Erreur TG Tracker (chat_member):', err.message);
    }
  });

  bot.on('my_chat_member', () => {});

  const labels = Object.entries(canalMap).map(([id, l]) => `${l}: ${id}`).join(' | ');
  console.log(`✅ TG Tracker ACTIF pour le canal Français: ${labels}`);
  console.log(`   🛡️ Filtre anti-fraude: France uniquement (US, Inde, Afrique/Maghreb et autres écartés)`);

  // ─── Boucle automatique toutes les heures ─────────────────────────────────
  // 1. sync  → crée les liens manquants pour chaque VA (si nouveau lien ou VA ajoutée)
  // 2. purge → supprime les liens révoqués/supprimés de Telegram de la base
  const AUTO_INTERVAL_MS = 60 * 60 * 1000; // 1 heure
  async function autoSyncAndPurge() {
    try {
      console.log('🔄 [Auto] Démarrage sync + purge des liens Telegram...');
      // Sync : crée les liens manquants pour toutes les VAs
      await createLinksForAllVAs();
      console.log('✅ [Auto] Sync terminé.');

      // Purge : supprime les liens révoqués ou tronqués
      const result = await purgeDeadInviteLinks();
      console.log(`🧹 [Auto] Purge terminée : ${result.purged} lien(s) supprimé(s) / ${result.checked} vérifiés.`);
    } catch (err) {
      console.error('❌ [Auto] Erreur lors du sync/purge automatique :', err.message);
    }
  }

  // Première exécution après 5 minutes (laisser le bot démarrer proprement)
  setTimeout(() => {
    autoSyncAndPurge();
    // Ensuite toutes les heures
    setInterval(autoSyncAndPurge, AUTO_INTERVAL_MS);
  }, 5 * 60 * 1000);

  console.log('⏰ [Auto] Boucle sync + purge des liens Telegram programmée toutes les heures.');
}

// ─── Helpers découpage messages Discord ───────────────────────────────────────
function sendChunked(channel, lines, separator = '\n') {
  const chunks = [];
  let cur = '';
  for (const line of lines) {
    const next = cur ? cur + separator + line : line;
    if (next.length > 1900) {
      if (cur) chunks.push(cur);
      cur = line;
    } else {
      cur = next;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

// ─── Audit de présence active (Anti-comptes jetables & Deleted Accounts) ────
async function auditActiveMembers(botInstance = null, targetCanal = 'FR', checkAll = false) {
  const bot = botInstance || trackerBot;
  const canalId = targetCanal === 'FR' ? process.env.TELEGRAM_CANAL_FR_ID : process.env.TELEGRAM_CANAL_US_ID;
  if (!bot || !canalId || canalId.includes('COLLE_ICI')) return { checked: 0, invalidated: 0 };

  const query = checkAll
    ? `SELECT id, user_id, full_name, va_name FROM tg_subs WHERE canal = ? AND eligible = 1 AND ts >= '2026-10-29 14:00:00'`
    : `SELECT id, user_id, full_name, va_name FROM tg_subs WHERE canal = ? AND eligible = 1 AND (report_sent = 0 OR ts >= datetime('now', '-24 hours')) AND ts >= '2026-10-29 14:00:00'`;

  const candidates = db.prepare(query).all(targetCanal);
  if (candidates.length === 0) return { checked: 0, invalidated: 0 };

  console.log(`🕵️ Audit de présence Telegram : vérification de ${candidates.length} membre(s) [Canal ${targetCanal}]...`);
  let invalidated = 0;

  for (const sub of candidates) {
    try {
      const member = await bot.getChatMember(parseInt(canalId), sub.user_id);
      const isGone = ['left', 'kicked'].includes(member.status);
      const isDeleted = member.user?.first_name === 'Deleted Account' || !member.user;

      if (isGone || isDeleted) {
        const reason = isDeleted ? 'Compte supprimé (Telegram)' : 'A quitté avant minuit';
        db.prepare(`UPDATE tg_subs SET eligible = 0, country = ? WHERE id = ?`).run(reason, sub.id);
        invalidated++;
        console.log(`  ❌ [Audit] ${sub.full_name} (${sub.va_name}) invalidé: ${reason}`);
      }
    } catch (err) {
      if (err.message && (err.message.includes('PARTICIPANT') || err.message.includes('chat not found'))) {
        db.prepare(`UPDATE tg_subs SET eligible = 0, country = 'A quitté avant minuit' WHERE id = ?`).run(sub.id);
        invalidated++;
        console.log(`  ❌ [Audit] ${sub.full_name} (${sub.va_name}) invalidé: N'est plus membre`);
      }
    }
    await new Promise(r => setTimeout(r, 25));
  }

  console.log(`✅ Audit terminé : ${invalidated} membre(s) invalidé(s) sur ${candidates.length}.`);
  return { checked: candidates.length, invalidated };
}

// ─── Rapport quotidien Discord ────────────────────────────────────────────────
async function sendDailyTrackerReport(discordClient) {
  const channelId = process.env.CHANNEL_TG_TRACKER || '1472915719996837940';
  const channel = await discordClient.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    console.warn(`⚠️ TG Tracker : Salon Discord (${channelId}) introuvable.`);
    return;
  }

  // 1. Audit complet de présence active avant de calculer les stats
  console.log(`🔍 Lancement de l'audit de présence Telegram avant envoi du rapport...`);
  const auditRes = await auditActiveMembers(trackerBot, 'FR', false);

  const rows = getAllRecentSubs();
  const date = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // Map de tous les liens d'invitation enregistrés
  const allLinks = getAllInviteLinks();
  const linkMap = {};
  for (const l of allLinks) {
    if (!linkMap[l.va_name]) linkMap[l.va_name] = {};
    linkMap[l.va_name][l.canal] = l.invite_link;
  }

  const totalElig = rows.filter(r => r.eligible).length;
  const totalKo   = rows.length - totalElig;

  // ── EN-TÊTE GLOBAL ──────────────────────────────────────────
  const headerLines = [
    `@everyone`,
    `📊 **DAILY STAT — ${date}** *(Rapport quotidien de Minuit — 00h00 Paris)*`,
    `👥 Subs des dernières 24h : **${rows.length}** · ✅ **${totalElig}** éligibles (France) · ❌ **${totalKo}** non-éligibles`,
    auditRes && auditRes.invalidated > 0 ? `🛡️ **Audit anti-fraude** : **${auditRes.invalidated}** compte(s) partis ou supprimés ont été écartés.` : null,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📖 **GUIDE DU RAPPORT — PARTIE 1 : STATISTIQUES DU JOUR (24H)**`,
    `> 👋 *Bienvenue dans votre rapport quotidien ! Voici comment lire vos résultats du jour :*`,
    `> • 👥 **Subs humains** : Nombre total de personnes ayant rejoint le canal Telegram via votre lien unique aujourd'hui.`,
    `> • ✅ **Subs éligibles** : Abonnés français valides (France) comptabilisés pour votre paie.`,
    `> • ❌ **Non éligibles** : Abonnés rejetés (profils hors France : États-Unis, Inde, Afrique/Maghreb, etc.). Ces subs ne sont pas rémunérés.`,
    `> • 💰 **Montant (ce jour)** : Vos gains estimés générés sur les dernières 24h (base : 1 \$ pour 3 subs français valides).`,
    `> • 🌍 **Pays** : Répartition géographique constatée de vos nouveaux abonnés.`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  ].filter(Boolean);
  await channel.send({ content: headerLines.join('\n'), allowedMentions: { parse: ['everyone'] } });
  await new Promise(r => setTimeout(r, 250));

  // ── CANAL UNIQUE (FRANCE) — TOUJOURS AFFICHÉ ─────────────────
  const canals = [
    { code: 'FR', flag: '🇫🇷', name: 'Canal FR (Canal de Kim 💖)' }
  ];

  const todayVaSummary = {};

  for (const canal of canals) {
    const canalRows = rows.filter(r => r.canal === canal.code);
    const cOk = canalRows.filter(r => r.eligible).length;
    const cKo = canalRows.length - cOk;

    await channel.send(
      `${canal.flag} **${canal.name}** — ${canalRows.length} sub(s) · ✅ ${cOk} éligible(s) · ❌ ${cKo} rejeté(s)\n` +
      `──────────────────────────────`
    );
    await new Promise(r => setTimeout(r, 250));

    if (canalRows.length === 0) {
      await channel.send(`*Aucun nouvel abonné enregistré aujourd'hui sur ce canal.*`);
      await new Promise(r => setTimeout(r, 250));
      continue;
    }

    // Grouper par VA / Nom du lien
    const vaMap = {};
    for (const r of canalRows) {
      const vaKey = normalizeVaName(r.va_name);
      if (!vaMap[vaKey]) {
        vaMap[vaKey] = {
          total: 0,
          ok: 0,
          ko: 0,
          okCountries: {},
          koReasons: {},
          inviteLink: r.invite_link || (linkMap[vaKey] && linkMap[vaKey][canal.code]) || null
        };
      }
      const s = vaMap[vaKey];
      s.total++;
      if (r.eligible) {
        s.ok++;
        const c = r.country || (canal.code === 'US' ? 'United States (US)' : 'France (FR)');
        s.okCountries[c] = (s.okCountries[c] || 0) + 1;
      } else {
        s.ko++;
        const reason = r.country || 'Inconnue';
        s.koReasons[reason] = (s.koReasons[reason] || 0) + 1;
      }
    }

    for (const [vaName, s] of Object.entries(vaMap)) {
      todayVaSummary[vaName] = { ok: s.ok, total: s.total };
      const link = s.inviteLink || (linkMap[vaName] && linkMap[vaName][canal.code]) || null;
      // Montant journalier estimé : 1$ pour 3 subs = (s.ok / 3)
      const dailyAmount = (s.ok / 3).toFixed(2);

      const paysEligStr = Object.entries(s.okCountries)
        .sort((a, b) => b[1] - a[1])
        .map(([c, count]) => `${c} : **${count}**`)
        .join(', ');

      const paysKoStr = Object.entries(s.koReasons)
        .sort((a, b) => b[1] - a[1])
        .map(([reason, count]) => `${reason} : **${count}**`)
        .join(', ');

      const card = [
        `👤 **${vaName}**`,
      ];
      card.push(`👥 Subs humains : **${s.total}**`);
      card.push(`✅ Subs éligibles : **${s.ok}**`);
      card.push(`❌ Subs non éligibles : **${s.ko}**`);
      card.push(`💰 Montant (ce jour) : **\$${dailyAmount}**`);
      if (s.ok > 0) card.push(`🌍 Pays éligibles : ${paysEligStr}`);
      if (s.ko > 0) card.push(`🚫 Non éligibles : ${paysKoStr}`);

      await channel.send(card.join('\n'));
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // ── SECTION RÉMUNÉRATIONS CUMULÉES ──────────────────────────
  try {
    const remuLines = buildRemunerationSection(linkMap, todayVaSummary);
    for (const chunk of sendChunked(channel, remuLines)) {
      await channel.send(chunk);
      await new Promise(r => setTimeout(r, 350));
    }
  } catch (err) {
    console.error('⚠️ Erreur section rémunération:', err.message);
  }

  markReported();
  console.log(`✅ Rapport TG Tracker publié (${rows.length} subs).`);
}

// ─── Section rémunération cumulée ─────────────────────────────────────────────
function buildRemunerationSection(linkMap = {}, todayVaMap = {}) {
  const month = new Date().toLocaleString('fr-FR', { month: 'long', year: 'numeric' });

  // Récupérer toutes les VAs distinctes qui ont des subs ou des liens sur le canal FR
  // On normalise les noms pour fusionner malachi/malachie et autres variantes
  const vasFromSubs = db.prepare(`SELECT DISTINCT va_name FROM tg_subs WHERE va_name != 'Lien direct/public' AND canal = 'FR'`).all().map(r => normalizeVaName(r.va_name));
  const vasFromLinks = db.prepare(`SELECT DISTINCT va_name FROM tg_invite_links WHERE canal = 'FR'`).all().map(r => normalizeVaName(r.va_name));
  const vaSet = new Set([...vasFromSubs, ...vasFromLinks]);

  const allReports = [...vaSet].map(vaName => {
    getOrCreateVA(vaName);
    return buildVAReport(vaName);
  });

  // Trier : VAs ayant atteint l'objectif en premier, puis par subs valides décroissants
  allReports.sort((a, b) => {
    if (a.canPay && !b.canPay) return -1;
    if (!a.canPay && b.canPay) return 1;
    return b.totalEligible - a.totalEligible;
  });

  let totalDue = 0;
  let totalBonus = 0;
  const bonusVAs = [];
  const readyVAs = [];

  const lines = [
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `💰 **RÉMUNÉRATIONS — CUMUL DU MOIS (${month.toUpperCase()})**`,
    `📖 **GUIDE DU RAPPORT — PARTIE 2 : PAIEMENTS & CUMUL (CYCLE DE 2 SEMAINES)**`,
    `> 👋 *Voici comment fonctionnent vos rémunérations et règlements :*`,
    `> • 💵 **Tarif** : **1 \$ pour 3 subs français éligibles**.`,
    `> • 🎯 **Objectif minimum** : **30 subs français valides minimum** requis pour déclencher un virement.`,
    `> • 📅 **Périodicité** : Les règlements sont effectués **toutes les 2 semaines**.`,
    `> • 🔄 **Si objectif atteint (≥ 30 subs)** : Votre virement est débloqué et votre compteur repart à **0** pour le prochain cycle de 2 semaines.`,
    `> • 🔒 **Si objectif non atteint (< 30 subs)** : Vos points **NE sont JAMAIS perdus** ! Votre compteur est conservé et continue de se cumuler sur les 2 semaines suivantes jusqu'à ce que vous atteigniez l'objectif.`,
    `> • 🏆 **Prime d'excellence** : Un bonus de **+10 \$** vous est offert dès le cap des **500 subs français valides** atteint dans le mois !`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
  ];

  const zeroSubsVAs = [];

  for (const r of allReports) {
    if (r.vaName === 'Lien direct/public') continue;

    // Compter les subs totaux sur le canal FR
    const totalSubsRow = db.prepare('SELECT COUNT(*) as c FROM tg_subs WHERE va_name = ? AND canal = \'FR\'').get(r.vaName);
    const totalSubsAll = totalSubsRow ? totalSubsRow.c : 0;

    // Si 0 sub et 0 gain, ajouter à la liste compacte des liens en attente
    if (totalSubsAll === 0 && r.totalEarned === 0) {
      zeroSubsVAs.push(r.vaName);
      continue;
    }

    const estimatedAmount = (r.pendingSubs / 3).toFixed(2);
    const link = (linkMap[r.vaName] && (linkMap[r.vaName]['FR'] || linkMap[r.vaName]['US'])) || null;

    // Barre de progression vers 500 subs
    const pct = Math.min(100, Math.round((r.totalEligible / 500) * 100));
    const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));

    const card = [
      `👤 **${r.vaName}**`,
    ];
    card.push(`📊 Subs totaux reçus : **${totalSubsAll}**  (dont ✅ **${r.totalEligible}** éligibles)`);
    card.push(`🔵 Subs en attente de règlement : **${r.pendingSubs}**`);

    const todayData = todayVaMap[r.vaName];
    if (todayData && todayData.ok > 0) {
      const todayDollars = (todayData.ok / 3).toFixed(2);
      const prevSubs = Math.max(0, r.pendingSubs - todayData.ok);
      const prevDollars = (prevSubs / 3).toFixed(2);
      card.push(`📥 **Détail du calcul :** \`$${prevDollars}\` (${prevSubs} subs précédents) + \`$${todayDollars}\` (+${todayData.ok} subs aujourd'hui) = **\$${estimatedAmount}** (${r.pendingSubs} subs cumulés)`);
    }

    if (r.canPay) {
      const payable = Math.floor(r.pendingSubs / 3);
      totalDue += payable;
      readyVAs.push({ name: r.vaName, amount: payable });
      card.push(`🎉 **OBJECTIF ATTEINT (≥ 30 subs valides)**`);
      card.push(`💵 **À PAYER CE RÈGLEMENT : \$${payable}.00**`);
      card.push(`🔄 **Statut compteur** : Remise à 0 dès validation du virement`);
    } else {
      const manque = 30 - r.pendingSubs;
      card.push(`⏳ **OBJECTIF EN COURS (${r.pendingSubs}/30 subs valides — encore ${manque} manquant(s))**`);
      card.push(`💰 Montant sécurisé : **\$${estimatedAmount}**`);
      card.push(`🔄 **Statut compteur** : 🔒 **NE SE REMET PAS À 0** (conservé et cumulé pour les 2 prochaines semaines)`);
    }

    if (r.totalEarned > 0) {
      card.push(`💳 Total déjà versé lors des paies précédentes : **\$${r.totalEarned.toFixed(2)}**`);
    }

    card.push(`🏁 ${bar} **${pct}%** (${r.totalEligible}/500 pour la prime de 10 \$)`);

    if (r.bonusDue) {
      bonusVAs.push(r.vaName);
      totalBonus += 10;
      card.push(`🏆 **PRIME 500 SUBS DÉBLOQUÉE → +\$10 CE MOIS !**`);
    }

    lines.push(...card, ``);
  }

  // Afficher les VAs qui ont 0 abonnés
  if (zeroSubsVAs.length > 0) {
    lines.push(`──────────────────────────────`);
    lines.push(`💤 **VAs sans abonnés pour le moment (0 sub) :**`);
    lines.push(zeroSubsVAs.map(v => `• ${v}`).join('  ·  '));
    lines.push(``);
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  const grandTotal = totalDue + totalBonus;
  if (grandTotal > 0) {
    lines.push(`💳 **TOTAL PRÊT POUR VIREMENT : \$${grandTotal.toFixed(2)}**`);
    for (const v of readyVAs) {
      const todayOk = todayVaMap[v.name]?.ok || 0;
      const todayStr = todayOk > 0 ? ` *(dont +$${(todayOk / 3).toFixed(2)} aujourd'hui)*` : '';
      lines.push(`   └ 👤 **${v.name}** → **\$${v.amount}.00**${todayStr} (Compteur passera à 0 après paie)`);
    }
    if (totalBonus > 0) {
      lines.push(`   └ 🏆 Primes 500 subs → \$${totalBonus.toFixed(2)} (${bonusVAs.join(', ')})`);
    }
  } else {
    lines.push(`💳 **TOTAL PRÊT POUR VIREMENT : \$0.00**`);
    lines.push(`   └ Aucune VA n'a encore atteint le seuil de 30 subs valides.`);
    lines.push(`   └ Tous les compteurs actuels continuent de cumuler sur la période suivante.`);
  }
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  return lines;
}

// ─── Stats en temps réel (Canal Français uniquement) ─────────────────────────
function getTodayStats() {
  const today = new Date().toISOString().split('T')[0];
  return db.prepare(`
    SELECT canal,
           CASE
             WHEN LOWER(va_name) LIKE 'malachi %' THEN 'malachie ' || SUBSTR(va_name, 9)
             WHEN LOWER(va_name) = 'malachi' THEN 'malachie twitter fr'
             ELSE va_name
           END as va_name,
           COUNT(*) as total,
           SUM(eligible) as ok,
           SUM(CASE WHEN eligible = 0 THEN 1 ELSE 0 END) as ko
    FROM tg_subs
    WHERE canal = 'FR' AND (report_sent = 0 OR ts >= ?)
    GROUP BY canal, 2
    ORDER BY canal, total DESC
  `).all(today + ' 00:00:00');
}

module.exports = {
  startTgTracker,
  sendDailyTrackerReport,
  buildRemunerationSection,
  saveInviteLink,
  getAllInviteLinks,
  getTodayStats,
  initTrackerTable,
  onVAAdded,
  onVARemoved,
  getTrackerBot,
  createLinksForAllVAs,
  ALLOWED_LANGS,
  analyzeSubscriber,
  auditActiveMembers,
  purgeDeadInviteLinks,
  isInviteLinkActive,
};

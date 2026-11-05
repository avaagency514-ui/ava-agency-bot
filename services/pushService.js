/**
 * services/pushService.js
 * Gestionnaire du système Mass DM / Auto-Push Telegram pour Kim 💖.
 * Permet aux chatters d'envoyer des messages et médias en masse aux fans,
 * ou de programmer la diffusion automatique quotidienne (Auto-Push) par créneaux ciblés.
 */
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const cron = require('node-cron');

const CHANNEL_PUSH_ID = process.env.CHANNEL_PUSH || '1567586328168628245';
const SCRIPT_DIR = path.join(__dirname, '..', 'telegram', 'push');
const WORKER_SCRIPT = path.join(SCRIPT_DIR, 'push_worker.py');
const STATUS_FILE = path.join(SCRIPT_DIR, 'push_status.json');
const CONFIG_FILE = path.join(SCRIPT_DIR, 'push_config.json');
const SESSION_FILE = path.join(SCRIPT_DIR, 'session_push.session');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_MEDIA_DIR = path.join(DATA_DIR, 'push_media');
const LOCAL_MEDIA_DIR = path.join(__dirname, '..', 'temp', 'push_media');

const AUTO_PUSH_CONFIG_DATA = path.join(DATA_DIR, 'auto_push_config.json');
const AUTO_PUSH_CONFIG_LOCAL = path.join(SCRIPT_DIR, 'auto_push_config.json');

// Création des dossiers de persistance
[DATA_DIR, DATA_MEDIA_DIR, LOCAL_MEDIA_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  }
});

// État mémoire
const draftPushes = new Map();
let currentJob = null;
let currentChildProcess = null;
let pollInterval = null;
let autoPushCronTask = null;

function readConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch (e) {
      console.error('⚠️ Erreur lecture push_config.json:', e);
    }
  }
  return {
    model_name: "Kim 💖",
    handle: "@kimchle",
    exclude_active_hours: 2,
    delay_min: 58.0,
    delay_max: 62.0
  };
}

function readAutoPushConfig() {
  for (const p of [AUTO_PUSH_CONFIG_DATA, AUTO_PUSH_CONFIG_LOCAL]) {
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
      } catch (e) {
        console.error('⚠️ Erreur lecture auto_push_config:', e);
      }
    }
  }
  return {
    enabled: true,
    randomize_time: true,
    jitter_minutes: 10,
    exclude_active_hours: 2.0,
    auto_delete_hours: 0.0,
    slots: [
      {
        id: "slot_1",
        time: "10:00",
        target: "subscribers",
        target_label: "Abonnés",
        text: "Coucou chéri 💋 J'ai une surprise pour toi ce matin... Viens vite voir en privé !",
        media_path: null,
        media_name: null,
        enabled: true,
        last_run: null
      },
      {
        id: "slot_2",
        time: "14:30",
        target: "interested",
        target_label: "Intéressés",
        text: "Tu fais quoi de ton après-midi ? Tu as envie qu'on s'amuse un peu ? 😘",
        media_path: null,
        media_name: null,
        enabled: true,
        last_run: null
      },
      {
        id: "slot_3",
        time: "21:00",
        target: "churned",
        target_label: "Anciens",
        text: "Coucou ! Ça fait longtemps qu'on ne s'est pas parlé... Tu m'as manqué 💕",
        media_path: null,
        media_name: null,
        enabled: true,
        last_run: null
      }
    ]
  };
}

function saveAutoPushConfig(config) {
  for (const p of [AUTO_PUSH_CONFIG_DATA, AUTO_PUSH_CONFIG_LOCAL]) {
    try {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(config, null, 2), 'utf-8');
    } catch (e) {
      console.error(`⚠️ Erreur sauvegarde auto_push_config vers ${p}:`, e);
    }
  }
}

function getSlotScheduledTimeForToday(slot, config, todayStr) {
  if (!slot || !slot.time) return "10:00";
  if (!config.randomize_time) return slot.time;

  // Calcul d'un jitter déterministe par jour et par slot pour éviter de varier à chaque minute
  const seedStr = `${todayStr}_${slot.id}`;
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash << 5) - hash + seedStr.charCodeAt(i);
    hash |= 0;
  }
  const jitterMax = config.jitter_minutes || 10;
  const jitterOffset = (Math.abs(hash) % (jitterMax * 2 + 1)) - jitterMax;

  const [hStr, mStr] = slot.time.split(':');
  let totalMin = parseInt(hStr, 10) * 60 + parseInt(mStr, 10) + jitterOffset;
  if (totalMin < 0) totalMin = 0;
  if (totalMin >= 1440) totalMin = 1439;

  const finalH = Math.floor(totalMin / 60);
  const finalM = totalMin % 60;
  return `${String(finalH).padStart(2, '0')}:${String(finalM).padStart(2, '0')}`;
}

function readStatus() {
  if (fs.existsSync(STATUS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8'));
    } catch (e) {
      // Ignorer lecture temporaire pendant écriture
    }
  }
  return { status: 'idle' };
}

function getCachedFansCount() {
  if (!fs.existsSync(SESSION_FILE)) return 0;
  try {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(SESSION_FILE, { readOnly: true });
    const row = db.prepare("SELECT count(*) as cnt FROM peers WHERE type = 'user' AND id > 0").get();
    db.close();
    return row ? row.cnt : 0;
  } catch (e) {
    return 1500;
  }
}

function readPushHistory() {
  const historyPaths = [
    path.join(DATA_DIR, 'push_history.json'),
    path.join(SCRIPT_DIR, 'push_history.json')
  ];
  for (const hp of historyPaths) {
    if (fs.existsSync(hp)) {
      try {
        return JSON.parse(fs.readFileSync(hp, 'utf-8'));
      } catch (e) {}
    }
  }
  return {};
}

function getSentTodayCount() {
  const todayStr = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
  const hist = readPushHistory();
  const list = hist[todayStr];
  if (Array.isArray(list)) return list.length;
  if (list && typeof list === 'object') return Object.keys(list).length;
  return 0;
}

function makeProgressBar(percent, length = 14) {
  const p = Math.max(0, Math.min(100, percent || 0));
  const filled = Math.round((p / 100) * length);
  const empty = length - filled;
  return '▰'.repeat(filled) + '▱'.repeat(empty);
}

function getMediaType(fileName) {
  if (!fileName) return null;
  const ext = path.extname(fileName).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.heic'].includes(ext)) {
    return { type: 'photo', label: '📸 Photo', ext };
  }
  if (['.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v'].includes(ext)) {
    return { type: 'video', label: '🎥 Vidéo', ext };
  }
  if (['.mp3', '.ogg', '.opus', '.wav', '.m4a', '.aac', '.flac'].includes(ext)) {
    return { type: 'audio', label: '🎙️ Message Vocal / Audio', ext };
  }
  return { type: 'document', label: '📁 Document / Fichier', ext };
}

// ─── Embeds & Panneaux ─────────────────────────────────────────

function buildControlPanelEmbed() {
  const config = readConfig();
  const autoConfig = readAutoPushConfig();
  const cachedCount = getCachedFansCount();
  const sentToday = getSentTodayCount();
  const remaining = Math.max(0, cachedCount - sentToday);
  const todayStr = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });

  const autoStatus = autoConfig.enabled ? '🟢 **ACTIF** *(Diffusion quotidienne en cours)*' : '🔴 **EN PAUSE** *(Aucun envoi programmé)*';
  const jitterStatus = autoConfig.randomize_time ? `🟢 **Activée** (±${autoConfig.jitter_minutes || 10} min aléatoires)` : '🔴 **Désactivée** (Heure fixe)';
  const deleteStatus = autoConfig.auto_delete_hours > 0 ? `⏳ **${autoConfig.auto_delete_hours}h**` : '❌ **Désactivée**';

  let slotsDisplay = '';
  if (autoConfig.slots && autoConfig.slots.length > 0) {
    slotsDisplay = autoConfig.slots.map(s => {
      const scheduledToday = getSlotScheduledTimeForToday(s, autoConfig, todayStr);
      const isRanToday = s.last_run === todayStr;
      const statusIcon = isRanToday ? '🏁' : (s.enabled ? '🕒' : '⚪');
      const timeDisplay = (autoConfig.randomize_time && scheduledToday !== s.time)
        ? `**${scheduledToday}** *(prévu: ${s.time})*`
        : `**${s.time}**`;

      let contentBadge = '⏳ *En attente de message*';
      if (s.text || s.media_name) {
        const preview = s.text ? (s.text.length > 35 ? s.text.substring(0, 35) + '...' : s.text) : '';
        const mediaTag = s.media_name ? `📎 [${s.media_name}]` : '';
        contentBadge = `✅ **Prêt** : \`${preview || mediaTag}\``;
      }
      if (isRanToday) {
        contentBadge = '✅ *Envoyé aujourd\'hui*';
      }

      return `${statusIcon} ${timeDisplay} ➔ 🎯 **${s.target_label || s.target}**\n   └ ${contentBadge}`;
    }).join('\n\n');
  } else {
    slotsDisplay = '*Aucun créneau programmé*';
  }

  return new EmbedBuilder()
    .setColor(autoConfig.enabled ? 0xec407a : 0x607d8b)
    .setTitle('📢 GESTIONNAIRE AUTO-PUSH & MASS DM — KIM 💖')
    .setDescription(
      `Bienvenue sur le centre de pilotage **Auto-Push Telegram** pour **${config.model_name || 'Kim 💖'}** (${config.handle || '@kimchle'}).\n` +
      `Configurez les créneaux quotidiens pour diffuser automatiquement en DM aux fans par micro-lots ciblés sans risque de blocage.\n\n` +
      `🚀 **Système Auto-Push :** ${autoStatus}\n` +
      `🎲 **Randomiser l'heure :** ${jitterStatus}\n` +
      `⏳ **Auto-suppression :** ${deleteStatus}`
    )
    .addFields(
      {
        name: '📋 PLANNING DU JOUR (CRÉNEAUX & CIBLES)',
        value: slotsDisplay,
        inline: false,
      },
      {
        name: '🎯 Destinataires Éligibles',
        value: `• **${remaining} fans** disponibles ce jour\n• **${cachedCount}+ fans** répertoriés\n• **${sentToday} fans** exclus *(1 push max/j)*`,
        inline: true,
      },
      {
        name: '🛡️ Sécurités Anti-Ban',
        value: `• Cadence : **1 msg / 60s** (100% humain)\n• Exclure actifs : **< ${config.exclude_active_hours || 2}h**\n• Règle d'or : **1 seul push / fan / jour**`,
        inline: true,
      },
      {
        name: '📎 DÉPÔT DE CONTENU (PHOTO, VIDÉO, VOCAL)',
        value: `Glisse directement ton fichier ou texte dans ce salon **sans lien externe**.\nLe bot te demandera immédiatement à quel créneau l'assigner ou si tu veux l'envoyer de suite !`,
        inline: false,
      }
    )
    .setFooter({ text: 'AVA Agency • Mass DM & Auto-Push V3 • 24/7 Cloud' })
    .setTimestamp();
}

function buildControlPanelButtons() {
  const autoConfig = readAutoPushConfig();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('push_btn_toggle_auto')
      .setLabel(autoConfig.enabled ? '⏸️ Mettre en Pause' : '▶️ Activer Auto-Push')
      .setStyle(autoConfig.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('push_btn_toggle_jitter')
      .setLabel(autoConfig.randomize_time ? '🎲 Heures Fixes' : '🎲 Randomiser Heure')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('push_btn_set_slot_content')
      .setLabel('📝 Définir Contenu Créneau')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('push_btn_auto_delete')
      .setLabel('⏳ Auto-Suppression')
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('push_btn_text_only')
      .setLabel('⚡ Push Manuel Immédiat')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('push_btn_edit_slots')
      .setLabel('🕒 Modifier Horaires')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('push_btn_guide')
      .setLabel('📎 Guide Pièces Jointes')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('push_btn_refresh')
      .setLabel('🔄 Rafraîchir')
      .setStyle(ButtonStyle.Secondary)
  );

  return [row1, row2];
}

function buildDraftEmbed(draft) {
  const config = readConfig();
  const cachedCount = getCachedFansCount();
  const sentToday = getSentTodayCount();
  const remaining = Math.max(0, cachedCount - sentToday);
  const mediaInfo = getMediaType(draft.mediaName);

  const embed = new EmbedBuilder()
    .setColor(0xff9800)
    .setTitle('📝 PRÉVISUALISATION DU PUSH TELEGRAM')
    .setDescription(
      `Ce message est prêt à être diffusé en DM aux fans de **Kim**.\n` +
      `Vérifie les informations ci-dessous avant de valider l'envoi.`
    )
    .addFields(
      {
        name: '✍️ Auteur (Chatter)',
        value: `<@${draft.authorId}>`,
        inline: true,
      },
      {
        name: '🎯 Cible Demandée',
        value: `**${draft.targetSegmentLabel || draft.targetSegment || 'Tous les fans'}**\n*(~${remaining} disponibles aujourd'hui)*`,
        inline: true,
      },
      {
        name: '🚫 Déjà Reçus Aujourd\'hui',
        value: `**${sentToday} fans exclus**\n*(Règle : 1 seul push/jour)*`,
        inline: true,
      },
      {
        name: '🔇 Exclusion fans récents',
        value: `Dernières **${draft.excludeHours || config.exclude_active_hours || 2}h**`,
        inline: true,
      },
      {
        name: '⏳ Auto-suppression',
        value: draft.autoDeleteHours > 0 ? `**${draft.autoDeleteHours}h**` : '*Désactivée*',
        inline: true,
      },
      {
        name: '💬 Message',
        value: draft.text && draft.text.trim() ? draft.text : '*[Aucun texte — Fichier média seul]*',
        inline: false,
      }
    );

  if (draft.mediaName) {
    embed.addFields({
      name: '📎 Fichier joint détecté',
      value: `${mediaInfo?.label || '📁 Fichier'} : **${draft.mediaName}**`,
      inline: false,
    });
  }

  if (draft.mediaUrl && (draft.mediaUrl.endsWith('.jpg') || draft.mediaUrl.endsWith('.png') || draft.mediaUrl.endsWith('.jpeg') || draft.mediaUrl.endsWith('.webp'))) {
    embed.setImage(draft.mediaUrl);
  }

  embed.setFooter({ text: 'Cadence sécurisée : 1 message / 60s' });
  return embed;
}

function buildDraftButtons(draftId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`push_confirm_${draftId}`)
      .setLabel('🚀 Confirmer et Envoyer le Mass DM')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`push_cancel_${draftId}`)
      .setLabel('❌ Annuler')
      .setStyle(ButtonStyle.Danger)
  );
}

function buildProgressEmbed(job, statusData) {
  const percent = statusData.percent || 0;
  const bar = makeProgressBar(percent);
  const total = statusData.total || 0;
  const sent = statusData.sent || 0;
  const skipped = statusData.skipped || 0;
  const failed = statusData.failed || 0;
  const current = statusData.current_recipient || 'Initialisation...';

  let statusLabel = '🚀 Envoi en cours (cadence sécurisée: ~60s entre chaque fan)';
  if (statusData.status === 'paused_floodwait') {
    const pauseTime = statusData.pause_until ? `<t:${statusData.pause_until}:R>` : `~${Math.ceil((statusData.pause_duration || 60) / 60)} min`;
    statusLabel = `⏳ En pause FloodWait Telegram (reprise auto ${pauseTime})`;
  } else if (statusData.status === 'paused_flood') {
    const pauseTime = statusData.pause_until ? `<t:${statusData.pause_until}:R>` : `~3 min`;
    statusLabel = `⏳ En pause anti-flood Telegram (reprise auto ${pauseTime})`;
  }

  const remainingCount = Math.max(0, total - (sent + skipped + failed));
  const remainingMinutes = remainingCount; // car ~60s par message
  const hours = Math.floor(remainingMinutes / 60);
  const mins = remainingMinutes % 60;
  const remainingTimeStr = hours > 0 ? `${hours}h ${mins}min` : `${mins} min`;

  const embed = new EmbedBuilder()
    .setColor(0x2196f3)
    .setTitle('📡 MASS DM TELEGRAM EN COURS DE DIFFUSION...')
    .setDescription(
      `**Progression :** \`${bar}\` **${percent.toFixed(1)}%**\n` +
      `**Statut :** ${statusLabel}\n\n` +
      `• **Cadence d'envoi :** \`1 message / 60 secondes (anti-blocage)\`\n` +
      `• **Temps restant estimé :** \`~${remainingTimeStr}\`\n` +
      `• **Destinataire en cours :** \`${current}\`\n` +
      `• **Envoyés :** \`${sent} / ${total}\`\n` +
      `• **Exclus (déjà contactés aujourd'hui) :** \`${statusData.excluded_already_sent_today || getSentTodayCount()}\`\n` +
      `• **Exclus (actifs < 2h) :** \`${statusData.excluded_active || 0}\`\n` +
      `• **Ignorés (injoignables) :** \`${skipped}\`\n` +
      `• **Erreurs :** \`${failed}\``
    )
    .addFields({
      name: '💬 Contenu diffusé',
      value: (job.text && job.text.length > 250 ? job.text.substring(0, 250) + '...' : job.text) || '*[Fichier média]*',
    });

  if (job.mediaName) {
    embed.addFields({
      name: '📎 Fichier joint',
      value: `**${job.mediaName}**`,
      inline: true,
    });
  }

  embed.setFooter({ text: 'AVA Agency • Mass DM Telegram • Mise à jour en temps réel' })
    .setTimestamp();

  return embed;
}

function buildProgressButtons(draftId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`push_abort_${draftId}`)
      .setLabel('🛑 Interrompre l\'envoi')
      .setStyle(ButtonStyle.Danger)
  );
}

function buildCompletedEmbed(job, statusData) {
  const total = statusData.total || 0;
  const sent = statusData.sent || 0;
  const skipped = statusData.skipped || 0;
  const failed = statusData.failed || 0;
  const isCancelled = statusData.status === 'cancelled';
  const isFailed = statusData.status === 'failed';

  let title = '✅ PUSH TELEGRAM TERMINÉ AVEC SUCCÈS !';
  let color = 0x4caf50;
  if (isCancelled) {
    title = '⚠️ PUSH INTERROMPU PAR LE CHATTER';
    color = 0xff9800;
  } else if (isFailed) {
    title = '❌ PUSH ARRÊTÉ (ERREUR SYSTÈME)';
    color = 0xf44336;
  } else if ((sent + skipped + failed) < total && statusData.status !== 'completed') {
    title = '⚠️ PUSH TERMINÉ (INCOMPLET)';
    color = 0xff9800;
  }

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(
      `Le Mass DM lancé par <@${job.authorId}> est désormais terminé.\n\n` +
      `📊 **Bilan de diffusion :**\n` +
      `• **Messages envoyés avec succès :** \`${sent}\`\n` +
      `• **Exclus (déjà contactés aujourd'hui) :** \`${statusData.excluded_already_sent_today || getSentTodayCount()}\`\n` +
      `• **Destinataires ignorés (injoignables) :** \`${skipped}\`\n` +
      `• **Erreurs :** \`${failed}\`\n` +
      `• **Total des cibles traitées :** \`${sent + skipped + failed} / ${total}\``
    )
    .addFields({
      name: '💬 Contenu diffusé',
      value: (job.text && job.text.length > 250 ? job.text.substring(0, 250) + '...' : job.text) || '*[Média]*',
    })
    .setFooter({ text: 'AVA Agency • Mass DM Fans Kim 💖' })
    .setTimestamp();
}

// ─── Actions & Cycle de vie ────────────────────────────────────

async function setupPushPanelChannel(client) {
  if (!CHANNEL_PUSH_ID) return;
  try {
    const channel = await client.channels.fetch(CHANNEL_PUSH_ID).catch(() => null);
    if (!channel) {
      console.warn(`⚠️ Salon Push (${CHANNEL_PUSH_ID}) introuvable.`);
      return;
    }

    // Supprimer les anciens panneaux du bot pour ne garder qu'un seul panneau propre en tête
    const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    if (messages) {
      const oldPanels = messages.filter(m =>
        m.author.id === client.user.id &&
        m.embeds.length > 0 &&
        m.embeds[0]?.title?.includes('GESTIONNAIRE')
      );

      for (const [, oldMsg] of oldPanels) {
        await oldMsg.delete().catch(() => {});
      }
    }

    const embed = buildControlPanelEmbed();
    const rows = buildControlPanelButtons();
    await channel.send({ embeds: [embed], components: rows });
    console.log(`✅ Panneau Push déployé dans le salon #${channel.name} (${CHANNEL_PUSH_ID})`);
  } catch (err) {
    console.error('❌ Erreur setupPushPanelChannel :', err);
  }
}

async function updatePushPanel(client) {
  if (!CHANNEL_PUSH_ID) return;
  try {
    const channel = await client.channels.fetch(CHANNEL_PUSH_ID).catch(() => null);
    if (!channel) return;

    const messages = await channel.messages.fetch({ limit: 30 }).catch(() => null);
    if (messages) {
      const panel = messages.find(m =>
        m.author.id === client.user.id &&
        m.embeds.length > 0 &&
        m.embeds[0]?.title?.includes('GESTIONNAIRE')
      );

      if (panel) {
        const embed = buildControlPanelEmbed();
        const rows = buildControlPanelButtons();
        await panel.edit({ embeds: [embed], components: rows }).catch(() => {});
        return;
      }
    }
    // Si aucun panneau trouvé, en créer un nouveau
    await setupPushPanelChannel(client);
  } catch (err) {
    console.error('⚠️ Erreur mise à jour panneau push :', err);
  }
}

async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const client = url.startsWith('https') ? https : http;
    client.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve(destPath));
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

function isPushRunning() {
  const st = readStatus();
  return currentJob !== null || st.status === 'running' || st.status === 'paused_floodwait' || st.status === 'paused_flood';
}

function cancelRunningPush() {
  const flagFile = path.join(SCRIPT_DIR, 'push_cancel.flag');
  try {
    fs.writeFileSync(flagFile, 'cancel', 'utf-8');
    console.log('🛑 Fichier push_cancel.flag créé.');
  } catch (e) {
    console.error('⚠️ Erreur création flag annulation:', e);
  }
}

async function startPush(draft, channel, client) {
  if (isPushRunning()) {
    throw new Error('Un push est déjà en cours.');
  }

  currentJob = draft;
  const config = readConfig();
  const excludeHours = draft.excludeHours || config.exclude_active_hours || 2.0;

  // Créer le message de progression dans Discord
  const initialEmbed = buildProgressEmbed(draft, {
    status: 'running',
    percent: 0,
    total: getCachedFansCount(),
    sent: 0,
    skipped: 0,
    failed: 0,
    current_recipient: 'Initialisation des contacts...'
  });
  const actionRow = buildProgressButtons(draft.id);

  const progressMsg = await channel.send({
    embeds: [initialEmbed],
    components: [actionRow]
  });

  const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
  const delayMin = config.delay_min || 58.0;
  const delayMax = config.delay_max || 62.0;
  const targetSegment = draft.targetSegment || 'all';
  const autoDeleteHours = draft.autoDeleteHours || 0.0;

  const args = [
    '-u',
    WORKER_SCRIPT,
    '--action', 'send',
    '--job-id', draft.id,
    '--text', draft.text || '',
    '--exclude-hours', String(excludeHours),
    '--delay-min', String(delayMin),
    '--delay-max', String(delayMax),
    '--target-segment', String(targetSegment),
    '--auto-delete-hours', String(autoDeleteHours)
  ];

  if (draft.mediaPath && fs.existsSync(draft.mediaPath)) {
    args.push('--media', draft.mediaPath);
  }

  console.log(`[PUSH] Lancement du worker Python : ${pyCmd} ${args.join(' ')}`);

  currentChildProcess = spawn(pyCmd, args, {
    cwd: SCRIPT_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  currentChildProcess.stdout.on('data', (d) => {
    console.log(`[PUSH WORKER] ${d.toString().trim()}`);
  });

  currentChildProcess.stderr.on('data', (d) => {
    console.error(`[PUSH WORKER ERR] ${d.toString().trim()}`);
  });

  // Polling du statut toutes les 3 secondes pour mettre à jour Discord
  let lastEditTime = Date.now();
  if (pollInterval) clearInterval(pollInterval);

  pollInterval = setInterval(async () => {
    try {
      const statusData = readStatus();
      if (!currentJob) {
        clearInterval(pollInterval);
        return;
      }

      if (Date.now() - lastEditTime >= 3500) {
        lastEditTime = Date.now();
        const updatedEmbed = buildProgressEmbed(draft, statusData);
        await progressMsg.edit({ embeds: [updatedEmbed], components: [actionRow] }).catch(() => {});
      }

      if (['completed', 'cancelled', 'failed'].includes(statusData.status)) {
        clearInterval(pollInterval);
        pollInterval = null;
        currentJob = null;
        currentChildProcess = null;

        const finalEmbed = buildCompletedEmbed(draft, statusData);
        await progressMsg.edit({ embeds: [finalEmbed], components: [] }).catch(() => {});
        draftPushes.delete(draft.id);
        if (client) await updatePushPanel(client);
      }
    } catch (pollErr) {
      console.error('[PUSH POLL ERR]', pollErr);
    }
  }, 3000);

  currentChildProcess.on('close', async (code) => {
    console.log(`[PUSH WORKER] Terminé avec code ${code}`);
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    const finalStatus = readStatus();
    if (currentJob) {
      currentJob = null;
      currentChildProcess = null;
      const finalEmbed = buildCompletedEmbed(draft, finalStatus);
      await progressMsg.edit({ embeds: [finalEmbed], components: [] }).catch(() => {});
      draftPushes.delete(draft.id);
      if (client) await updatePushPanel(client);
    }
  });

  return progressMsg;
}

// ─── Moteur Auto-Push Quotidien ────────────────────────────────

async function checkAndTriggerAutoPush(client) {
  if (!client) return;
  const autoConfig = readAutoPushConfig();
  if (!autoConfig.enabled) return;
  if (isPushRunning()) return;

  const now = new Date();
  const todayStr = now.toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
  const timeStr = now.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });

  for (const slot of autoConfig.slots) {
    if (!slot.enabled) continue;
    if (slot.last_run === todayStr) continue;

    const scheduledToday = getSlotScheduledTimeForToday(slot, autoConfig, todayStr);

    // Comparaison avec l'heure courante (format HH:MM)
    if (timeStr === scheduledToday) {
      console.log(`⏰ [Auto-Push] Déclenchement du créneau ${slot.id} (${slot.time} -> calculé ${scheduledToday}) pour ${slot.target_label}`);

      const channel = await client.channels.fetch(CHANNEL_PUSH_ID).catch(() => null);
      if (!channel) {
        console.warn('⚠️ Salon #push introuvable pour Auto-Push');
        return;
      }

      // Si aucun texte ni média n'est configuré
      if (!slot.text && !slot.media_path) {
        slot.last_run = todayStr;
        saveAutoPushConfig(autoConfig);
        await channel.send({
          content: `⚠️ **[Auto-Push Quotidien]** Le créneau de **${slot.time} (${slot.target_label})** était programmé pour maintenant, mais aucun message n'a été déposé par les chatters ! Le créneau est ignoré pour aujourd'hui.`
        }).catch(() => {});
        await updatePushPanel(client);
        return;
      }

      // Marquer le créneau comme exécuté aujourd'hui
      slot.last_run = todayStr;
      saveAutoPushConfig(autoConfig);

      await channel.send({
        content: `🚀 **[Auto-Push Quotidien]** Démarrage automatique du créneau de **${slot.time}** (Cible : **${slot.target_label}**) !`
      }).catch(() => {});

      const autoDraft = {
        id: `auto_${slot.id}_${Date.now()}`,
        authorId: client.user.id,
        authorTag: 'Auto-Push Robot',
        text: slot.text || '',
        mediaPath: slot.media_path,
        mediaName: slot.media_name,
        targetSegment: slot.target || 'all',
        targetSegmentLabel: slot.target_label || 'Abonnés',
        autoDeleteHours: autoConfig.auto_delete_hours || 0,
        excludeHours: autoConfig.exclude_active_hours || 2.0,
        createdAt: Date.now()
      };

      try {
        await startPush(autoDraft, channel, client);
      } catch (err) {
        console.error('❌ Erreur lancement Auto-Push :', err);
        await channel.send({
          content: `❌ **[Auto-Push]** Erreur lors du lancement automatique : ${err.message}`
        }).catch(() => {});
      }

      await updatePushPanel(client);
      return; // Ne lancer qu'un seul créneau à la fois
    }
  }
}

function startAutoPushCron(client) {
  if (autoPushCronTask) return;
  // Exécution chaque minute pour vérifier les créneaux d'Auto-Push
  autoPushCronTask = cron.schedule('* * * * *', async () => {
    try {
      await checkAndTriggerAutoPush(client);
    } catch (e) {
      console.error('❌ Erreur cron Auto-Push :', e);
    }
  }, {
    timezone: 'Europe/Paris'
  });
  console.log('✅ Auto-Push Quotidien cron démarré (vérification toutes les minutes, Europe/Paris)');
}

module.exports = {
  CHANNEL_PUSH_ID,
  DATA_MEDIA_DIR,
  LOCAL_MEDIA_DIR,
  draftPushes,
  readConfig,
  readStatus,
  readAutoPushConfig,
  saveAutoPushConfig,
  getSlotScheduledTimeForToday,
  getCachedFansCount,
  getMediaType,
  buildControlPanelEmbed,
  buildControlPanelButtons,
  buildDraftEmbed,
  buildDraftButtons,
  buildProgressEmbed,
  buildCompletedEmbed,
  setupPushPanelChannel,
  updatePushPanel,
  downloadFile,
  isPushRunning,
  cancelRunningPush,
  startPush,
  checkAndTriggerAutoPush,
  startAutoPushCron
};

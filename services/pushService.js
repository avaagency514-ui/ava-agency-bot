/**
 * services/pushService.js
 * Gestionnaire du système Mass DM / Push Telegram pour Kim 💖.
 * Permet aux chatters d'envoyer des messages et médias en masse aux fans.
 */
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const CHANNEL_PUSH_ID = process.env.CHANNEL_PUSH || '1567586328168628245';
const SCRIPT_DIR = path.join(__dirname, '..', 'telegram', 'push');
const WORKER_SCRIPT = path.join(SCRIPT_DIR, 'push_worker.py');
const STATUS_FILE = path.join(SCRIPT_DIR, 'push_status.json');
const CONFIG_FILE = path.join(SCRIPT_DIR, 'push_config.json');
const SESSION_FILE = path.join(SCRIPT_DIR, 'session_push.session');
const MEDIA_DIR = path.join(__dirname, '..', 'temp', 'push_media');

if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

// État mémoire
const draftPushes = new Map();
let currentJob = null;
let currentChildProcess = null;
let pollInterval = null;

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
    delay_min: 2.5,
    delay_max: 4.5
  };
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

function makeProgressBar(percent, length = 14) {
  const p = Math.max(0, Math.min(100, percent || 0));
  const filled = Math.round((p / 100) * length);
  const empty = length - filled;
  return '▰'.repeat(filled) + '▱'.repeat(empty);
}

// ─── Embeds & Panneaux ─────────────────────────────────────────

function buildControlPanelEmbed() {
  const config = readConfig();
  const cachedCount = getCachedFansCount();

  return new EmbedBuilder()
    .setColor(0xec407a)
    .setTitle('📢 GESTIONNAIRE DE PUSH — MASS DM FANS (KIM 💖)')
    .setDescription(
      `Bienvenue sur l'interface **Push Telegram** pour **${config.model_name || 'Kim 💖'}** (${config.handle || '@kimchle'}).\n` +
      `Ce système permet d'envoyer un message privé direct (Mass DM) à **tous les fans** ayant engagé la conversation avec Kim.\n\n` +
      `📌 **Comment envoyer un Push ?**\n` +
      `• **Méthode 1 :** Clique sur **🚀 Nouveau Push** ci-dessous pour ouvrir l'éditeur.\n` +
      `• **Méthode 2 :** Envoie directement ton texte avec ou sans photo/vidéo **dans ce salon** !\n` +
      `• Le bot générera automatiquement un aperçu complet avec boutons de confirmation.`
    )
    .addFields(
      {
        name: '🎯 Destinataires',
        value: `**${cachedCount}+** fans en base privée\n*(Tous les fans ayant écrit à Kim)*`,
        inline: true,
      },
      {
        name: '🔇 Sécurité Échanges',
        value: `Exclut les fans actifs **< ${config.exclude_active_hours || 2}h**\n*(Ne coupe pas les ventes en cours)*`,
        inline: true,
      },
      {
        name: '🛡️ Cadence Anti-Ban',
        value: `Tempo humaine : **${config.delay_min || 2.5}s – ${config.delay_max || 4.5}s**\n*Gestion FloodWait automatique*`,
        inline: true,
      }
    )
    .setFooter({ text: 'AVA Agency • Système Push Telegram V2 • 24/7 Cloud' })
    .setTimestamp();
}

function buildControlPanelButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('push_btn_new')
      .setLabel('🚀 Nouveau Push')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('push_btn_stats')
      .setLabel('📊 Statistiques Fans')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('push_btn_settings')
      .setLabel('⚙️ Options de Ciblage')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('push_btn_refresh')
      .setLabel('🔄 Rafraîchir')
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildDraftEmbed(draft) {
  const config = readConfig();
  const cachedCount = getCachedFansCount();

  const embed = new EmbedBuilder()
    .setColor(0xff9800)
    .setTitle('📝 PRÉVISUALISATION DU PUSH TELEGRAM')
    .setDescription(
      `Ce message est prêt à être diffusé en DM à l'ensemble des fans de **Kim**.\n` +
      `Vérifie les informations ci-dessous avant de valider l'envoi.`
    )
    .addFields(
      {
        name: '✍️ Auteur (Chatter)',
        value: `<@${draft.authorId}>`,
        inline: true,
      },
      {
        name: '🎯 Destinataires estimés',
        value: `**~${cachedCount} fans** *(DMs privés)*`,
        inline: true,
      },
      {
        name: '🔇 Exclusion fans récents',
        value: `Dernières **${draft.excludeHours || config.exclude_active_hours || 2}h**`,
        inline: true,
      },
      {
        name: '💬 Message',
        value: draft.text && draft.text.trim() ? draft.text : '*[Aucun texte — Média seul]*',
      }
    );

  if (draft.mediaName) {
    embed.addFields({
      name: '📎 Pièce jointe',
      value: `📁 **${draft.mediaName}**`,
      inline: false,
    });
  }

  if (draft.mediaUrl && (draft.mediaUrl.endsWith('.jpg') || draft.mediaUrl.endsWith('.png') || draft.mediaUrl.endsWith('.jpeg') || draft.mediaUrl.endsWith('.webp'))) {
    embed.setImage(draft.mediaUrl);
  }

  embed.setFooter({ text: 'Clique sur Confirmer pour lancer le Mass DM ou Annuler pour effacer' });
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
  const total = statusData.total || getCachedFansCount();
  const sent = statusData.sent || 0;
  const skipped = statusData.skipped || 0;
  const failed = statusData.failed || 0;
  const current = statusData.current_recipient || 'Initialisation...';
  const statusLabel = statusData.status === 'paused_floodwait' 
    ? '⏳ En pause FloodWait Telegram (reprise auto...)' 
    : '🚀 Envoi en cours...';

  const embed = new EmbedBuilder()
    .setColor(0x2196f3)
    .setTitle('⏳ PUSH EN COURS D\'ENVOI (MASS DM)')
    .setDescription(
      `**Progression :** \`${bar}\` **${percent.toFixed(1)}%**\n` +
      `**Statut :** ${statusLabel}\n\n` +
      `• **Destinataire en cours :** \`${current}\`\n` +
      `• **Envoyés :** \`${sent} / ${total}\`\n` +
      `• **Ignorés (DMs fermés/inactifs) :** \`${skipped}\`\n` +
      `• **Erreurs :** \`${failed}\``
    )
    .addFields({
      name: '💬 Aperçu du message',
      value: (job.text && job.text.length > 200 ? job.text.substring(0, 200) + '...' : job.text) || '*[Média]*',
    })
    .setFooter({ text: `Lancé par ${job.authorTag || 'Chatter'} • ID: ${job.id}` })
    .setTimestamp();

  return embed;
}

function buildProgressButtons(jobId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`push_abort_${jobId}`)
      .setLabel('🛑 Interrompre le Push')
      .setStyle(ButtonStyle.Danger)
  );
}

function buildCompletedEmbed(job, statusData) {
  const total = statusData.total || statusData.sent || 0;
  const sent = statusData.sent || 0;
  const skipped = statusData.skipped || 0;
  const failed = statusData.failed || 0;
  const isCancelled = statusData.status === 'cancelled';

  return new EmbedBuilder()
    .setColor(isCancelled ? 0xff9800 : 0x4caf50)
    .setTitle(isCancelled ? '⚠️ PUSH INTERROMPU PAR LE CHATTER' : '✅ PUSH TELEGRAM TERMINÉ AVEC SUCCÈS !')
    .setDescription(
      `Le Mass DM lancé par <@${job.authorId}> est désormais terminé.\n\n` +
      `📊 **Bilan de diffusion :**\n` +
      `• **Messages envoyés avec succès :** \`${sent}\`\n` +
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
        m.embeds[0]?.title?.includes('GESTIONNAIRE DE PUSH')
      );

      for (const [, oldMsg] of oldPanels) {
        await oldMsg.delete().catch(() => {});
      }
    }

    const embed = buildControlPanelEmbed();
    const row = buildControlPanelButtons();
    await channel.send({ embeds: [embed], components: [row] });
    console.log(`✅ Panneau Push déployé dans le salon #${channel.name} (${CHANNEL_PUSH_ID})`);
  } catch (err) {
    console.error('❌ Erreur setupPushPanelChannel :', err);
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
  return currentJob !== null || st.status === 'running' || st.status === 'paused_floodwait';
}

function cancelRunningPush() {
  if (currentChildProcess) {
    try {
      const cancelFlag = path.join(SCRIPT_DIR, 'push_cancel.flag');
      fs.writeFileSync(cancelFlag, 'CANCEL', 'utf-8');
    } catch (e) {}
  }
}

async function startPush(draft, channel, client) {
  if (isPushRunning()) {
    throw new Error('Un Push est déjà en cours d\'envoi ! Attends qu\'il se termine ou interromps-le.');
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
  const args = [
    '-u',
    WORKER_SCRIPT,
    '--action', 'send',
    '--job-id', draft.id,
    '--text', draft.text || '',
    '--exclude-hours', String(excludeHours)
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
    }
  });

  return progressMsg;
}

module.exports = {
  CHANNEL_PUSH_ID,
  draftPushes,
  readConfig,
  readStatus,
  getCachedFansCount,
  buildControlPanelEmbed,
  buildControlPanelButtons,
  buildDraftEmbed,
  buildDraftButtons,
  buildProgressEmbed,
  buildCompletedEmbed,
  setupPushPanelChannel,
  downloadFile,
  isPushRunning,
  cancelRunningPush,
  startPush
};

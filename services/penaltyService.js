/**
 * services/penaltyService.js
 * Gestion et publication des pénalisations et sanctions pour :
 * - VAs et Chatters (diffusé dans #annonce-general : 1496964824578523356)
 * - Managers (diffusé dans #annonce : 1557145812482523167)
 * - Panneau de commande dans #penalisation : 1565396114302312459
 */
'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { db } = require('../database/db');

// ─── Initialisation des tables SQLite ─────────────────────────────────────────
function initPenaltyTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agency_penalties (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      target_category         TEXT NOT NULL, -- 'Chatter', 'VA', 'Manager'
      target_name             TEXT NOT NULL,
      target_discord_id       TEXT,
      penalty_type_amount     TEXT NOT NULL,
      reason                  TEXT NOT NULL,
      details                 TEXT,
      financial_deduction     REAL DEFAULT 0.0,
      issued_by_id            TEXT NOT NULL,
      issued_by_name          TEXT NOT NULL,
      destination_channel_id  TEXT NOT NULL,
      status                  TEXT NOT NULL DEFAULT 'ACTIVE',
      revoked_by_id           TEXT,
      revoked_by_name         TEXT,
      revoked_reason          TEXT,
      revoked_at              TEXT,
      created_at              TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  try {
    const cols = db.prepare('PRAGMA table_info(agency_penalties)').all().map(c => c.name);
    if (!cols.includes('status')) db.exec("ALTER TABLE agency_penalties ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';");
    if (!cols.includes('revoked_by_id')) db.exec("ALTER TABLE agency_penalties ADD COLUMN revoked_by_id TEXT;");
    if (!cols.includes('revoked_by_name')) db.exec("ALTER TABLE agency_penalties ADD COLUMN revoked_by_name TEXT;");
    if (!cols.includes('revoked_reason')) db.exec("ALTER TABLE agency_penalties ADD COLUMN revoked_reason TEXT;");
    if (!cols.includes('revoked_at')) db.exec("ALTER TABLE agency_penalties ADD COLUMN revoked_at TEXT;");
  } catch (_) {}
}

// ─── Enregistrement d'une nouvelle pénalité ───────────────────────────────────
function recordAgencyPenalty({
  targetCategory,
  targetName,
  targetDiscordId = null,
  penaltyTypeAmount,
  reason,
  details = '',
  issuedById,
  issuedByName,
  destinationChannelId,
}) {
  // Extraire le montant numérique si applicable (ex: "1$", "5.00$", "10", etc.)
  let financialDeduction = 0.0;
  const matchAmount = penaltyTypeAmount.match(/([0-9]+(?:[.,][0-9]{1,2})?)/);
  if (matchAmount) {
    financialDeduction = parseFloat(matchAmount[1].replace(',', '.'));
  }

  // 1. Sauvegarde générale dans agency_penalties
  const stmt = db.prepare(`
    INSERT INTO agency_penalties (
      target_category,
      target_name,
      target_discord_id,
      penalty_type_amount,
      reason,
      details,
      financial_deduction,
      issued_by_id,
      issued_by_name,
      destination_channel_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    targetCategory,
    targetName,
    targetDiscordId,
    penaltyTypeAmount,
    reason,
    details,
    financialDeduction,
    issuedById,
    issuedByName,
    destinationChannelId
  );

  const penaltyId = info.lastInsertRowid;

  // 2. Si c'est un Chatter, tenter d'interconnecter avec chatter_penalties pour déduction directe
  let linkedChatter = null;
  if (targetCategory === 'Chatter') {
    try {
      // Nettoyer le nom ou mention
      const cleanName = targetName.replace(/[<@!>]/g, '').trim().toLowerCase();
      const allChatters = db.prepare('SELECT * FROM chatters').all();
      
      linkedChatter = allChatters.find(c => 
        c.name.toLowerCase() === cleanName ||
        (c.discord_user_id && c.discord_user_id === cleanName) ||
        targetName.toLowerCase().includes(c.name.toLowerCase())
      );

      if (linkedChatter) {
        if (financialDeduction > 0) {
          db.prepare(`
            INSERT INTO chatter_penalties (chatter_id, chatter_name, amount, reason)
            VALUES (?, ?, ?, ?)
          `).run(
            linkedChatter.id,
            linkedChatter.name,
            financialDeduction,
            `Sanction manuelle (${penaltyTypeAmount}) : ${reason}`
          );
        }

        // Ajouter également un avertissement (strike) dans le dossier du chatter
        db.prepare(`
          INSERT INTO chatter_strikes (chatter_id, chatter_name, strike_type, date, details)
          VALUES (?, ?, 'manuelle', date('now'), ?)
        `).run(
          linkedChatter.id,
          linkedChatter.name,
          `Sanction manuelle : ${reason} (${penaltyTypeAmount})`
        );
      }
    } catch (err) {
      console.error('Erreur liaison automatique pénalité Chatter :', err);
    }
  }

  return {
    id: penaltyId,
    targetCategory,
    targetName,
    targetDiscordId,
    penaltyTypeAmount,
    reason,
    details,
    financialDeduction,
    issuedById,
    issuedByName,
    destinationChannelId,
    linkedChatter,
    createdAt: new Date().toISOString(),
  };
}

// ─── Récupérer les dernières sanctions ───────────────────────────────────────
function getRecentPenalties(limit = 10) {
  return db.prepare(`
    SELECT * FROM agency_penalties
    ORDER BY id DESC
    LIMIT ?
  `).all(limit);
}

// ─── Récupérer les sanctions actives uniquement ─────────────────────────────
function getActivePenalties(limit = 25) {
  return db.prepare(`
    SELECT * FROM agency_penalties
    WHERE status != 'REVOKED'
    ORDER BY id DESC
    LIMIT ?
  `).all(limit);
}

// ─── Récupérer une sanction par son ID ───────────────────────────────────────
function getPenaltyById(id) {
  return db.prepare(`
    SELECT * FROM agency_penalties WHERE id = ?
  `).get(id);
}

// ─── Récupération des salons de destination par catégorie ────────────────────
function getPenaltyChannelsForCategory(category) {
  if (category === 'Manager') {
    const fromEnv = process.env.CHANNELS_PENALTY_MANAGER || process.env.CHANNEL_PENALTY_MANAGER;
    if (fromEnv) return fromEnv.split(',').map(s => s.trim()).filter(Boolean);
    return ['1555451317575491604'];
  }
  if (category === 'VA') {
    const fromEnv = process.env.CHANNELS_PENALTY_VA;
    if (fromEnv) return fromEnv.split(',').map(s => s.trim()).filter(Boolean);
    return [
      '1554408883232178266',
      '1555536697196806234',
      '1556215767547117578',
      '1556963731508826122',
      '1555244917968609372',
      '1556585338200133663',
    ];
  }
  if (category === 'Chatter') {
    const fromEnv = process.env.CHANNELS_PENALTY_CHATTER;
    if (fromEnv) return fromEnv.split(',').map(s => s.trim()).filter(Boolean);
    return [
      '1567216877682298890',
      '1555280409682514000',
    ];
  }
  return [];
}

// ─── Publication de la sanction dans les salons dédiés ──────────────────────
async function publishPenaltyAnnouncement(client, record) {
  const channelsList = getPenaltyChannelsForCategory(record.targetCategory);

  if (record.destinationChannelId) {
    const customIds = record.destinationChannelId.split(',').map(s => s.trim()).filter(Boolean);
    for (const cid of customIds) {
      if (!channelsList.includes(cid) && cid.length >= 17) {
        channelsList.push(cid);
      }
    }
  }

  if (channelsList.length === 0) {
    console.warn(`⚠️ Aucun salon de destination pour la catégorie ${record.targetCategory}`);
    return { success: false, error: 'Aucun salon configuré' };
  }

  const now = new Date();
  const dateFormatted = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  }).format(now);

  const isManager = record.targetCategory === 'Manager';
  const roleEmoji = isManager ? '👔' : (record.targetCategory === 'Chatter' ? '💬' : '📱');

  const embed = new EmbedBuilder()
    .setColor(0xed4245) // Rouge Sanction
    .setTitle(
      isManager
        ? `⚖️ AVIS OFFICIEL DE SANCTION — MANAGEMENT`
        : `🚨 AVIS DE SANCTION DISCIPLINAIRE — ${record.targetCategory.toUpperCase()}`
    )
    .setDescription(
      `Une sanction officielle a été prononcée et enregistrée par la direction de l'agence.\n` +
      `Merci à l'ensemble de l'équipe de respecter scrupuleusement les règles et consignes établies.`
    )
    .addFields(
      {
        name: `${roleEmoji} Membre sanctionné`,
        value: `**${record.targetName}**`,
        inline: true,
      },
      {
        name: `🏷️ Catégorie / Poste`,
        value: `**${record.targetCategory}**`,
        inline: true,
      },
      {
        name: `💸 Sanction appliquée`,
        value: `\`${record.penaltyTypeAmount}\``,
        inline: true,
      },
      {
        name: `⚠️ Motif de la sanction`,
        value: `${record.reason}`,
        inline: false,
      }
    );

  if (record.details && record.details.trim()) {
    embed.addFields({
      name: `📝 Détails & Contexte`,
      value: `${record.details.trim()}`,
      inline: false,
    });
  }

  if (record.financialDeduction > 0 && record.targetCategory === 'Chatter') {
    embed.addFields({
      name: `💳 Retenue financière`,
      value: `✅ Déduction de **$${record.financialDeduction.toFixed(2)}** automatiquement appliquée sur le solde de commissions du cycle.`,
      inline: false,
    });
  }

  embed.addFields(
    {
      name: `👮 Émise par`,
      value: `<@${record.issuedById}>`,
      inline: true,
    },
    {
      name: `📅 Date d'enregistrement`,
      value: `${dateFormatted}`,
      inline: true,
    }
  );

  embed
    .setFooter({ text: 'AVA Agency • Système Disciplinaire Officiel' })
    .setTimestamp();

  const sentChannels = [];
  for (const chId of channelsList) {
    try {
      const channel = await client.channels.fetch(chId).catch(() => null);
      if (channel) {
        await channel.send({ embeds: [embed] });
        sentChannels.push(channel.name || chId);
      } else {
        console.warn(`⚠️ Salon de pénalité introuvable (${chId})`);
      }
    } catch (err) {
      console.error(`❌ Erreur diffusion sanction dans ${chId} :`, err.message);
    }
  }

  return { success: sentChannels.length > 0, sentCount: sentChannels.length, sentChannels };
}

// ─── Publication de l'avis officiel de levée de sanction ─────────────────────
async function publishPenaltyRevocationAnnouncement(client, {
  penalty,
  revokedById,
  revokedByName,
  revokedReason,
  financialRestored = 0.0,
}) {
  const channelsList = getPenaltyChannelsForCategory(penalty.target_category);

  if (penalty.destination_channel_id) {
    const customIds = penalty.destination_channel_id.split(',').map(s => s.trim()).filter(Boolean);
    for (const cid of customIds) {
      if (!channelsList.includes(cid) && cid.length >= 17) {
        channelsList.push(cid);
      }
    }
  }

  if (channelsList.length === 0) return { success: false };

  const now = new Date();
  const dateFormatted = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  }).format(now);

  const isManager = penalty.target_category === 'Manager';
  const roleEmoji = isManager ? '👔' : (penalty.target_category === 'Chatter' ? '💬' : '📱');

  const embed = new EmbedBuilder()
    .setColor(0x57f287) // Vert Rétablissement
    .setTitle(`🕊️ AVIS OFFICIEL — LEVÉE DE SANCTION DISCIPLINAIRE`)
    .setDescription(
      `La direction d'**AVA Agency** annonce que la sanction prononcée à l'encontre de **${penalty.target_name}** (${penalty.target_category}) a été **officiellement levée et annulée**.\n` +
      `Le dossier du membre est régularisé et ses droits sont pleinement rétablis.`
    )
    .addFields(
      {
        name: `${roleEmoji} Membre réhabilité`,
        value: `**${penalty.target_name}**`,
        inline: true,
      },
      {
        name: `🏷️ Catégorie / Poste`,
        value: `**${penalty.target_category}**`,
        inline: true,
      },
      {
        name: `💸 Sanction annulée`,
        value: `~~\`${penalty.penalty_type_amount}\`~~ *(Annulée)*`,
        inline: true,
      },
      {
        name: `⚖️ Motif de la sanction initiale`,
        value: `*${penalty.reason}*`,
        inline: false,
      },
      {
        name: `🕊️ Motif de la levée de sanction`,
        value: `**${revokedReason || 'Décision de la direction / Régularisation complète'}**`,
        inline: false,
      }
    );

  if (financialRestored > 0) {
    embed.addFields({
      name: `💳 Rétablissement Financier`,
      value: `✅ La retenue de **$${financialRestored.toFixed(2)}** a été **restituée** au solde de commissions de **${penalty.target_name}**.`,
      inline: false,
    });
  }

  embed.addFields(
    {
      name: `👮 Levée prononcée par`,
      value: `<@${revokedById}>`,
      inline: true,
    },
    {
      name: `📅 Date de levée`,
      value: `${dateFormatted}`,
      inline: true,
    }
  );

  embed
    .setFooter({ text: 'AVA Agency • Réhabilitation & Justice Disciplinaire' })
    .setTimestamp();

  for (const chId of channelsList) {
    try {
      const channel = await client.channels.fetch(chId).catch(() => null);
      if (channel) {
        await channel.send({ embeds: [embed] });
      }
    } catch (_) {}
  }

  return { success: true };
}

// ─── Lever / Annuler une sanction ────────────────────────────────────────────
async function revokeAgencyPenalty({
  penaltyId,
  revokedById,
  revokedByName,
  revokedReason = 'Décision de la direction / Régularisation',
  broadcastAnnouncement = true,
  client = null,
}) {
  const penalty = getPenaltyById(penaltyId);
  if (!penalty) {
    return { success: false, error: 'Sanction introuvable dans le registre.' };
  }

  if (penalty.status === 'REVOKED') {
    return { success: false, error: `Cette sanction (#${penaltyId}) a déjà été levée le ${penalty.revoked_at || 'antérieurement'}.` };
  }

  // 1. Mettre à jour le statut dans SQLite
  db.prepare(`
    UPDATE agency_penalties
    SET status = 'REVOKED',
        revoked_by_id = ?,
        revoked_by_name = ?,
        revoked_reason = ?,
        revoked_at = datetime('now')
    WHERE id = ?
  `).run(revokedById, revokedByName, revokedReason, penaltyId);

  let financialRestored = 0.0;
  let strikesRemoved = 0;

  // 2. Si c'est un Chatter : annuler déduction financière & strike
  if (penalty.target_category === 'Chatter') {
    try {
      const cleanName = penalty.target_name.replace(/[<@!>]/g, '').trim().toLowerCase();
      // Supprimer de chatter_penalties
      const cpRows = db.prepare(`
        SELECT * FROM chatter_penalties
        WHERE (LOWER(chatter_name) = ? OR chatter_name LIKE ?)
      `).all(cleanName, `%${cleanName}%`);

      // Trouver celle qui correspond au montant ou au motif
      for (const cp of cpRows) {
        if (penalty.financial_deduction > 0 && Math.abs(cp.amount - penalty.financial_deduction) < 0.01) {
          financialRestored += cp.amount;
          db.prepare('DELETE FROM chatter_penalties WHERE id = ?').run(cp.id);
          break;
        } else if (cp.reason && cp.reason.includes(penalty.reason.slice(0, 15))) {
          financialRestored += cp.amount;
          db.prepare('DELETE FROM chatter_penalties WHERE id = ?').run(cp.id);
          break;
        }
      }

      // Supprimer le strike associé dans chatter_strikes
      const strikeRows = db.prepare(`
        SELECT * FROM chatter_strikes
        WHERE (LOWER(chatter_name) = ? OR chatter_name LIKE ?)
      `).all(cleanName, `%${cleanName}%`);

      for (const st of strikeRows) {
        if (st.details && (st.details.includes(penalty.reason.slice(0, 15)) || st.details.includes(penalty.penalty_type_amount))) {
          strikesRemoved++;
          db.prepare('DELETE FROM chatter_strikes WHERE id = ?').run(st.id);
          break;
        }
      }
    } catch (err) {
      console.error('Erreur annulation pénalité Chatter :', err);
    }
  }

  // 3. Diffuser l'avis officiel de réhabilitation si demandé
  if (broadcastAnnouncement && client) {
    await publishPenaltyRevocationAnnouncement(client, {
      penalty,
      revokedById,
      revokedByName,
      revokedReason,
      financialRestored,
    }).catch(err => {
      console.error('Erreur diffusion levée de sanction :', err);
    });
  }

  return {
    success: true,
    penalty,
    financialRestored,
    strikesRemoved,
  };
}

// ─── Mise en place du panneau interactif dans #penalisation ──────────────────
async function setupPenaltyPanelChannel(client) {
  const panelChannelId = process.env.CHANNEL_PENALTY_PANEL || '1565396114302312459';
  const channel = await client.channels.fetch(panelChannelId).catch(() => null);

  if (!channel) {
    console.warn(`⚠️ Salon Panneau Pénalités introuvable (${panelChannelId}). Vérifie le .env`);
    return;
  }

  // Purger les anciens messages du bot dans ce salon pour garder un panneau toujours propre
  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (messages) {
    const oldMessages = messages.filter(m =>
      m.author.id === client.user.id &&
      m.embeds.length > 0 &&
      (m.embeds[0]?.title?.includes('PÉNALISATIONS') || m.embeds[0]?.title?.includes('SANCTIONS'))
    );
    for (const [, oldMsg] of oldMessages) {
      await oldMsg.delete().catch(() => {});
    }
  }

  const managerChannelId = process.env.CHANNEL_PENALTY_MANAGER || '1557145812482523167';
  const vaChatterChannelId = process.env.CHANNEL_PENALTY_VA_CHATTER || '1496964824578523356';

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle('⚖️ CENTRE DE CONTRÔLE — PÉNALISATIONS & SANCTIONS')
    .setDescription(
      `Bienvenue sur le terminal de gestion disciplinaire d'**AVA Agency**.\n\n` +
      `Ce salon permet aux fondateurs et à la direction de formuler des avertissements officiels et d'imposer des sanctions financières directes en cas de non-respect des règles.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 **ROUTAGE AUTOMATIQUE DES NOTIFICATIONS :**\n` +
      `• 👔 **Managers** ➔ Diffusé dans <#1555451317575491604>\n` +
      `• 📱 **VAs** ➔ Diffusé dans les **6 salons de discussion VAs**\n` +
      `• 💬 **Chatters** ➔ Diffusé dans les **2 salons de discussion Chatters** (<#1567216877682298890>, <#1555280409682514000>) + déduction financière sur commissions\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `👇 **Cliquez ci-dessous sur le profil concerné pour ouvrir le formulaire :**`
    )
    .addFields(
      {
        name: '💬 Pénaliser un Chatter',
        value: 'Retards répétés, oublis de pointage, ventes non déclarées, retenue sur commissions.',
        inline: true,
      },
      {
        name: '📱 Pénaliser un VA',
        value: 'Objectifs non tenus, inactivité, non-respect des plannings de publication.',
        inline: true,
      },
      {
        name: '👔 Pénaliser un Manager',
        value: 'Défaut de supervision, absence de suivi des équipes, non-respect des directives.',
        inline: true,
      }
    )
    .setFooter({ text: 'AVA Agency • Direction & Supervision' })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('penalty_btn_chatter')
      .setLabel('💬 Pénaliser Chatter')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('penalty_btn_va')
      .setLabel('📱 Pénaliser VA')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('penalty_btn_manager')
      .setLabel('👔 Pénaliser Manager')
      .setStyle(ButtonStyle.Danger)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('penalty_btn_revoke')
      .setLabel('🕊️ Lever une Sanction')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('penalty_btn_history')
      .setLabel('📜 Historique & Statuts')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('penalty_btn_refresh')
      .setLabel('🔄 Actualiser')
      .setStyle(ButtonStyle.Secondary)
  );

  await channel.send({
    embeds: [embed],
    components: [row1, row2],
  });

  console.log(`✅ Panneau de Pénalisation configuré dans #${channel.name || panelChannelId}`);
}

module.exports = {
  initPenaltyTables,
  recordAgencyPenalty,
  getRecentPenalties,
  getActivePenalties,
  getPenaltyById,
  revokeAgencyPenalty,
  publishPenaltyRevocationAnnouncement,
  getPenaltyChannelsForCategory,
  publishPenaltyAnnouncement,
  setupPenaltyPanelChannel,
};

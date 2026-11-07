/**
 * services/smsQuotaService.js
 * Gestion des quotas SMSPool par VA (limite stricte de 5 numéros par défaut)
 * et système d'approbation interactive par les Managers / Fondateurs.
 */
const { db } = require('../database/db');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

const DEFAULT_SMS_LIMIT = 5;

// Cache en mémoire pour éviter le spam de demandes d'approbation simultanées
const pendingApprovalRequests = new Set();

/**
 * Initialise les tables SQLite pour les quotas et l'historique SMS
 */
function initSmsTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sms_quotas (
      user_id       TEXT PRIMARY KEY,
      max_numbers   INTEGER DEFAULT 5,
      bonus_granted INTEGER DEFAULT 0,
      updated_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sms_usage (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       TEXT NOT NULL,
      order_id      TEXT NOT NULL,
      phonenumber   TEXT,
      service       TEXT DEFAULT 'instagram',
      status        TEXT DEFAULT 'active',
      created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sms_usage_user ON sms_usage(user_id);
    CREATE INDEX IF NOT EXISTS idx_sms_usage_order ON sms_usage(order_id);
  `);
  console.log('✅ Tables SMS Quotas & Usage initialisées');
}

/**
 * Vérifie si un membre Discord est Manager, Fondateur ou Administrateur
 */
function isManagerOrFounder(member) {
  if (!member) return false;
  const roleFounderId = process.env.ROLE_FUNDER_ID || '1438301065471721636';
  const roleManagerId = process.env.ROLE_MANAGER_PHONE_ID || '1438301874389516390';

  const memberRoles = member.roles;
  const hasRole = memberRoles?.cache
    ? (memberRoles.cache.has(roleFounderId) || memberRoles.cache.has(roleManagerId))
    : (Array.isArray(memberRoles) ? (memberRoles.includes(roleFounderId) || memberRoles.includes(roleManagerId)) : false);

  const isAdmin = member.permissions?.has
    ? (member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has('Administrator'))
    : false;

  return !!(hasRole || isAdmin);
}

/**
 * Récupère les statistiques de quota SMS d'un utilisateur
 */
function getUserSmsStats(userId) {
  // Récupérer le quota configuré
  const quotaRow = db.prepare(`SELECT * FROM sms_quotas WHERE user_id = ?`).get(userId);
  const maxNumbers = quotaRow ? quotaRow.max_numbers : DEFAULT_SMS_LIMIT;
  const bonusGranted = quotaRow ? quotaRow.bonus_granted : 0;

  // Compter les numéros actifs ou reçus (exclut les numéros annulés/remboursés ou archivés)
  const usageCountRow = db.prepare(`
    SELECT COUNT(*) as count 
    FROM sms_usage 
    WHERE user_id = ? AND status NOT IN ('cancelled', 'archived')
  `).get(userId);

  const usedNumbers = usageCountRow ? usageCountRow.count : 0;
  const remaining = Math.max(0, maxNumbers - usedNumbers);
  const isExceeded = usedNumbers >= maxNumbers;

  return {
    userId,
    maxNumbers,
    usedNumbers,
    remaining,
    isExceeded,
    bonusGranted,
  };
}

/**
 * Récupère l'historique récent des commandes SMS d'un utilisateur
 */
function getUserSmsHistory(userId, limit = 10) {
  try {
    return db.prepare(`
      SELECT order_id, phonenumber, service, status, created_at 
      FROM sms_usage 
      WHERE user_id = ? 
      ORDER BY id DESC 
      LIMIT ?
    `).all(userId, limit);
  } catch (err) {
    console.error('Erreur getUserSmsHistory:', err.message);
    return [];
  }
}

/**
 * Enregistre une nouvelle commande de numéro SMS
 */
function recordSmsOrder(userId, orderId, phonenumber, service = 'instagram') {
  try {
    db.prepare(`
      INSERT INTO sms_usage (user_id, order_id, phonenumber, service, status)
      VALUES (?, ?, ?, ?, 'active')
    `).run(userId, String(orderId), phonenumber || '', service);

    // Initialiser le quota si pas encore fait
    db.prepare(`
      INSERT INTO sms_quotas (user_id, max_numbers, bonus_granted)
      VALUES (?, ?, 0)
      ON CONFLICT(user_id) DO NOTHING
    `).run(userId, DEFAULT_SMS_LIMIT);
  } catch (err) {
    console.error('Erreur recordSmsOrder:', err.message);
  }
}

/**
 * Rétro-synchronise les SMS déjà envoyés par le bot dans les salons de la Content Factory
 * pour initialiser l'historique réel et les quotas de chaque VA.
 */
async function syncPastSmsUsage(client) {
  try {
    const channelIds = [
      process.env.CHANNEL_CONTENT_TWITTER || '1524471089571565778',
      process.env.CHANNEL_CONTENT_FR || '1472915645153939559',
      process.env.CHANNEL_CONTENT_US || '1502700062130835506',
      process.env.CHANNEL_CONTENT_FR_MOBILE || '1556360802699841607',
      process.env.CHANNEL_CONTENT_US_MOBILE || '1556362484057772092',
    ];

    let totalImported = 0;
    const checkOrderStmt = db.prepare('SELECT id FROM sms_usage WHERE order_id = ?');
    const insertStmt = db.prepare(`
      INSERT INTO sms_usage (user_id, order_id, phonenumber, service, status, created_at) 
      VALUES (?, ?, ?, ?, 'received', ?)
    `);
    const initQuotaStmt = db.prepare(`
      INSERT INTO sms_quotas (user_id, max_numbers, bonus_granted) 
      VALUES (?, 5, 0) 
      ON CONFLICT(user_id) DO NOTHING
    `);

    for (const cId of channelIds) {
      const channel = await client.channels.fetch(cId).catch(() => null);
      if (!channel) continue;

      let allMessages = [];
      let lastId = null;
      while (allMessages.length < 500) {
        const batch = await channel.messages.fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) }).catch(() => null);
        if (!batch || batch.size === 0) break;
        allMessages = allMessages.concat(Array.from(batch.values()));
        lastId = batch.last().id;
        if (batch.size < 100) break;
      }

      for (const m of allMessages) {
        if (m.author.id !== client.user.id) continue;
        const match = m.content.match(/<@(\d+)>\s+ton code/i);
        if (!match) continue;

        const userId = match[1];
        const orderId = 'msg_' + m.id;

        // Éviter les doublons
        if (checkOrderStmt.get(orderId)) continue;

        const embed = m.embeds[0];
        let phonenumber = '';
        if (embed && embed.description) {
          const phoneMatch = embed.description.match(/\+1(\d+)/);
          if (phoneMatch) phonenumber = phoneMatch[1];
        }

        const service = m.content.toLowerCase().includes('twitter') ? 'twitter' : 'instagram';
        const createdAt = m.createdAt.toISOString();

        insertStmt.run(userId, orderId, phonenumber, service, createdAt);
        initQuotaStmt.run(userId);
        totalImported++;
      }
    }

    if (totalImported > 0) {
      console.log(`📦 [SMS Quotas] ${totalImported} SMS historiques synchronisés avec succès depuis Discord.`);
    }
  } catch (err) {
    console.error('❌ Erreur syncPastSmsUsage:', err.message);
  }
}

/**
 * Marque une commande SMS comme reçue
 */
function markSmsReceived(orderId) {
  try {
    db.prepare(`UPDATE sms_usage SET status = 'received' WHERE order_id = ?`).run(String(orderId));
  } catch (err) {
    console.error('Erreur markSmsReceived:', err.message);
  }
}

/**
 * Marque une commande SMS comme annulée/remboursée (libère le slot du VA)
 */
function markSmsCancelled(orderId) {
  try {
    db.prepare(`UPDATE sms_usage SET status = 'cancelled' WHERE order_id = ?`).run(String(orderId));
    console.log(`♻️ Quota SMS restauré pour la commande annulée ${orderId}`);
  } catch (err) {
    console.error('Erreur markSmsCancelled:', err.message);
  }
}

/**
 * Accorde des numéros supplémentaires à un VA (par un Manager ou Fondateur)
 */
function grantExtraNumbers(userId, extraCount = 5) {
  const current = getUserSmsStats(userId);
  const newMax = current.maxNumbers + extraCount;
  const newBonus = current.bonusGranted + extraCount;

  db.prepare(`
    INSERT INTO sms_quotas (user_id, max_numbers, bonus_granted, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      max_numbers = ?,
      bonus_granted = ?,
      updated_at = datetime('now')
  `).run(userId, newMax, newBonus, newMax, newBonus);

  return getUserSmsStats(userId);
}

/**
 * Réinitialise le quota d'un VA
 */
function resetUserQuota(userId, newMax = DEFAULT_SMS_LIMIT) {
  db.prepare(`
    INSERT INTO sms_quotas (user_id, max_numbers, bonus_granted, updated_at)
    VALUES (?, ?, 0, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      max_numbers = ?,
      bonus_granted = 0,
      updated_at = datetime('now')
  `).run(userId, newMax, newMax);

  // Marquer les anciennes commandes comme archivées
  db.prepare(`UPDATE sms_usage SET status = 'archived' WHERE user_id = ? AND status != 'cancelled'`).run(userId);

  return getUserSmsStats(userId);
}

/**
 * Gère le clic du bouton "📩 Demander l'accord à un Manager"
 */
async function handleSmsApprovalRequest(interaction, client) {
  await interaction.deferReply({ ephemeral: true });
  const userId = interaction.user.id;

  if (pendingApprovalRequests.has(userId)) {
    return interaction.editReply({
      content: '⏳ **Demande déjà en cours !**\nUne demande d\'accord a déjà été envoyée aux Managers/Fondateurs. Merci de patienter le temps qu\'un responsable la valide.'
    });
  }

  const stats = getUserSmsStats(userId);
  const managerIssuesChannelId = process.env.CHANNEL_MANAGER_ISSUES || '1472915719996837940';
  const roleFounderId = process.env.ROLE_FUNDER_ID || '1438301065471721636';
  const roleManagerId = process.env.ROLE_MANAGER_PHONE_ID || '1438301874389516390';

  const channel = await client.channels.fetch(managerIssuesChannelId).catch(() => null);
  if (!channel) {
    return interaction.editReply({
      content: '❌ Salon Manager introuvable. Veuillez contacter directement un Manager ou Fondateur.'
    });
  }

  // Chercher si le VA a un pseudo et salon en base
  const va = db.prepare(`SELECT * FROM vas WHERE discord_id = ?`).get(userId);
  const vaName = va ? `**${va.username}**` : `<@${userId}>`;
  const vaChannelText = va && va.channel_id ? `<#${va.channel_id}>` : '*Non assigné*';

  const embed = new EmbedBuilder()
    .setColor(0xff9900)
    .setTitle('🔔 Demande d\'autorisation SMSPool — Quota Atteint')
    .setDescription(`Le VA ${vaName} (<@${userId}>) a atteint sa limite de **${stats.usedNumbers} / ${stats.maxNumbers}** numéros SMS.\n\nIl sollicite l'accord d'un **Manager** ou **Fondateur** pour obtenir **+5 numéros supplémentaires**.`)
    .addFields(
      { name: '👤 VA', value: `<@${userId}> (${interaction.user.tag})`, inline: true },
      { name: '📺 Salon VA', value: vaChannelText, inline: true },
      { name: '📊 Quota actuel', value: `\`${stats.usedNumbers} / ${stats.maxNumbers}\` utilisés`, inline: true },
      { name: '🎁 Bonus accordés', value: `\`+${stats.bonusGranted}\` numéros`, inline: true }
    )
    .setFooter({ text: 'Système de gestion des quotas SMSPool • AVA Agency' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sms_approve_grant_${userId}_5`)
      .setLabel('✅ Accorder +5 numéros')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`sms_reject_grant_${userId}`)
      .setLabel('❌ Refuser')
      .setStyle(ButtonStyle.Danger)
  );

  const pingText = `<@&${roleFounderId}> <@&${roleManagerId}>`;
  await channel.send({ content: `🔔 ${pingText} — Demande d'autorisation SMS`, embeds: [embed], components: [row] });

  pendingApprovalRequests.add(userId);

  await interaction.editReply({
    content: '✅ **Ta demande a été transmise aux Managers & Fondateurs !**\nUn responsable va examiner ta demande dans le salon dédié. Dès qu\'elle sera validée, ton quota sera automatiquement augmenté de **+5 numéros**.'
  });
}

/**
 * Gère les boutons de validation / refus cliqués par les Managers/Fondateurs
 */
async function handleSmsApprovalButton(interaction, client) {
  const isAuthorized = isManagerOrFounder(interaction.member);
  if (!isAuthorized) {
    return interaction.reply({
      content: '❌ **Accès refusé :** Seul un **Manager** ou **Fondateur** peut valider ou refuser cette demande.',
      ephemeral: true
    });
  }

  const id = interaction.customId;
  const parts = id.split('_'); // ['sms', 'approve'/'reject', 'grant', userId, (count)]
  const action = parts[1]; // 'approve' ou 'reject'
  const targetUserId = parts[3];
  const grantCount = parseInt(parts[4] || '5', 10);

  await interaction.deferUpdate();

  pendingApprovalRequests.delete(targetUserId);

  // Chercher le VA en base pour son channel éventuel
  const va = db.prepare(`SELECT * FROM vas WHERE discord_id = ?`).get(targetUserId);

  if (action === 'approve') {
    const updatedStats = grantExtraNumbers(targetUserId, grantCount);

    const oldEmbed = interaction.message.embeds[0];
    const updatedEmbed = EmbedBuilder.from(oldEmbed)
      .setColor(0x00ff88)
      .setTitle('✅ Demande SMSPool Approuvée')
      .setDescription(`${oldEmbed.description}\n\n━━━━━━━━━━━━━━━━━━━━\n🎉 **Accordé par <@${interaction.user.id}>** : **+${grantCount} numéros** ajoutés !\n📊 **Nouveau quota :** \`${updatedStats.usedNumbers} / ${updatedStats.maxNumbers}\` (reste **${updatedStats.remaining}**)`)
      .setTimestamp();

    await interaction.editReply({ embeds: [updatedEmbed], components: [] });

    // Notifier le VA par DM
    try {
      const targetUser = await client.users.fetch(targetUserId).catch(() => null);
      if (targetUser) {
        const dmEmbed = new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle('🎉 Demande SMSPool Approuvée !')
          .setDescription(`Bonne nouvelle ! <@${interaction.user.id}> a validé ta demande de numéros SMS.\n\n🎁 **+${grantCount} numéros** ont été ajoutés à ton compte.\n📊 **Ton nouveau quota :** \`${updatedStats.usedNumbers} / ${updatedStats.maxNumbers}\` (reste **${updatedStats.remaining}** numéros).\n\nTu peux dès à présent retourner dans la Content Factory pour générer un nouveau numéro !`)
          .setTimestamp();
        await targetUser.send({ embeds: [dmEmbed] }).catch(() => {});
      }
    } catch (_) {}

    // Notifier également dans son salon VA si accessible
    if (va && va.channel_id) {
      try {
        const vaChannel = await client.channels.fetch(va.channel_id).catch(() => null);
        if (vaChannel) {
          await vaChannel.send({
            content: `🔔 <@${targetUserId}> — 🎉 **Demande SMS approuvée !** <@${interaction.user.id}> t'a accordé **+${grantCount} numéros**. Ton quota est désormais de \`${updatedStats.usedNumbers} / ${updatedStats.maxNumbers}\`.`
          }).catch(() => {});
        }
      } catch (_) {}
    }

  } else if (action === 'reject') {
    const oldEmbed = interaction.message.embeds[0];
    const updatedEmbed = EmbedBuilder.from(oldEmbed)
      .setColor(0xff0000)
      .setTitle('❌ Demande SMSPool Refusée')
      .setDescription(`${oldEmbed.description}\n\n━━━━━━━━━━━━━━━━━━━━\n🚫 **Refusé par <@${interaction.user.id}>**. Aucun numéro supplémentaire n'a été accordé.`)
      .setTimestamp();

    await interaction.editReply({ embeds: [updatedEmbed], components: [] });

    try {
      const targetUser = await client.users.fetch(targetUserId).catch(() => null);
      if (targetUser) {
        await targetUser.send({
          content: `❌ Ta demande de numéros SMS supplémentaires a été refusée par <@${interaction.user.id}>.`
        }).catch(() => {});
      }
    } catch (_) {}

    if (va && va.channel_id) {
      try {
        const vaChannel = await client.channels.fetch(va.channel_id).catch(() => null);
        if (vaChannel) {
          await vaChannel.send({
            content: `🔔 <@${targetUserId}> — ❌ Ta demande de numéros SMS a été refusée par <@${interaction.user.id}>.`
          }).catch(() => {});
        }
      } catch (_) {}
    }
  }
}

module.exports = {
  initSmsTables,
  syncPastSmsUsage,
  isManagerOrFounder,
  getUserSmsStats,
  getUserSmsHistory,
  recordSmsOrder,
  markSmsReceived,
  markSmsCancelled,
  grantExtraNumbers,
  resetUserQuota,
  handleSmsApprovalRequest,
  handleSmsApprovalButton,
  DEFAULT_SMS_LIMIT,
};

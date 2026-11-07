const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { 
  getUserSmsStats, 
  getUserSmsHistory, 
  grantExtraNumbers, 
  resetUserQuota, 
  isManagerOrFounder, 
  DEFAULT_SMS_LIMIT 
} = require('../services/smsQuotaService');
const { db } = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sms')
    .setDescription('Gestion des quotas et commandes SMSPool')
    .addSubcommand(sub =>
      sub.setName('quota')
        .setDescription('Consulter le quota SMS actuel (le tien ou celui d\'un membre)')
        .addUserOption(opt =>
          opt.setName('membre')
            .setDescription('Le membre dont vous souhaitez voir le quota (laisser vide pour soi-même)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('grant')
        .setDescription('Accorder des numéros SMS supplémentaires à un VA (Manager/Fondateur)')
        .addUserOption(opt =>
          opt.setName('membre')
            .setDescription('Le membre / VA à qui accorder des numéros supplémentaires')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('quantite')
            .setDescription('Nombre de numéros à ajouter (par défaut: 5)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(50)
        )
    )
    .addSubcommand(sub =>
      sub.setName('reset')
        .setDescription('Réinitialiser le quota SMS d\'un VA (Manager/Fondateur)')
        .addUserOption(opt =>
          opt.setName('membre')
            .setDescription('Le membre / VA dont le quota doit être remis à zéro')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('limite')
            .setDescription('Nouvelle limite de base (par défaut: 5)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(100)
        )
    )
    .addSubcommand(sub =>
      sub.setName('history')
        .setDescription('Historique des 10 dernières commandes SMS d\'un membre')
        .addUserOption(opt =>
          opt.setName('membre')
            .setDescription('Le membre dont vous souhaitez consulter l\'historique')
            .setRequired(false)
        )
    ),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();
    const callerIsPrivileged = isManagerOrFounder(interaction.member);

    // ─── 1. SOUS-COMMANDE: QUOTA ──────────────────────────────────
    if (sub === 'quota') {
      const targetUser = interaction.options.getUser('membre') || interaction.user;
      const isSelf = targetUser.id === interaction.user.id;

      if (!isSelf && !callerIsPrivileged) {
        return interaction.reply({
          content: '❌ **Accès restreint :** Seul un **Manager** ou **Fondateur** peut consulter le quota des autres membres.',
          ephemeral: true
        });
      }

      const targetMember = interaction.guild ? await interaction.guild.members.fetch(targetUser.id).catch(() => null) : null;
      const targetIsPrivileged = targetMember ? isManagerOrFounder(targetMember) : false;
      const stats = getUserSmsStats(targetUser.id);

      const va = db.prepare(`SELECT * FROM vas WHERE discord_id = ?`).get(targetUser.id);
      const vaLabel = va ? ` (${va.username})` : '';

      const embed = new EmbedBuilder()
        .setColor(targetIsPrivileged ? 0x00ff88 : (stats.isExceeded ? 0xff3344 : 0x3498db))
        .setTitle(`📱 Quota SMS — ${targetUser.username}${vaLabel}`)
        .addFields(
          { name: '👤 Utilisateur', value: `<@${targetUser.id}>`, inline: true },
          { 
            name: '📊 Statut du Quota', 
            value: targetIsPrivileged ? '`Illimité` *(Accès Manager/Fondateur)*' : (stats.isExceeded ? '🔴 **Plafond atteint (Bloqué)**' : '🟢 **Disponible**'), 
            inline: true 
          },
          { name: '🔢 Numéros Utilisés', value: `\`${stats.usedNumbers} / ${targetIsPrivileged ? '∞' : stats.maxNumbers}\``, inline: true },
          { name: '🎁 Bonus Accordés', value: `\`+${stats.bonusGranted}\` numéros`, inline: true },
          { name: '📥 Restants', value: targetIsPrivileged ? '`Illimité`' : `**${stats.remaining}** numéro(s)`, inline: true }
        )
        .setFooter({ text: 'AVA Agency • Gestion des Quotas SMSPool' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: !isSelf });
    }

    // ─── 2. SOUS-COMMANDE: GRANT (+X numéros) ──────────────────────
    if (sub === 'grant') {
      if (!callerIsPrivileged) {
        return interaction.reply({
          content: '❌ **Accès refusé :** Seul un **Manager** ou **Fondateur** peut accorder des numéros supplémentaires.',
          ephemeral: true
        });
      }

      const targetUser = interaction.options.getUser('membre');
      const count = interaction.options.getInteger('quantite') || 5;

      const updatedStats = grantExtraNumbers(targetUser.id, count);

      const embed = new EmbedBuilder()
        .setColor(0x00ff88)
        .setTitle('✅ Numéros SMS Supplémentaires Accordés')
        .setDescription(`**+${count} numéros** ont été accordés à <@${targetUser.id}> par <@${interaction.user.id}>.`)
        .addFields(
          { name: '👤 Membre', value: `<@${targetUser.id}> (${targetUser.tag})`, inline: true },
          { name: '📊 Nouveau Quota', value: `\`${updatedStats.usedNumbers} / ${updatedStats.maxNumbers}\` (reste **${updatedStats.remaining}**)`, inline: true },
          { name: '🎁 Total Bonus', value: `\`+${updatedStats.bonusGranted}\` numéros`, inline: true }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

      // Notifier le VA par DM
      try {
        const dmEmbed = new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle('🎉 Bonus SMSPool Accordé !')
          .setDescription(`Un responsable (<@${interaction.user.id}>) vient d'ajouter **+${count} numéros SMS** à ton compte !\n\n📊 **Ton nouveau quota :** \`${updatedStats.usedNumbers} / ${updatedStats.maxNumbers}\` (reste **${updatedStats.remaining}**).\nTu peux désormais générer des numéros dans la Content Factory.`)
          .setTimestamp();
        await targetUser.send({ embeds: [dmEmbed] }).catch(() => {});
      } catch (_) {}

      // Notifier dans le salon du VA si lié
      const va = db.prepare(`SELECT * FROM vas WHERE discord_id = ?`).get(targetUser.id);
      if (va && va.channel_id) {
        try {
          const vaChannel = await client.channels.fetch(va.channel_id).catch(() => null);
          if (vaChannel) {
            await vaChannel.send({
              content: `🔔 <@${targetUser.id}> — 🎉 <@${interaction.user.id}> t'a accordé **+${count} numéros SMS** ! Quota : \`${updatedStats.usedNumbers} / ${updatedStats.maxNumbers}\`.`
            }).catch(() => {});
          }
        } catch (_) {}
      }
      return;
    }

    // ─── 3. SOUS-COMMANDE: RESET (Remise à zéro) ────────────────────
    if (sub === 'reset') {
      if (!callerIsPrivileged) {
        return interaction.reply({
          content: '❌ **Accès refusé :** Seul un **Manager** ou **Fondateur** peut réinitialiser le quota d\'un VA.',
          ephemeral: true
        });
      }

      const targetUser = interaction.options.getUser('membre');
      const newMax = interaction.options.getInteger('limite') || DEFAULT_SMS_LIMIT;

      const resetStats = resetUserQuota(targetUser.id, newMax);

      const embed = new EmbedBuilder()
        .setColor(0xffaa00)
        .setTitle('🔄 Quota SMS Réinitialisé')
        .setDescription(`Le quota de <@${targetUser.id}> a été réinitialisé par <@${interaction.user.id}>.`)
        .addFields(
          { name: '👤 Membre', value: `<@${targetUser.id}> (${targetUser.tag})`, inline: true },
          { name: '📊 Nouveau Quota', value: `\`${resetStats.usedNumbers} / ${resetStats.maxNumbers}\` (reste **${resetStats.remaining}**)`, inline: true },
          { name: '📦 Anciennes commandes', value: 'Archivées avec succès', inline: true }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ─── 4. SOUS-COMMANDE: HISTORY ──────────────────────────────────
    if (sub === 'history') {
      const targetUser = interaction.options.getUser('membre') || interaction.user;
      const isSelf = targetUser.id === interaction.user.id;

      if (!isSelf && !callerIsPrivileged) {
        return interaction.reply({
          content: '❌ **Accès restreint :** Seul un **Manager** ou **Fondateur** peut consulter l\'historique des autres membres.',
          ephemeral: true
        });
      }

      const history = getUserSmsHistory(targetUser.id, 10);
      const stats = getUserSmsStats(targetUser.id);

      if (history.length === 0) {
        return interaction.reply({
          content: `📭 Aucun historique de commande SMS trouvé pour <@${targetUser.id}>.`,
          ephemeral: !isSelf
        });
      }

      const statusMap = {
        active: '⏳ En attente / Actif',
        received: '✅ Code reçu',
        cancelled: '♻️ Remboursé / Annulé',
        archived: '📦 Archivé'
      };

      const lines = history.map((h, i) => {
        const phone = h.phonenumber ? `\`+1${h.phonenumber}\`` : '*Inconnu*';
        const service = h.service === 'twitter' ? 'Twitter/X' : 'Instagram';
        const st = statusMap[h.status] || h.status;
        const dateStr = h.created_at ? h.created_at.slice(5, 16) : '';
        return `**${i + 1}.** ${phone} (${service}) — ${st} \`[${dateStr}]\``;
      });

      const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(`📜 Historique SMS — ${targetUser.username}`)
        .setDescription(`Quota actuel : \`${stats.usedNumbers} / ${stats.maxNumbers}\` (${stats.remaining} restant${stats.remaining > 1 ? 's' : ''})\n\n${lines.join('\n')}`)
        .setFooter({ text: 'Dernières commandes enregistrées (max 10)' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: !isSelf });
    }
  }
};

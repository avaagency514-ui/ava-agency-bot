/**
 * commands/sanction.js
 * Commande Slash /sanction pour l'administration disciplinaire et la levée de sanctions
 */
'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { setupPenaltyPanelChannel, getRecentPenalties, revokeAgencyPenalty } = require('../services/penaltyService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sanction')
    .setDescription('Administration des sanctions et pénalités (Fondateurs)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName('panel')
        .setDescription('Republier ou actualiser le panneau interactif dans #penalisation')
    )
    .addSubcommand(sub =>
      sub
        .setName('historique')
        .setDescription('Consulter l\'historique des 10 dernières sanctions prononcées')
    )
    .addSubcommand(sub =>
      sub
        .setName('lever')
        .setDescription('Lever / annuler officiellement une sanction par son ID')
        .addIntegerOption(opt =>
          opt
            .setName('id')
            .setDescription('ID (#) de la sanction à annuler')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('motif')
            .setDescription('Motif de la levée / réhabilitation')
            .setRequired(false)
        )
        .addBooleanOption(opt =>
          opt
            .setName('diffuser')
            .setDescription('Diffuser l\'avis de réhabilitation dans les salons d\'équipe (défaut : vrai)')
            .setRequired(false)
        )
    ),

  async execute(interaction, client) {
    const roleFounderId = process.env.ROLE_FUNDER_ID || '1438301065471721636';
    const memberRoles = interaction.member?.roles;
    const isFounder = memberRoles?.cache
      ? memberRoles.cache.has(roleFounderId)
      : (Array.isArray(memberRoles) ? memberRoles.includes(roleFounderId) : false);
    const isAdmin = interaction.member?.permissions?.has
      ? (interaction.member.permissions.has(PermissionFlagsBits.Administrator) || interaction.member.permissions.has('Administrator'))
      : false;
    const isGuildOwner = Boolean(interaction.guild?.ownerId && interaction.guild.ownerId === interaction.user?.id);

    if (!isFounder && !isAdmin && !isGuildOwner) {
      return interaction.reply({
        content: '❌ Commande réservée aux fondateurs et administrateurs.',
        ephemeral: true,
      });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'panel') {
      await interaction.deferReply({ ephemeral: true });
      await setupPenaltyPanelChannel(client);
      return interaction.editReply({
        content: `✅ Le panneau officiel de gestion des sanctions a été publié dans <#${process.env.CHANNEL_PENALTY_PANEL || '1565396114302312459'}>.`,
      });
    }

    if (sub === 'historique') {
      const list = getRecentPenalties(10);
      if (!list || list.length === 0) {
        return interaction.reply({
          content: 'ℹ️ Aucun enregistrement de sanction trouvé dans la base de données.',
          ephemeral: true,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('📜 REGISTRE DES DERNIÈRES SANCTIONS DISCIPLINAIRES')
        .setDescription(
          list.map((p) => {
            const emoji = p.target_category === 'Manager' ? '👔' : (p.target_category === 'Chatter' ? '💬' : '📱');
            const isRevoked = p.status === 'REVOKED';
            const statusBadge = isRevoked ? `🕊️ **[LEVÉE]** *(le ${p.revoked_at || 'récemment'})*` : `🔴 **[ACTIVE]**`;
            return `**#${p.id}** ${emoji} **${p.target_name}** (${p.target_category}) — ${statusBadge}\n` +
              `└ 💸 Sanction : \`${p.penalty_type_amount}\`\n` +
              `└ ⚠️ Motif : *${p.reason}*\n` +
              `└ 👮 Décidé par : <@${p.issued_by_id}> · 📅 ${p.created_at}`;
          }).join('\n\n')
        )
        .setFooter({ text: 'AVA Agency • Registre Disciplinaire' })
        .setTimestamp();

      return interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    }

    if (sub === 'lever') {
      const penaltyId = interaction.options.getInteger('id', true);
      const motif = interaction.options.getString('motif') || 'Décision de la direction / Régularisation';
      const diffuser = interaction.options.getBoolean('diffuser') ?? true;

      await interaction.deferReply({ ephemeral: true });

      const res = await revokeAgencyPenalty({
        penaltyId,
        revokedById: interaction.user.id,
        revokedByName: interaction.user.username,
        revokedReason: motif,
        broadcastAnnouncement: diffuser,
        client,
      });

      if (!res.success) {
        return interaction.editReply({
          content: `❌ **Impossible de lever la sanction** : ${res.error}`,
        });
      }

      let confirmation =
        `🕊️ **SANCTION #${res.penalty.id} OFFICIELLEMENT LEVÉE ET ANNULÉE !**\n\n` +
        `• Membre : **${res.penalty.target_name}** (${res.penalty.target_category})\n` +
        `• Sanction annulée : ~~\`${res.penalty.penalty_type_amount}\`~~\n` +
        `• Motif de levée : *${motif}*\n` +
        `• Décidé par : <@${interaction.user.id}>\n`;

      if (res.financialRestored > 0) {
        confirmation += `• 💳 **Restitution financière :** **$${res.financialRestored.toFixed(2)}** automatiquement recrédités sur le solde de commissions.\n`;
      }

      if (res.strikesRemoved > 0) {
        confirmation += `• 🧹 **Dossier disciplinaire :** Avertissement (strike) retiré du profil.\n`;
      }

      if (diffuser) {
        confirmation += `• 📢 **Avis de levée diffusé publiquement** dans les salons de l'équipe.`;
      } else {
        confirmation += `• 🔒 **Levée enregistrée en discret** (sans notification publique).`;
      }

      return interaction.editReply({ content: confirmation });
    }
  },
};

const { SlashCommandBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { vaQueries, igQueries } = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('va')
    .setDescription('Voir/éditer les infos du VA de ce salon (manager)'),

  async execute(interaction) {
    // Récupérer le VA lié à ce salon
    const va = vaQueries.getByChannel.get(interaction.channelId);

    if (!va) {
      // Si pas de VA, proposer d'en créer un
      const modal = new ModalBuilder()
        .setCustomId('modal_va_create')
        .setTitle('➕ Créer un VA pour ce salon');

      const usernameInput = new TextInputBuilder()
        .setCustomId('va_username')
        .setLabel('Discord username du VA')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('ex: johnsmith')
        .setRequired(true);

      const discordIdInput = new TextInputBuilder()
        .setCustomId('va_discord_id')
        .setLabel('Discord ID du VA (optionnel)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('ex: 123456789012345678')
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(usernameInput),
        new ActionRowBuilder().addComponents(discordIdInput),
      );

      return interaction.showModal(modal);
    }

    // Récupérer les comptes IG du VA
    const comptes = igQueries.getByVa.all(va.id);
    const totalClics = comptes.reduce((sum, c) => sum + c.clics, 0);

    const statutEmoji = {
      actif: '🟢',
      inactif: '🟡',
      pause: '⏸️',
      banni: '🔴',
    }[va.statut] || '⚪';

    const embed = new EmbedBuilder()
      .setColor(va.statut === 'actif' ? 0x00ff88 : va.statut === 'banni' ? 0xff0044 : 0xffaa00)
      .setTitle(`${statutEmoji} VA — ${va.username}`)
      .addFields(
        { name: '📋 Statut', value: `\`${va.statut}\``, inline: true },
        { name: '🆔 Discord ID', value: va.discord_id ? `<@${va.discord_id}>` : '*Non défini*', inline: true },
        { name: '📅 Ajouté le', value: new Date(va.created_at).toLocaleDateString('fr-FR'), inline: true },
        { name: '📊 Comptes Instagram', value: comptes.length > 0
          ? comptes.map(c => `• \`${c.username_ig}\` — **${c.clics}** clics${c.deeplink ? ` — [lien](${c.deeplink})` : ''}`).join('\n')
          : '*Aucun compte lié*',
          inline: false,
        },
        { name: '🔗 Total clics', value: `**${totalClics}**`, inline: true },
        { name: '📝 Notes', value: va.notes || '*Aucune note*', inline: false },
      )
      .setFooter({ text: `ID interne: ${va.id} • Channel: ${interaction.channel.name}` })
      .setTimestamp();

    const { ButtonBuilder, ButtonStyle } = require('discord.js');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`va_edit_${va.id}`)
        .setLabel('✏️ Modifier')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`va_pause_${va.id}`)
        .setLabel('⏸️ Pause')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`va_refresh_${va.id}`)
        .setLabel('🔄 Actualiser')
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  },
};

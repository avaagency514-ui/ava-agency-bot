const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { vaQueries, igQueries } = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Passer un compte du VA de ce salon en ban'),

  async execute(interaction) {
    const va = vaQueries.getByChannel.get(interaction.channelId);

    if (!va) {
      return interaction.reply({
        content: '❌ Aucun VA trouvé pour ce salon.',
        ephemeral: true,
      });
    }

    const comptes = igQueries.getByVa.all(va.id);

    if (comptes.length === 0) {
      return interaction.reply({
        content: `📭 **${va.username}** n'a aucun compte Instagram actif à bannir.`,
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle(`🔴 Bannir un compte — ${va.username}`)
      .setDescription('Sélectionne le compte Instagram à mettre en ban :')
      .addFields(
        comptes.map((c, i) => ({
          name: `${i + 1}. ${c.username_ig}`,
          value: `${c.clics} clics${c.deeplink ? ` • [deeplink](${c.deeplink})` : ''}`,
          inline: true,
        }))
      )
      .setTimestamp();

    const rows = [];
    const chunks = [];
    for (let i = 0; i < comptes.length; i += 5) {
      chunks.push(comptes.slice(i, i + 5));
    }

    for (const chunk of chunks.slice(0, 5)) {
      const row = new ActionRowBuilder();
      for (const c of chunk) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`ban_compte_${c.id}`)
            .setLabel(`🔴 ${c.username_ig}`)
            .setStyle(ButtonStyle.Danger),
        );
      }
      rows.push(row);
    }

    // Bouton pour bannir tout le VA
    const vaRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ban_va_${va.id}`)
        .setLabel(`🚫 Bannir tout le VA (${va.username})`)
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('ban_cancel')
        .setLabel('❌ Annuler')
        .setStyle(ButtonStyle.Secondary),
    );
    rows.push(vaRow);

    await interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
  },
};

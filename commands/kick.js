const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { vaQueries, igQueries } = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Virer le VA de ce salon : kick serveur + supprimer salon + lien (si 0 clic)'),

  async execute(interaction) {
    const va = vaQueries.getByChannel.get(interaction.channelId);

    if (!va) {
      return interaction.reply({
        content: '❌ Aucun VA trouvé pour ce salon.',
        ephemeral: true,
      });
    }

    const comptes = igQueries.getByVa.all(va.id);
    const totalClics = comptes.reduce((sum, c) => sum + c.clics, 0);

    const embed = new EmbedBuilder()
      .setColor(0xff4444)
      .setTitle(`⚠️ Confirmer le kick — ${va.username}`)
      .setDescription([
        `Tu es sur le point de **virer** le VA **${va.username}**.`,
        '',
        '**Actions qui seront effectuées :**',
        `• 👢 Kick du serveur Discord`,
        `• 🗑️ Suppression de ce salon`,
        totalClics === 0 ? '• 🔗 Suppression du deeplink (0 clic)' : `• 🔗 Deeplink conservé (**${totalClics} clics**)`,
        '',
        `📊 **${comptes.length}** compte(s) IG • **${totalClics}** clic(s) total`,
      ].join('\n'))
      .setFooter({ text: 'Cette action est irréversible !' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`kick_confirm_${va.id}`)
        .setLabel('✅ Confirmer le kick')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('kick_cancel')
        .setLabel('❌ Annuler')
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  },
};

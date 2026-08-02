const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { vaQueries, igQueries } = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ig')
    .setDescription('Voir/éditer les comptes Instagram du VA de ce salon (manager)'),

  async execute(interaction) {
    const va = vaQueries.getByChannel.get(interaction.channelId);

    if (!va) {
      return interaction.reply({
        content: '❌ Aucun VA trouvé pour ce salon. Utilise `/va` pour en créer un.',
        ephemeral: true,
      });
    }

    const comptes = igQueries.getByVa.all(va.id);

    if (comptes.length === 0) {
      return interaction.reply({
        content: `📭 **${va.username}** n'a aucun compte Instagram lié. Utilise \`/acc\` pour en ajouter un.`,
        ephemeral: true,
      });
    }

    const embeds = [];
    const rows = [];

    // Créer un embed et un bouton "Identifiants" pour chaque compte
    comptes.forEach((c) => {
      const statut = c.ban ? '🔴 Banni' : c.actif ? '🟢 Actif' : '⚫ Inactif';
      
      const embed = new EmbedBuilder()
        .setColor(0xe1306c)
        .setTitle(`📱 @${c.username_ig}`)
        .addFields(
          { name: 'VA', value: va.username, inline: true },
          { name: 'Profil', value: c.profile_id || 'Non défini', inline: true },
          { name: 'Enregistré', value: c.registration_date || 'Inconnu', inline: true },
          { name: 'OS', value: c.os || 'Non précisé', inline: true },
          { name: 'Statut', value: statut, inline: true },
          { name: 'Mot de passe', value: c.password ? '||████████||' : '—', inline: true },
          { name: '2FA', value: c.two_fa ? '||██████||' : '—', inline: true }
        );

      if (c.deeplink) embed.addFields({ name: 'Deeplink', value: c.deeplink, inline: false });
      
      embeds.push(embed);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ig_creds_${c.id}`)
          .setLabel(`🔑 Identifiants @${c.username_ig}`)
          .setStyle(ButtonStyle.Primary)
      );
      rows.push(row);
    });

    // Envoyer jusqu'à 5 comptes (limite Discord pour les ActionRow)
    await interaction.reply({ embeds: embeds.slice(0, 5), components: rows.slice(0, 5), ephemeral: true });
  },
};

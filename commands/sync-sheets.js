const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { igQueries } = require('../database/db');
const { syncAllAccountsToSheet } = require('../services/sheets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sync-sheets')
    .setDescription('Synchronise tous les comptes IG actifs vers le Google Sheet (Réservé aux Managers)'),

  async execute(interaction) {
    // Vérifier que l'utilisateur a le rôle manager
    const managerRoleId = process.env.ROLE_MANAGER_PHONE_ID;
    const isManager = interaction.member.roles.cache.has(managerRoleId);

    if (!isManager && interaction.user.id !== interaction.guild.ownerId) {
      return interaction.reply({
        content: '❌ Tu dois être Manager pour utiliser cette commande.',
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const comptes = igQueries.getAllActifs.all();
      
      const accountsData = comptes.map(c => [
        c.va_username,
        c.username_ig,
        c.profile_id || '',
        c.os || '',
        c.registration_date || c.created_at.split(' ')[0],
        c.password || '',
        c.two_fa || '',
        c.deeplink || ''
      ]);

      await syncAllAccountsToSheet(accountsData);

      const embed = new EmbedBuilder()
        .setColor(0x00ff88)
        .setTitle('✅ Synchronisation terminée')
        .setDescription(`**${comptes.length}** comptes ont été synchronisés avec succès sur le Google Sheet !`)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      await interaction.editReply({ content: `❌ Erreur lors de la synchronisation : ${err.message}` });
    }
  },
};

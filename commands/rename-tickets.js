const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { renameAllExistingTickets } = require('../services/ticketRenamer');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rename-tickets')
    .setDescription('Scanner et renommer tous les tickets ouverts au nom de leur candidat respectif')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    if (!guild) {
      return interaction.editReply({ content: '❌ Commande utilisable uniquement sur un serveur.' });
    }

    await interaction.editReply({ content: '⏳ Scan et renommage de tous les tickets en cours... Veuillez patienter.' });

    const renamedCount = await renameAllExistingTickets(guild, client);

    return interaction.editReply({
      content: `✅ **Opération terminée !**\n${renamedCount} salon(s) ticket(s) ont été renommés avec succès au nom de leur candidat respectif.`
    });
  }
};

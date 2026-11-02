const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { sendTicketWelcome } = require('../handlers/ticketHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Afficher le menu d\'orientation recrutement (VA / Chatter) dans ce ticket')
    .addUserOption(option => 
      option.setName('candidat')
        .setDescription('Le membre qui postule (optionnel)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const candidateUser = interaction.options.getUser('candidat');
    const candidateId = candidateUser ? candidateUser.id : 'any';

    await interaction.reply({
      content: '✅ Panneau d\'onboarding ticket généré ci-dessous.',
      ephemeral: true
    });

    await sendTicketWelcome(interaction.channel, candidateId);
  }
};

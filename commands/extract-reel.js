const { SlashCommandBuilder } = require('discord.js');
const {
  processSingleMediaItem,
  CHANNEL_CAPTION_REEL_ID
} = require('../services/reelExtractor');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('extract-reel')
    .setDescription('Extraire le hook / texte incrusté d\'un Reel Instagram ou d\'une vidéo')
    .addStringOption(option =>
      option
        .setName('url')
        .setDescription('Lien du Reel Instagram ou de la vidéo')
        .setRequired(false)
    )
    .addAttachmentOption(option =>
      option
        .setName('video')
        .setDescription('Fichier vidéo (.mp4, .mov, etc.)')
        .setRequired(false)
    ),

  async execute(interaction, client) {
    const url = interaction.options.getString('url');
    const attachment = interaction.options.getAttachment('video');

    if (!url && !attachment) {
      return interaction.reply({
        content: '❌ Veuillez fournir soit un **lien** (`url`), soit un **fichier vidéo** (`video`).',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: false });

    try {
      const isAttachment = Boolean(attachment);
      const mediaUrl = isAttachment ? attachment.url : url;
      const attachmentName = isAttachment ? attachment.name : null;

      const result = await processSingleMediaItem({
        mediaUrl,
        isAttachment,
        attachmentName,
        author: interaction.user,
        channelId: interaction.channelId,
        client
      });

      if (result.status === 'success') {
        return interaction.editReply({
          content: `✅ **Hook extrait avec succès et publié dans <#${CHANNEL_CAPTION_REEL_ID}> !**\n\n> ${result.text.replace(/\n/g, '\n> ')}`
        });
      } else if (result.status === 'duplicate') {
        return interaction.editReply({
          content: `ℹ️ **Ce Reel a déjà été extrait précédemment :**\n\n> ${result.text ? result.text.replace(/\n/g, '\n> ') : '*(aucun texte)*'}`
        });
      } else if (result.status === 'no_text') {
        return interaction.editReply({
          content: `⚠️ **Aucun texte incrusté détecté sur cette vidéo.**`
        });
      } else {
        return interaction.editReply({
          content: `❌ **Erreur d'extraction :** ${result.error || 'Erreur inconnue'}`
        });
      }

    } catch (err) {
      console.error('❌ Erreur slash command /extract-reel:', err.message);
      return interaction.editReply({
        content: `❌ **Une erreur est survenue lors de l'extraction :** ${err.message}`
      });
    }
  }
};

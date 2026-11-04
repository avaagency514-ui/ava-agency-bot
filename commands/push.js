/**
 * commands/push.js
 * Commande slash /push pour préparer et envoyer un Mass DM aux fans Telegram de Kim.
 */
const { SlashCommandBuilder } = require('discord.js');
const path = require('path');
const {
  draftPushes,
  buildDraftEmbed,
  buildDraftButtons,
  downloadFile
} = require('../services/pushService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('push')
    .setDescription('Envoyer un Mass DM (texte / média) à tous les fans de Kim sur Telegram')
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Le message à envoyer aux fans')
        .setRequired(false)
    )
    .addAttachmentOption(option =>
      option.setName('media')
        .setDescription('Photo ou vidéo à joindre au message')
        .setRequired(false)
    )
    .addNumberOption(option =>
      option.setName('exclure_actifs')
        .setDescription('Nombre d\'heures d\'inactivité requises (ex: 2 pour ignorer les fans actifs < 2h)')
        .setRequired(false)
    ),

  async execute(interaction, client) {
    const text = interaction.options.getString('message');
    const attachment = interaction.options.getAttachment('media');
    const excludeHours = interaction.options.getNumber('exclure_actifs') ?? 2.0;

    if (!text && !attachment) {
      return interaction.reply({
        content: '❌ Tu dois renseigner au moins un texte (`message`) ou une pièce jointe (`media`) !',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    let mediaPath = null;
    let mediaUrl = null;
    let mediaName = null;

    if (attachment) {
      mediaUrl = attachment.url;
      mediaName = attachment.name;
      const ext = path.extname(mediaName) || '.jpg';
      const destFileName = `push_${Date.now()}_${interaction.user.id}${ext}`;
      const destPath = path.join(__dirname, '..', 'temp', 'push_media', destFileName);

      try {
        await downloadFile(mediaUrl, destPath);
        mediaPath = destPath;
      } catch (dlErr) {
        console.warn('⚠️ Échec du téléchargement média :', dlErr.message);
      }
    }

    const draftId = `draft_${Date.now()}_${interaction.user.id}`;
    const draft = {
      id: draftId,
      authorId: interaction.user.id,
      authorTag: interaction.user.tag,
      text: text || '',
      mediaUrl: mediaUrl,
      mediaPath: mediaPath,
      mediaName: mediaName,
      excludeHours: excludeHours,
      createdAt: Date.now()
    };

    draftPushes.set(draftId, draft);

    const embed = buildDraftEmbed(draft);
    const row = buildDraftButtons(draftId);

    await interaction.followUp({
      content: '✅ Brouillon de Push préparé ! Vérifie l\'aperçu ci-dessous et valide l\'envoi :',
      ephemeral: true
    });

    await interaction.channel.send({
      content: `👋 Nouveau push initié par <@${interaction.user.id}> :`,
      embeds: [embed],
      components: [row]
    });
  }
};

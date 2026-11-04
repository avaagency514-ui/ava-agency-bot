/**
 * events/messageCreate.js
 * Écoute les messages Discord pour détecter les créations de Push directes
 * dans le salon dédié aux Push Telegram (#push).
 */
const { Events, AttachmentBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');
const {
  CHANNEL_PUSH_ID,
  draftPushes,
  buildDraftEmbed,
  buildDraftButtons,
  downloadFile
} = require('../services/pushService');

module.exports = {
  name: Events.MessageCreate,
  once: false,

  async execute(message, client) {
    // Ignorer les bots
    if (message.author.bot) return;

    // Vérifier si le message est posté dans le salon #push
    if (message.channelId !== CHANNEL_PUSH_ID) return;

    // Ne rien faire si c'est un message vide sans pièce jointe
    const hasText = message.content && message.content.trim().length > 0;
    const hasAttachments = message.attachments && message.attachments.size > 0;

    if (!hasText && !hasAttachments) return;

    try {
      const draftId = `draft_${Date.now()}_${message.author.id}`;
      let mediaPath = null;
      let mediaUrl = null;
      let mediaName = null;

      if (hasAttachments) {
        const firstAttachment = message.attachments.first();
        mediaUrl = firstAttachment.url;
        mediaName = firstAttachment.name;

        const ext = path.extname(mediaName) || '.jpg';
        const destFileName = `push_${Date.now()}_${message.author.id}${ext}`;
        const destPath = path.join(__dirname, '..', 'temp', 'push_media', destFileName);

        try {
          await downloadFile(mediaUrl, destPath);
          mediaPath = destPath;
        } catch (dlErr) {
          console.warn('⚠️ Échec du téléchargement de la pièce jointe:', dlErr.message);
        }
      }

      const draft = {
        id: draftId,
        authorId: message.author.id,
        authorTag: message.author.tag,
        text: message.content || '',
        mediaUrl: mediaUrl,
        mediaPath: mediaPath,
        mediaName: mediaName,
        excludeHours: 2.0,
        createdAt: Date.now()
      };

      draftPushes.set(draftId, draft);

      const embed = buildDraftEmbed(draft);
      const row = buildDraftButtons(draftId);

      const payload = {
        content: `👋 Nouveau push préparé par <@${message.author.id}> :`,
        embeds: [embed],
        components: [row]
      };

      if (mediaPath && fs.existsSync(mediaPath)) {
        payload.files = [new AttachmentBuilder(mediaPath, { name: mediaName })];
      }

      // Supprimer le message brut du chatter pour garder le salon 100% propre
      await message.delete().catch(() => {});

      // Envoyer le panneau de confirmation avec le média attaché
      await message.channel.send(payload);

    } catch (err) {
      console.error('❌ Erreur lors du traitement du message dans #push :', err);
    }
  }
};

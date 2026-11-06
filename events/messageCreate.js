/**
 * events/messageCreate.js
 * Écoute les messages Discord pour détecter les créations et dépôts de contenus
 * dans le salon dédié aux Push Telegram (#push).
 */
const { Events, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');
const {
  CHANNEL_PUSH_ID,
  DATA_MEDIA_DIR,
  LOCAL_MEDIA_DIR,
  draftPushes,
  readAutoPushConfig,
  downloadFile
} = require('../services/pushService');
const {
  CHANNEL_REEL_SCRAPPER_ID,
  processReelScrapperMessage
} = require('../services/reelExtractor');

module.exports = {
  name: Events.MessageCreate,
  once: false,

  async execute(message, client) {
    // Ignorer les bots
    if (message.author.bot) return;

    // Détection des Reels dans le salon #reel-scrapper
    if (message.channelId === CHANNEL_REEL_SCRAPPER_ID) {
      return await processReelScrapperMessage(message, client);
    }

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
        // Enregistrer de préférence dans DATA_MEDIA_DIR (volume persistant)
        const targetDir = fs.existsSync(DATA_MEDIA_DIR) ? DATA_MEDIA_DIR : LOCAL_MEDIA_DIR;
        const destPath = path.join(targetDir, destFileName);

        try {
          await downloadFile(mediaUrl, destPath);
          mediaPath = destPath;
        } catch (dlErr) {
          console.warn('⚠️ Échec du téléchargement de la pièce jointe:', dlErr.message);
        }
      }

      const autoConfig = readAutoPushConfig();
      const draft = {
        id: draftId,
        authorId: message.author.id,
        authorTag: message.author.tag,
        text: message.content || '',
        mediaUrl: mediaUrl,
        mediaPath: mediaPath,
        mediaName: mediaName,
        excludeHours: autoConfig.exclude_active_hours || 2.0,
        createdAt: Date.now()
      };

      draftPushes.set(draftId, draft);

      const embed = new EmbedBuilder()
        .setColor(0xec407a)
        .setTitle('📥 NOUVEAU CONTENU DÉPOSÉ DANS #PUSH')
        .setDescription(
          `👋 <@${message.author.id}> a préparé un contenu pour **Kim 💖** !\n\n` +
          `💬 **Message :** ${draft.text ? (draft.text.length > 200 ? draft.text.substring(0, 200) + '...' : draft.text) : '*[Média sans texte]*'}\n` +
          `📎 **Média joint :** ${mediaName ? `\`${mediaName}\`` : '*Aucun fichier*'}\n\n` +
          `👉 **Que souhaites-tu faire avec ce contenu ?**\n` +
          `Assigne ce contenu à l'un des créneaux quotidiens d'**Auto-Push** ou diffuse-le immédiatement :`
        );

      const slotButtons = (autoConfig.slots || []).map(slot =>
        new ButtonBuilder()
          .setCustomId(`push_assign_slot_${slot.id}_${draftId}`)
          .setLabel(`🕒 ${slot.time} (${slot.target_label || slot.target})`)
          .setStyle(ButtonStyle.Primary)
      );

      const row1 = new ActionRowBuilder().addComponents(slotButtons);

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`push_slot_immediate_${draftId}`)
          .setLabel('⚡ Envoyer en Direct (Immédiat)')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`push_cancel_${draftId}`)
          .setLabel('❌ Annuler')
          .setStyle(ButtonStyle.Danger)
      );

      const payload = {
        embeds: [embed],
        components: [row1, row2]
      };

      if (mediaPath && fs.existsSync(mediaPath) && (mediaName.endsWith('.jpg') || mediaName.endsWith('.png') || mediaName.endsWith('.jpeg') || mediaName.endsWith('.webp'))) {
        payload.files = [new AttachmentBuilder(mediaPath, { name: mediaName })];
        embed.setImage(`attachment://${mediaName}`);
      }

      // Supprimer le message brut du chatter pour garder le salon 100% propre
      await message.delete().catch(() => {});

      // Envoyer le panneau d'orientation du contenu
      await message.channel.send(payload);

    } catch (err) {
      console.error('❌ Erreur lors du traitement du message dans #push :', err);
    }
  }
};

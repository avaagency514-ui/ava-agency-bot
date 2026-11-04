/**
 * handlers/pushHandler.js
 * Gère les interactions Discord (boutons, modales) liées au système de Push Telegram.
 */
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
} = require('discord.js');
const path = require('path');
const fs = require('fs');
const {
  draftPushes,
  readConfig,
  readStatus,
  getCachedFansCount,
  buildControlPanelEmbed,
  buildControlPanelButtons,
  buildDraftEmbed,
  buildDraftButtons,
  isPushRunning,
  cancelRunningPush,
  startPush,
  downloadFile
} = require('../services/pushService');

async function handlePushButton(interaction, client) {
  const id = interaction.customId;

  // 1. Bouton "Nouveau Push" -> Ouvre la modale
  if (id === 'push_btn_new') {
    const modal = new ModalBuilder()
      .setCustomId('push_modal_new')
      .setTitle('🚀 Rédiger un Push Telegram');

    const textInput = new TextInputBuilder()
      .setCustomId('push_modal_text')
      .setLabel('Message du Push (Texte envoyé aux fans)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Ex: Coucou chéri 💋 J\'ai pensé à toi... Tu fais quoi ce soir ?')
      .setRequired(true)
      .setMaxLength(4000);

    const mediaUrlInput = new TextInputBuilder()
      .setCustomId('push_modal_media_url')
      .setLabel('Lien direct Image/Vidéo (Optionnel)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://... ou colle le média directement dans le salon')
      .setRequired(false);

    const excludeInput = new TextInputBuilder()
      .setCustomId('push_modal_exclude_hours')
      .setLabel('Exclure fans actifs depuis (heures)')
      .setStyle(TextInputStyle.Short)
      .setValue('2')
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(textInput),
      new ActionRowBuilder().addComponents(mediaUrlInput),
      new ActionRowBuilder().addComponents(excludeInput)
    );

    return interaction.showModal(modal);
  }

  // 2. Bouton "Statistiques Fans"
  if (id === 'push_btn_stats') {
    const config = readConfig();
    const count = getCachedFansCount();
    const status = readStatus();

    const embed = new EmbedBuilder()
      .setColor(0xec407a)
      .setTitle('📊 STATISTIQUES DES FANS — KIM 💖')
      .setDescription(
        `Informations en direct sur la base de données privée Telegram de **${config.model_name || 'Kim'}**.`
      )
      .addFields(
        {
          name: '👥 Fans joignables en MP',
          value: `**${count} fans** répertoriés`,
          inline: true,
        },
        {
          name: '📱 Compte Telegram',
          value: `${config.handle || '@kimchle'} *(ID 8133984458)*`,
          inline: true,
        },
        {
          name: '🛡️ Sécurité Cadence',
          value: `Tempo : **${config.delay_min || 2.5}s – ${config.delay_max || 4.5}s**`,
          inline: true,
        },
        {
          name: '📌 Dernier Push',
          value: status.started_at ? `<t:${status.started_at}:R> (*${status.sent || 0} envoyés*)` : '*Aucun push récent enregistré*',
          inline: false,
        }
      )
      .setFooter({ text: 'Base de données synchronisée 24/7' });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // 3. Bouton "Options de Ciblage"
  if (id === 'push_btn_settings') {
    const config = readConfig();
    const embed = new EmbedBuilder()
      .setColor(0x607d8b)
      .setTitle('⚙️ OPTIONS & SÉCURITÉ DU PUSH')
      .setDescription(
        `Paramètres de protection anti-spam pour les Mass DMs :\n\n` +
        `• **Exclusion des fans actifs :** **${config.exclude_active_hours || 2} heures**\n` +
        `  *(Les fans ayant un message récent ne reçoivent pas le push pour ne pas perturber les conversations en cours avec les chatters).*\n\n` +
        `• **Délai entre messages :** **${config.delay_min || 2.5}s à ${config.delay_max || 4.5}s**\n` +
        `  *(Simule une frappe humaine et évite tout blocage MTProto).*`
      );

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // 4. Bouton "Rafraîchir le panneau"
  if (id === 'push_btn_refresh') {
    const embed = buildControlPanelEmbed();
    const row = buildControlPanelButtons();
    await interaction.update({ embeds: [embed], components: [row] });
    return;
  }

  // 5. Bouton "Confirmer et Envoyer"
  if (id.startsWith('push_confirm_')) {
    const draftId = id.replace('push_confirm_', '');
    const draft = draftPushes.get(draftId);

    if (!draft) {
      return interaction.reply({
        content: '❌ Ce brouillon de Push a expiré ou a déjà été traité.',
        ephemeral: true,
      });
    }

    if (isPushRunning()) {
      return interaction.reply({
        content: '⚠️ Un Mass DM est déjà en cours de diffusion. Attends qu\'il se termine !',
        ephemeral: true,
      });
    }

    await interaction.deferUpdate();

    try {
      // Supprimer le message de brouillon pour ne garder que le message de statut propre
      await interaction.message.delete().catch(() => {});
      await startPush(draft, interaction.channel, client);
    } catch (err) {
      console.error('❌ Erreur lancement push :', err);
      await interaction.followUp({
        content: `❌ Erreur lors du lancement du Push : ${err.message}`,
        ephemeral: true,
      });
    }
    return;
  }

  // 6. Bouton "Annuler"
  if (id.startsWith('push_cancel_')) {
    const draftId = id.replace('push_cancel_', '');
    draftPushes.delete(draftId);

    await interaction.message.delete().catch(() => {});
    return interaction.reply({
      content: '🗑️ Brouillon de Push annulé et supprimé.',
      ephemeral: true,
    });
  }

  // 7. Bouton "Interrompre l'envoi"
  if (id.startsWith('push_abort_')) {
    cancelRunningPush();
    return interaction.reply({
      content: '🛑 Signal d\'interruption transmis au worker Telegram. L\'envoi s\'arrêtera au prochain message.',
      ephemeral: true,
    });
  }
}

async function handlePushModal(interaction, client) {
  if (interaction.customId === 'push_modal_new') {
    const text = interaction.fields.getTextInputValue('push_modal_text');
    const mediaUrl = interaction.fields.getTextInputValue('push_modal_media_url')?.trim() || null;
    const excludeHoursStr = interaction.fields.getTextInputValue('push_modal_exclude_hours')?.trim() || '2';
    const excludeHours = parseFloat(excludeHoursStr) || 2.0;

    const draftId = `draft_${Date.now()}_${interaction.user.id}`;
    let mediaPath = null;
    let mediaName = null;

    if (mediaUrl && (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://'))) {
      try {
        const ext = path.extname(new URL(mediaUrl).pathname) || '.jpg';
        mediaName = `media_${Date.now()}${ext}`;
        const dest = path.join(__dirname, '..', 'temp', 'push_media', mediaName);
        await downloadFile(mediaUrl, dest);
        mediaPath = dest;
      } catch (dlErr) {
        console.warn('⚠️ Impossible de télécharger le média distant :', dlErr.message);
      }
    }

    const draft = {
      id: draftId,
      authorId: interaction.user.id,
      authorTag: interaction.user.tag,
      text: text,
      mediaUrl: mediaUrl,
      mediaPath: mediaPath,
      mediaName: mediaName,
      excludeHours: excludeHours,
      createdAt: Date.now()
    };

    draftPushes.set(draftId, draft);

    const embed = buildDraftEmbed(draft);
    const row = buildDraftButtons(draftId);

    await interaction.reply({
      content: '✅ Brouillon de Push préparé ! Vérifie et valide l\'envoi ci-dessous :',
      ephemeral: true
    });

    await interaction.channel.send({
      embeds: [embed],
      components: [row]
    });
  }
}

module.exports = {
  handlePushButton,
  handlePushModal
};

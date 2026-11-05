/**
 * handlers/pushHandler.js
 * Gère les interactions Discord (boutons, modales) liées au système de Push Telegram et Auto-Push.
 */
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const path = require('path');
const fs = require('fs');
const {
  draftPushes,
  readConfig,
  readStatus,
  readAutoPushConfig,
  saveAutoPushConfig,
  getCachedFansCount,
  buildControlPanelEmbed,
  buildControlPanelButtons,
  buildDraftEmbed,
  buildDraftButtons,
  isPushRunning,
  cancelRunningPush,
  startPush,
  updatePushPanel
} = require('../services/pushService');

async function handlePushButton(interaction, client) {
  const id = interaction.customId;

  // 1. Guide médias
  if (id === 'push_btn_guide') {
    const embed = new EmbedBuilder()
      .setColor(0xec407a)
      .setTitle('📎 COMMENT JOINDRE UN FICHIER (PHOTO, VIDÉO, VOCAL) ?')
      .setDescription(
        `👉 **Aucun lien externe nécessaire !**\n\n` +
        `Il te suffit de glisser-déposer ou cliquer sur le bouton **\`+\`** de Discord pour joindre ton fichier directement dans ce salon :\n\n` +
        `• 📸 **Photo** : \`.jpg\`, \`.png\`, \`.webp\`, \`.heic\`\n` +
        `• 🎥 **Vidéo** : \`.mp4\`, \`.mov\`, \`.webm\`\n` +
        `• 🎙️ **Audio / Vocal** : \`.mp3\`, \`.ogg\`, \`.wav\`, \`.m4a\` *(converti automatiquement en note vocale Telegram)*\n\n` +
        `Accompagne ton fichier de ton texte d'accroche dans le même message.\n` +
        `Le bot te proposera immédiatement d'**assigner ce média à un créneau d'Auto-Push** (10h, 14h30, 21h) ou de l'**envoyer immédiatement** !`
      )
      .setFooter({ text: 'Mass DM Telegram Kim 💖' });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // 2. Toggle Auto-Push Quotidien (ON / OFF)
  if (id === 'push_btn_toggle_auto') {
    const autoConfig = readAutoPushConfig();
    autoConfig.enabled = !autoConfig.enabled;
    saveAutoPushConfig(autoConfig);
    await updatePushPanel(client);

    return interaction.reply({
      content: autoConfig.enabled
        ? '🟢 **Auto-Push Quotidien ACTIVÉ** ! Les créneaux configurés seront diffusés automatiquement.'
        : '⏸️ **Auto-Push Quotidien MIS EN PAUSE**. Aucun message automatique ne sera envoyé.',
      ephemeral: true
    });
  }

  // 3. Toggle Randomisation de l'heure (Jitter ON / OFF)
  if (id === 'push_btn_toggle_jitter') {
    const autoConfig = readAutoPushConfig();
    autoConfig.randomize_time = !autoConfig.randomize_time;
    saveAutoPushConfig(autoConfig);
    await updatePushPanel(client);

    return interaction.reply({
      content: autoConfig.randomize_time
        ? `🎲 **Randomisation horaire ACTIVÉE** (variation aléatoire de ±${autoConfig.jitter_minutes || 10} min pour indétectabilité Telegram).`
        : '🕒 **Heures fixes ACTIVÉES** (les pushs partiront exactement à l\'heure programmée).',
      ephemeral: true
    });
  }

  // 4. Définir le contenu d'un créneau (Bouton principal)
  if (id === 'push_btn_set_slot_content') {
    const autoConfig = readAutoPushConfig();
    const rows = [];
    const buttons = [];

    (autoConfig.slots || []).forEach(slot => {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`push_slot_text_open_${slot.id}`)
          .setLabel(`🕒 Créneau ${slot.time} (${slot.target_label || slot.target})`)
          .setStyle(ButtonStyle.Primary)
      );
    });

    const actionRow = new ActionRowBuilder().addComponents(buttons);

    return interaction.reply({
      content: '📝 **Choisis le créneau pour lequel tu souhaites rédiger ou modifier le message :**\n*(Astuce : Tu peux aussi glisser directement une photo, vidéo ou audio dans ce salon pour joindre un média !)*',
      components: [actionRow],
      ephemeral: true
    });
  }

  // 4b. Ouvrir la modale de texte pour un créneau spécifique
  if (id.startsWith('push_slot_text_open_')) {
    const slotId = id.replace('push_slot_text_open_', '');
    const autoConfig = readAutoPushConfig();
    const slot = (autoConfig.slots || []).find(s => s.id === slotId);

    if (!slot) {
      return interaction.reply({ content: '❌ Créneau introuvable.', ephemeral: true });
    }

    const modal = new ModalBuilder()
      .setCustomId(`push_modal_slot_${slot.id}`)
      .setTitle(`Message : ${slot.time} (${slot.target_label || slot.target})`);

    const textInput = new TextInputBuilder()
      .setCustomId('slot_msg_text')
      .setLabel('Message diffusé aux fans')
      .setStyle(TextInputStyle.Paragraph)
      .setValue(slot.text || '')
      .setPlaceholder('Tape ton texte d\'accroche ici...')
      .setRequired(true)
      .setMaxLength(3000);

    modal.addComponents(new ActionRowBuilder().addComponents(textInput));
    return interaction.showModal(modal);
  }

  // 5. Modifier le planning et les horaires (Modal)
  if (id === 'push_btn_edit_slots') {
    const autoConfig = readAutoPushConfig();
    const slots = autoConfig.slots || [];

    const modal = new ModalBuilder()
      .setCustomId('push_modal_edit_schedule')
      .setTitle('🕒 Modifier les Heures d\'Auto-Push');

    const s1 = slots[0] || { time: '10:00' };
    const s2 = slots[1] || { time: '14:30' };
    const s3 = slots[2] || { time: '21:00' };

    const input1 = new TextInputBuilder()
      .setCustomId('slot_1_time')
      .setLabel('Heure Créneau 1 (Abonnés)')
      .setStyle(TextInputStyle.Short)
      .setValue(s1.time)
      .setPlaceholder('10:00')
      .setRequired(true);

    const input2 = new TextInputBuilder()
      .setCustomId('slot_2_time')
      .setLabel('Heure Créneau 2 (Intéressés)')
      .setStyle(TextInputStyle.Short)
      .setValue(s2.time)
      .setPlaceholder('14:30')
      .setRequired(true);

    const input3 = new TextInputBuilder()
      .setCustomId('slot_3_time')
      .setLabel('Heure Créneau 3 (Anciens)')
      .setStyle(TextInputStyle.Short)
      .setValue(s3.time)
      .setPlaceholder('21:00')
      .setRequired(true);

    const inputJitter = new TextInputBuilder()
      .setCustomId('jitter_minutes')
      .setLabel('Variation aléatoire (minutes, ex: 10)')
      .setStyle(TextInputStyle.Short)
      .setValue(String(autoConfig.jitter_minutes || 10))
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(input1),
      new ActionRowBuilder().addComponents(input2),
      new ActionRowBuilder().addComponents(input3),
      new ActionRowBuilder().addComponents(inputJitter)
    );

    return interaction.showModal(modal);
  }

  // 6. Auto-suppression des pushs (Modal)
  if (id === 'push_btn_auto_delete') {
    const autoConfig = readAutoPushConfig();
    const modal = new ModalBuilder()
      .setCustomId('push_modal_auto_delete')
      .setTitle('⏳ Auto-Suppression des Pushs');

    const input = new TextInputBuilder()
      .setCustomId('auto_delete_hours')
      .setLabel('Délai avant suppression (en heures, 0 = off)')
      .setStyle(TextInputStyle.Short)
      .setValue(String(autoConfig.auto_delete_hours || 0))
      .setPlaceholder('Ex: 24 pour supprimer après 24h, 0 pour désactiver')
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  // 7. Bouton "Push Texte Seul" (Manuel immédiat)
  if (id === 'push_btn_text_only' || id === 'push_btn_new') {
    const modal = new ModalBuilder()
      .setCustomId('push_modal_text_only')
      .setTitle('📝 Push Immédiat (Texte Seul)');

    const textInput = new TextInputBuilder()
      .setCustomId('push_modal_text')
      .setLabel('Message du Push')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Ex: Coucou chéri 💋 J\'ai pensé à toi... Tu fais quoi ce soir ?')
      .setRequired(true)
      .setMaxLength(4000);

    const targetInput = new TextInputBuilder()
      .setCustomId('push_modal_target')
      .setLabel('Cible (all, subscribers, interested, churned)')
      .setStyle(TextInputStyle.Short)
      .setValue('all')
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(textInput),
      new ActionRowBuilder().addComponents(targetInput)
    );

    return interaction.showModal(modal);
  }

  // 8. Rafraîchir le panneau
  if (id === 'push_btn_refresh') {
    await updatePushPanel(client);
    return interaction.reply({ content: '🔄 Panneau Auto-Push rafraîchi avec succès.', ephemeral: true });
  }

  // 9. Assigner un média/message déposé à un créneau d'Auto-Push
  if (id.startsWith('push_assign_slot_')) {
    const parts = id.replace('push_assign_slot_', '').split('_');
    const slotId = `${parts[0]}_${parts[1]}`; // ex: slot_1
    const draftId = parts.slice(2).join('_');
    const draft = draftPushes.get(draftId);

    if (!draft) {
      return interaction.reply({ content: '❌ Ce contenu a expiré ou a déjà été traité.', ephemeral: true });
    }

    const autoConfig = readAutoPushConfig();
    const slot = (autoConfig.slots || []).find(s => s.id === slotId);

    if (!slot) {
      return interaction.reply({ content: '❌ Créneau introuvable.', ephemeral: true });
    }

    slot.text = draft.text || '';
    slot.media_path = draft.mediaPath || null;
    slot.media_name = draft.mediaName || null;
    slot.last_run = null; // Réactiver pour aujourd'hui si nouveau message déposé
    saveAutoPushConfig(autoConfig);

    await interaction.message.delete().catch(() => {});
    await interaction.reply({
      content: `✅ Contenu assigné au créneau **${slot.time} (${slot.target_label || slot.target})** par <@${interaction.user.id}> ! Il sera diffusé automatiquement à l'heure prévue.`
    });

    await updatePushPanel(client);
    draftPushes.delete(draftId);
    return;
  }

  // 10. Lancer immédiatement en manuel depuis un dépôt de contenu
  if (id.startsWith('push_slot_immediate_')) {
    const draftId = id.replace('push_slot_immediate_', '');
    const draft = draftPushes.get(draftId);

    if (!draft) {
      return interaction.reply({ content: '❌ Ce contenu a expiré ou a déjà été traité.', ephemeral: true });
    }

    await interaction.message.delete().catch(() => {});

    const embed = buildDraftEmbed(draft);
    const row = buildDraftButtons(draftId);

    await interaction.channel.send({
      content: `⚡ Push manuel direct préparé par <@${interaction.user.id}> :`,
      embeds: [embed],
      components: [row]
    });
    return;
  }

  // 11. Confirmer l'envoi immédiat
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

  // 12. Annuler un brouillon
  if (id.startsWith('push_cancel_')) {
    const draftId = id.replace('push_cancel_', '');
    draftPushes.delete(draftId);

    await interaction.message.delete().catch(() => {});
    return interaction.reply({
      content: '🗑️ Contenu annulé et supprimé.',
      ephemeral: true,
    });
  }

  // 13. Interrompre l'envoi en cours
  if (id.startsWith('push_abort_')) {
    cancelRunningPush();
    return interaction.reply({
      content: '🛑 Signal d\'interruption transmis au worker Telegram. L\'envoi s\'arrêtera au prochain message.',
      ephemeral: true,
    });
  }
}

async function handlePushModal(interaction, client) {
  const id = interaction.customId;

  // 1. Modal texte créneau spécifique
  if (id.startsWith('push_modal_slot_')) {
    const slotId = id.replace('push_modal_slot_', '');
    const newText = interaction.fields.getTextInputValue('slot_msg_text');

    const autoConfig = readAutoPushConfig();
    const slot = (autoConfig.slots || []).find(s => s.id === slotId);

    if (!slot) {
      return interaction.reply({ content: '❌ Créneau introuvable.', ephemeral: true });
    }

    slot.text = newText;
    slot.last_run = null; // Réactiver pour aujourd'hui
    saveAutoPushConfig(autoConfig);
    await updatePushPanel(client);

    return interaction.reply({
      content: `✅ Message mis à jour pour le créneau **${slot.time} (${slot.target_label || slot.target})** !`,
      ephemeral: true
    });
  }

  // 2. Modal modification des horaires
  if (id === 'push_modal_edit_schedule') {
    const time1 = interaction.fields.getTextInputValue('slot_1_time')?.trim() || '10:00';
    const time2 = interaction.fields.getTextInputValue('slot_2_time')?.trim() || '14:30';
    const time3 = interaction.fields.getTextInputValue('slot_3_time')?.trim() || '21:00';
    const jitterStr = interaction.fields.getTextInputValue('jitter_minutes')?.trim() || '10';

    const autoConfig = readAutoPushConfig();
    if (autoConfig.slots[0]) autoConfig.slots[0].time = time1;
    if (autoConfig.slots[1]) autoConfig.slots[1].time = time2;
    if (autoConfig.slots[2]) autoConfig.slots[2].time = time3;
    autoConfig.jitter_minutes = parseInt(jitterStr, 10) || 10;

    saveAutoPushConfig(autoConfig);
    await updatePushPanel(client);

    return interaction.reply({
      content: `✅ Planning mis à jour !\n• Créneau 1 : **${time1}** (Abonnés)\n• Créneau 2 : **${time2}** (Intéressés)\n• Créneau 3 : **${time3}** (Anciens)\n• Jitter : **±${autoConfig.jitter_minutes} min**`,
      ephemeral: true
    });
  }

  // 3. Modal auto-suppression
  if (id === 'push_modal_auto_delete') {
    const hoursStr = interaction.fields.getTextInputValue('auto_delete_hours')?.trim() || '0';
    const hours = parseFloat(hoursStr) || 0.0;

    const autoConfig = readAutoPushConfig();
    autoConfig.auto_delete_hours = hours;
    saveAutoPushConfig(autoConfig);
    await updatePushPanel(client);

    return interaction.reply({
      content: hours > 0
        ? `✅ **Auto-suppression configurée à ${hours} heures** ! Les messages privés seront supprimés de Telegram après ce délai.`
        : '❌ **Auto-suppression désactivée** (les messages resteront dans le DM des fans).',
      ephemeral: true
    });
  }

  // 4. Modal push direct texte seul
  if (id === 'push_modal_text_only' || id === 'push_modal_new') {
    const text = interaction.fields.getTextInputValue('push_modal_text');
    const targetSegment = interaction.fields.getTextInputValue('push_modal_target')?.trim().toLowerCase() || 'all';

    const autoConfig = readAutoPushConfig();
    const draftId = `draft_${Date.now()}_${interaction.user.id}`;

    const draft = {
      id: draftId,
      authorId: interaction.user.id,
      authorTag: interaction.user.tag,
      text: text,
      mediaUrl: null,
      mediaPath: null,
      mediaName: null,
      targetSegment: targetSegment,
      targetSegmentLabel: targetSegment === 'subscribers' ? 'Abonnés' : (targetSegment === 'interested' ? 'Intéressés' : (targetSegment === 'churned' ? 'Anciens' : 'Tous les fans')),
      autoDeleteHours: autoConfig.auto_delete_hours || 0,
      excludeHours: autoConfig.exclude_active_hours || 2.0,
      createdAt: Date.now()
    };

    draftPushes.set(draftId, draft);

    const embed = buildDraftEmbed(draft);
    const row = buildDraftButtons(draftId);

    await interaction.reply({
      content: '✅ Brouillon de Push manuel préparé ! Vérifie et valide ci-dessous :',
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

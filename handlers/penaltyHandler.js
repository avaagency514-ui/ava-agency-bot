/**
 * handlers/penaltyHandler.js
 * Gestionnaire des interactions (Boutons, Modals, Sélecteurs) pour le système de pénalisations et de levée de sanctions
 */
'use strict';

const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
  PermissionsBitField,
} = require('discord.js');

const {
  recordAgencyPenalty,
  getRecentPenalties,
  getActivePenalties,
  getPenaltyById,
  revokeAgencyPenalty,
  publishPenaltyAnnouncement,
  setupPenaltyPanelChannel,
  getPenaltyChannelsForCategory,
} = require('../services/penaltyService');

function isAuthorized(interaction) {
  const roleFounderId = process.env.ROLE_FUNDER_ID || '1438301065471721636';
  const memberRoles = interaction.member?.roles;
  const hasFounderRole = memberRoles?.cache
    ? memberRoles.cache.has(roleFounderId)
    : (Array.isArray(memberRoles) ? memberRoles.includes(roleFounderId) : false);
  const isAdmin = interaction.member?.permissions?.has
    ? (interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) || interaction.member.permissions.has('Administrator'))
    : false;
  const isGuildOwner = Boolean(interaction.guild?.ownerId && interaction.guild.ownerId === interaction.user?.id);
  return Boolean(hasFounderRole || isAdmin || isGuildOwner);
}

// ─── 1. Gestion des Boutons ──────────────────────────────────────────────────
async function handlePenaltyButton(interaction, client) {
  const id = interaction.customId;

  // Vérification des droits d'accès
  if (!isAuthorized(interaction)) {
    return interaction.reply({
      content: '❌ **Accès réservé** : Seuls les fondateurs et administrateurs ont l\'autorisation de gérer les sanctions.',
      ephemeral: true,
    });
  }

  // ── Bouton Chatter ──
  if (id === 'penalty_btn_chatter') {
    const modal = new ModalBuilder()
      .setCustomId(`penalty_modal_chatter_${Date.now()}`)
      .setTitle('💬 Pénaliser un Chatter');

    const nameInput = new TextInputBuilder()
      .setCustomId('target_name')
      .setLabel('1. Prénom ou Mention du Chatter *')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('ex: Moise ou @pseudo')
      .setRequired(true);

    const amountInput = new TextInputBuilder()
      .setCustomId('penalty_amount')
      .setLabel('2. Déduction en $ ou Sanction *')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('ex: 5$, 10, Avertissement verbal...')
      .setRequired(true);

    const reasonInput = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('3. Motif du manquement *')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('ex: Retard > 15 min, Non-respect des consignes...')
      .setRequired(true);

    const detailsInput = new TextInputBuilder()
      .setCustomId('details')
      .setLabel('4. Détails / Preuves (facultatif)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Précisez le contexte, la date du shift ou les faits constatés...')
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(amountInput),
      new ActionRowBuilder().addComponents(reasonInput),
      new ActionRowBuilder().addComponents(detailsInput)
    );

    return interaction.showModal(modal);
  }

  // ── Bouton VA ──
  if (id === 'penalty_btn_va') {
    const modal = new ModalBuilder()
      .setCustomId(`penalty_modal_va_${Date.now()}`)
      .setTitle('📱 Pénaliser un VA');

    const nameInput = new TextInputBuilder()
      .setCustomId('target_name')
      .setLabel('1. Nom ou Mention du VA *')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('ex: Nom du VA ou @pseudo')
      .setRequired(true);

    const sanctionInput = new TextInputBuilder()
      .setCustomId('sanction_type')
      .setLabel('2. Sanction / Déduction ($ ou Avert.) *')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('ex: 1er Avertissement, Retenue 5$, Suspension 24h...')
      .setRequired(true);

    const reasonInput = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('3. Motif du manquement *')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('ex: Objectifs non tenus, Inactivité, Négligence...')
      .setRequired(true);

    const detailsInput = new TextInputBuilder()
      .setCustomId('details')
      .setLabel('4. Détails / Preuves (facultatif)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Précisez les comptes concernés, les dates, etc...')
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(sanctionInput),
      new ActionRowBuilder().addComponents(reasonInput),
      new ActionRowBuilder().addComponents(detailsInput)
    );

    return interaction.showModal(modal);
  }

  // ── Bouton Manager ──
  if (id === 'penalty_btn_manager') {
    const modal = new ModalBuilder()
      .setCustomId(`penalty_modal_manager_${Date.now()}`)
      .setTitle('👔 Pénaliser un Manager');

    const nameInput = new TextInputBuilder()
      .setCustomId('target_name')
      .setLabel('1. Nom ou Mention du Manager *')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('ex: Nom du Manager ou @pseudo')
      .setRequired(true);

    const sanctionInput = new TextInputBuilder()
      .setCustomId('sanction_type')
      .setLabel('2. Sanction ou Mesure disciplinaire *')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('ex: Avertissement officiel, Déduction 10$, Blâme...')
      .setRequired(true);

    const reasonInput = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('3. Motif du manquement *')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('ex: Manque de suivi des équipes, Consignes ignorées...')
      .setRequired(true);

    const detailsInput = new TextInputBuilder()
      .setCustomId('details')
      .setLabel('4. Détails / Remarques (facultatif)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Précisez les faits reprochés et les antécédents...')
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(sanctionInput),
      new ActionRowBuilder().addComponents(reasonInput),
      new ActionRowBuilder().addComponents(detailsInput)
    );

    return interaction.showModal(modal);
  }

  // ── Bouton Lever une Sanction ──
  if (id === 'penalty_btn_revoke') {
    const activePenalties = getActivePenalties(25);
    if (!activePenalties || activePenalties.length === 0) {
      return interaction.reply({
        content: 'ℹ️ **Aucune sanction active** n\'est actuellement enregistrée. Tous les dossiers sont en règle.',
        ephemeral: true,
      });
    }

    const options = activePenalties.slice(0, 25).map(p => {
      const emoji = p.target_category === 'Manager' ? '👔' : (p.target_category === 'Chatter' ? '💬' : '📱');
      return {
        label: `#${p.id} — ${emoji} ${p.target_name} (${p.penalty_type_amount})`.slice(0, 100),
        description: `${p.target_category} : ${p.reason}`.slice(0, 100),
        value: p.id.toString(),
      };
    });

    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('penalty_select_revoke')
        .setPlaceholder('🕊️ Choisir la sanction à lever...')
        .addOptions(options)
    );

    const btnRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('penalty_btn_revoke_manual')
        .setLabel('✏️ Saisir un ID manuellement')
        .setStyle(ButtonStyle.Secondary)
    );

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('🕊️ LEVÉE & RÉHABILITATION DE SANCTION')
      .setDescription(
        `Sélectionnez ci-dessous la sanction que vous souhaitez **lever et annuler**.\n\n` +
        `**Effets automatiques de la levée :**\n` +
        `• 🔄 Rétablissement du dossier disciplinaire du membre.\n` +
        `• 💵 **Restitution financière** immédiate des retenues sur commissions (Chatters).\n` +
        `• 🧹 Annulation des avertissements (strikes) associés.\n` +
        `• 📢 **Diffusion officielle de réhabilitation** dans les salons de l'équipe.`
      )
      .setFooter({ text: 'AVA Agency • Réhabilitation Officielle' });

    return interaction.reply({
      embeds: [embed],
      components: [selectRow, btnRow],
      ephemeral: true,
    });
  }

  // ── Bouton Saisie Manuelle ID pour Levée ──
  if (id === 'penalty_btn_revoke_manual') {
    const modal = new ModalBuilder()
      .setCustomId('penalty_modal_revoke_manual')
      .setTitle('🕊️ Lever une Sanction par ID');

    const idInput = new TextInputBuilder()
      .setCustomId('penalty_id')
      .setLabel('1. ID de la Sanction (#) *')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('ex: 1, 2, 5...')
      .setRequired(true);

    const reasonInput = new TextInputBuilder()
      .setCustomId('revoked_reason')
      .setLabel('2. Motif de la levée *')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('ex: Justificatif fourni, accord direction, excuse acceptée...')
      .setRequired(true);

    const broadcastInput = new TextInputBuilder()
      .setCustomId('broadcast')
      .setLabel('3. Diffuser avis public ? (Oui / Non)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Oui (défaut : avis officiel diffusé dans les salons)')
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(idInput),
      new ActionRowBuilder().addComponents(reasonInput),
      new ActionRowBuilder().addComponents(broadcastInput)
    );

    return interaction.showModal(modal);
  }

  // ── Historique des Sanctions ──
  if (id === 'penalty_btn_history') {
    const list = getRecentPenalties(10);
    if (!list || list.length === 0) {
      return interaction.reply({
        content: 'ℹ️ **Aucune sanction** n\'a encore été enregistrée dans la base de données.',
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('📜 HISTORIQUE DES 10 DERNIÈRES SANCTIONS')
      .setDescription(
        list.map((p) => {
          const emoji = p.target_category === 'Manager' ? '👔' : (p.target_category === 'Chatter' ? '💬' : '📱');
          const isRevoked = p.status === 'REVOKED';
          const statusBadge = isRevoked ? `🕊️ **[LEVÉE]** *(le ${p.revoked_at || 'récemment'} : ${p.revoked_reason || 'Régularisation'})*` : `🔴 **[ACTIVE]**`;
          return `**#${p.id}** ${emoji} **${p.target_name}** (${p.target_category}) — ${statusBadge}\n` +
            `└ 💸 Sanction : \`${p.penalty_type_amount}\`\n` +
            `└ ⚠️ Motif : *${p.reason}*\n` +
            `└ 👮 Par : <@${p.issued_by_id}> · 📅 ${p.created_at}`;
        }).join('\n\n')
      )
      .setFooter({ text: 'AVA Agency • Registre Disciplinaire Officiel' })
      .setTimestamp();

    // Si certaines sanctions sont actives, proposer directement le menu de levée
    const activeList = list.filter(p => p.status !== 'REVOKED');
    const components = [];

    if (activeList.length > 0) {
      const options = activeList.slice(0, 25).map(p => {
        const emoji = p.target_category === 'Manager' ? '👔' : (p.target_category === 'Chatter' ? '💬' : '📱');
        return {
          label: `#${p.id} — ${emoji} ${p.target_name} (${p.penalty_type_amount})`.slice(0, 100),
          description: `${p.target_category} : ${p.reason}`.slice(0, 100),
          value: p.id.toString(),
        };
      });

      components.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('penalty_select_revoke')
            .setPlaceholder('🕊️ Choisir une sanction active à lever...')
            .addOptions(options)
        )
      );
    }

    return interaction.reply({
      embeds: [embed],
      components,
      ephemeral: true,
    });
  }

  // ── Actualisation du Panneau ──
  if (id === 'penalty_btn_refresh') {
    await setupPenaltyPanelChannel(client);
    return interaction.reply({
      content: '✅ **Panneau des pénalités actualisé avec succès !**',
      ephemeral: true,
    });
  }
}

// ─── 2. Gestion des Menus Déroulants (Select Menus) ───────────────────────────
async function handlePenaltySelect(interaction, client) {
  const id = interaction.customId;

  if (!isAuthorized(interaction)) {
    return interaction.reply({ content: '❌ Non autorisé.', ephemeral: true });
  }

  if (id === 'penalty_select_revoke') {
    const penaltyId = parseInt(interaction.values[0], 10);
    const p = getPenaltyById(penaltyId);

    if (!p) {
      return interaction.reply({ content: '❌ Sanction introuvable.', ephemeral: true });
    }

    if (p.status === 'REVOKED') {
      return interaction.reply({
        content: `ℹ️ Cette sanction (#${penaltyId}) a déjà été levée.`,
        ephemeral: true,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId(`penalty_modal_confirm_revoke_${penaltyId}`)
      .setTitle(`🕊️ Lever la sanction #${penaltyId}`);

    const reasonInput = new TextInputBuilder()
      .setCustomId('revoked_reason')
      .setLabel('1. Motif de la levée de sanction *')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('ex: Régularisation effectuée, accord direction, excuse acceptée...')
      .setRequired(true);

    const broadcastInput = new TextInputBuilder()
      .setCustomId('broadcast')
      .setLabel('2. Diffuser avis public ? (Oui / Non)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Oui (défaut : avis officiel diffusé dans les salons)')
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(reasonInput),
      new ActionRowBuilder().addComponents(broadcastInput)
    );

    return interaction.showModal(modal);
  }
}

// ─── 3. Gestion des Modals ───────────────────────────────────────────────────
async function handlePenaltyModal(interaction, client) {
  const id = interaction.customId;

  if (!isAuthorized(interaction)) {
    return interaction.reply({
      content: '❌ Non autorisé.',
      ephemeral: true,
    });
  }

  // ── Levée de sanction (Confirmation via Select ou Saisie Manuelle) ──
  if (id.startsWith('penalty_modal_confirm_revoke_') || id === 'penalty_modal_revoke_manual') {
    let penaltyId = null;

    if (id === 'penalty_modal_revoke_manual') {
      const rawId = interaction.fields.getTextInputValue('penalty_id').trim().replace('#', '');
      penaltyId = parseInt(rawId, 10);
    } else {
      penaltyId = parseInt(id.replace('penalty_modal_confirm_revoke_', ''), 10);
    }

    if (isNaN(penaltyId) || penaltyId <= 0) {
      return interaction.reply({
        content: '❌ **Numéro ID invalide.** Veuillez saisir un numéro entier supérieur à 0.',
        ephemeral: true,
      });
    }

    const revokedReason = interaction.fields.getTextInputValue('revoked_reason').trim();
    let broadcast = true;
    try {
      const b = interaction.fields.getTextInputValue('broadcast')?.trim().toLowerCase();
      if (b && (b.startsWith('n') || b === 'faux' || b === 'no')) {
        broadcast = false;
      }
    } catch (_) {}

    await interaction.deferReply({ ephemeral: true });

    const res = await revokeAgencyPenalty({
      penaltyId,
      revokedById: interaction.user.id,
      revokedByName: interaction.user.username,
      revokedReason,
      broadcastAnnouncement: broadcast,
      client,
    });

    if (!res.success) {
      return interaction.editReply({
        content: `❌ **Impossible de lever la sanction** : ${res.error}`,
      });
    }

    let confirmation =
      `🕊️ **SANCTION #${res.penalty.id} OFFICIELLEMENT LEVÉE ET ANNULÉE !**\n\n` +
      `• Membre : **${res.penalty.target_name}** (${res.penalty.target_category})\n` +
      `• Sanction annulée : ~~\`${res.penalty.penalty_type_amount}\`~~\n` +
      `• Motif de levée : *${revokedReason}*\n` +
      `• Décidé par : <@${interaction.user.id}>\n`;

    if (res.financialRestored > 0) {
      confirmation += `• 💳 **Restitution financière :** **$${res.financialRestored.toFixed(2)}** automatiquement recrédités sur le solde de commissions.\n`;
    }

    if (res.strikesRemoved > 0) {
      confirmation += `• 🧹 **Dossier disciplinaire :** Avertissement (strike) retiré du profil.\n`;
    }

    if (broadcast) {
      confirmation += `• 📢 **Avis de levée diffusé publiquement** dans les salons de l'équipe.`;
    } else {
      confirmation += `• 🔒 **Levée enregistrée en discret** (sans notification publique).`;
    }

    return interaction.editReply({ content: confirmation });
  }

  // ── Création d'une nouvelle sanction ──
  let targetCategory = 'Chatter';
  let penaltyTypeAmount = '';

  if (id.startsWith('penalty_modal_chatter_')) {
    targetCategory = 'Chatter';
    penaltyTypeAmount = interaction.fields.getTextInputValue('penalty_amount').trim();
  } else if (id.startsWith('penalty_modal_va_')) {
    targetCategory = 'VA';
    penaltyTypeAmount = interaction.fields.getTextInputValue('sanction_type').trim();
  } else if (id.startsWith('penalty_modal_manager_')) {
    targetCategory = 'Manager';
    penaltyTypeAmount = interaction.fields.getTextInputValue('sanction_type').trim();
  }

  const targetChannels = getPenaltyChannelsForCategory(targetCategory);
  const destinationChannelId = targetChannels.join(',');

  const targetName = interaction.fields.getTextInputValue('target_name').trim();
  const reason = interaction.fields.getTextInputValue('reason').trim();
  let details = '';
  try {
    details = interaction.fields.getTextInputValue('details')?.trim() || '';
  } catch (_) {}

  // Enregistrer dans la base de données SQLite
  const record = recordAgencyPenalty({
    targetCategory,
    targetName,
    targetDiscordId: targetName.replace(/[<@!>]/g, ''),
    penaltyTypeAmount,
    reason,
    details,
    issuedById: interaction.user.id,
    issuedByName: interaction.user.username,
    destinationChannelId,
  });

  // Publier la notification dans le salon approprié
  await publishPenaltyAnnouncement(client, record).catch(err => {
    console.error('Erreur publication annonce sanction :', err);
  });

  const channelsMention = targetChannels.map(cid => `<#${cid}>`).join(', ');
  let confirmationMessage =
    `✅ **Sanction enregistrée avec succès !**\n\n` +
    `• Membre : **${record.targetName}** (${record.targetCategory})\n` +
    `• Sanction : \`${record.penaltyTypeAmount}\`\n` +
    `• Motif : *${record.reason}*\n` +
    `• Diffusée publiquement dans : ${channelsMention}`;

  if (record.linkedChatter && record.financialDeduction > 0) {
    confirmationMessage += `\n• 💳 **Impact financier :** **$${record.financialDeduction.toFixed(2)}** automatiquement déduits du solde de commissions de **${record.linkedChatter.name}** pour le cycle en cours.`;
  }

  return interaction.reply({
    content: confirmationMessage,
    ephemeral: true,
  });
}

module.exports = {
  handlePenaltyButton,
  handlePenaltySelect,
  handlePenaltyModal,
};

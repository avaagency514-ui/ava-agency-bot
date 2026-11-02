/**
 * handlers/chatterHandler.js
 * Gestionnaire des interactions Discord (Boutons, Modals, Menus) pour le système Chatters
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
} = require('discord.js');

const {
  getAllChatters,
  getChatterById,
  getChatterByDiscordId,
  linkChatterDiscord,
  updateChatterStatus,
  updateChatterShift,
  updateChatterCommission,
  addChatter,
  deleteChatter,
  recordSale,
  getChatterStats,
  getGlobalDashboardData,
  processAllChatterPayouts,
  setupChatterAdminChannel,
  postSaleNotification,
  postShiftStartNotification,
  postShiftEndNotification,
  clockInChatter,
  clockOutChatter,
  renderProgressBar,
} = require('../services/chatterService');


// ─── Résolution automatique du profil chatter ────────────────────────────────
// Ordre de priorité :
//  1. discord_user_id déjà enregistré en base → match immédiat
//  2. Surnom serveur Discord (nickname) → définissable par les fondateurs
//  3. globalName / displayName / username Discord → correspondance avec le prénom en BDD
//  4. Rôle @Chatter (Fr ou US) présent → confiance renforcée, même logique
//  5. Aucun match → sélecteur affiché une seule fois puis liaison permanente
//
// ASTUCE FONDATEURS : Mettez le surnom (clic droit membre → Modifier le pseudo)
// = prénom exact dans la BDD, ex: "Daniel". Liaison 100% automatique.
async function resolveChatter(interaction) {
  const { getChatterByDiscordId, getAllChatters, linkChatterDiscord } = require('../services/chatterService');
  const discordUser = interaction.user;
  const member = interaction.member; // Contient surnom serveur + rôles

  // 1. Par Discord ID déjà enregistré
  const byId = getChatterByDiscordId(discordUser.id);
  if (byId) return byId;

  // 2. Construire la liste des noms à tester (surnom serveur en priorité absolue)
  const serverNickname = member?.nickname || null; // Défini par fondateurs
  const candidates = [
    serverNickname,          // Ex: "Daniel" → priorité max (fondateur peut le fixer)
    discordUser.globalName,  // Ex: "Daniel" (nom global Discord)
    discordUser.displayName, // Ex: "Daniel" (displayName)
    discordUser.username,    // Ex: "daniel_gaming"
  ].filter(Boolean).map(n => n.toLowerCase().trim());

  const allChatters = getAllChatters();
  let matched = null;

  // 3a. Correspondance exacte en priorité
  for (const candidate of candidates) {
    matched = allChatters.find(c => c.name.toLowerCase().trim() === candidate);
    if (matched) break;
  }

  // 3b. Correspondance partielle si pas de match exact
  if (!matched) {
    for (const candidate of candidates) {
      matched = allChatters.find(c => {
        const cn = c.name.toLowerCase().trim();
        return candidate.startsWith(cn) || cn.startsWith(candidate);
      });
      if (matched) break;
    }
  }

  // 4. Si rôle @Chatter détecté mais toujours pas de match → log pour diagnostic
  if (!matched && member?.roles?.cache) {
    const chatterRoleIds = [
      process.env.ROLE_CHATTER_FR_ID || '1443497241036722307',
      process.env.ROLE_CHATTER_US_ID || '1555270941775241266',
    ];
    const hasChatterRole = chatterRoleIds.some(rId => member.roles.cache.has(rId));
    if (hasChatterRole) {
      console.log(`ℹ️ Chatter rôle détecté mais nom non trouvé: @${discordUser.username} | nickname: "${serverNickname || 'aucun'}" | Sélecteur affiché.`);
    }
  }

  // 5. Si correspondance → lier automatiquement
  if (matched) {
    linkChatterDiscord(matched.id, discordUser.id);
    console.log(`🔗 Auto-liaison: "${matched.name}" <=> @${discordUser.username} (ID: ${discordUser.id}) | Nickname: "${serverNickname || 'aucun'}"`);
    return matched;
  }

  return null;
}

// ─── Afficher le sélecteur de profil (commun à tous les boutons) ─────────────
function showIdentitySelector(interaction, pendingAction) {
  const { getAllChatters } = require('../services/chatterService');
  const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

  const allChatters = getAllChatters();
  if (allChatters.length === 0) {
    return interaction.reply({
      content: '❌ Aucun profil de chatter configuré par les fondateurs.',
      ephemeral: true,
    });
  }

  const options = allChatters.map(c => ({
    label: c.name,
    description: `Compte: ${c.assigned_account} · Shift: ${c.shift} (${c.commission_rate}%)`,
    value: c.id.toString(),
  }));

  const customId = pendingAction
    ? `chatter_select_identity_then_${pendingAction}`
    : 'chatter_select_identity';

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder('👉 Choisis ton prénom dans la liste...')
      .addOptions(options.slice(0, 25))
  );

  return interaction.reply({
    content: `👋 **Première connexion !** Ton compte Discord n'est pas encore associé à un profil Chatter.\nSélectionne ton prénom ci-dessous pour t'enregistrer **une fois pour toutes** :`,
    components: [row],
    ephemeral: true,
  });
}

// ─── 1. Gestion des Boutons ──────────────────────────────────────────────────
async function handleChatterButton(interaction, client) {
  const id = interaction.customId;

  // ── Salons Chatters (Déclaration Ventes, Stats, Shift) ──
  if (id === 'chatter_btn_declare_sale') {
    let chatter = await resolveChatter(interaction);

    if (!chatter) {
      return showIdentitySelector(interaction, 'declare_sale');
    }

    // Afficher directement le formulaire de vente
    const modal = new ModalBuilder()
      .setCustomId(`chatter_modal_sale_${chatter.id}`)
      .setTitle(`💰 Déclarer une vente — ${chatter.name}`);

    const subInput = new TextInputBuilder()
      .setCustomId('sub_name')
      .setLabel('Pseudo du Sub / Fan')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('ex: Kevin92, Alex_fan, JohnDoe')
      .setRequired(true);

    const amountInput = new TextInputBuilder()
      .setCustomId('amount')
      .setLabel('Montant de la vente ($)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('ex: 25.00 ou 15')
      .setRequired(true);

    const ppvInput = new TextInputBuilder()
      .setCustomId('ppv_name')
      .setLabel('Nom du PPV / Média vendu')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('ex: Pack Douche Vidéo #2, Photo exclusive, Tip')
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(subInput),
      new ActionRowBuilder().addComponents(amountInput),
      new ActionRowBuilder().addComponents(ppvInput)
    );

    return interaction.showModal(modal);
  }

  if (id === 'chatter_btn_my_stats') {
    const chatter = await resolveChatter(interaction);
    if (!chatter) return showIdentitySelector(interaction, 'my_stats');

    const stats = getChatterStats(chatter.id);
    const progressBar = renderProgressBar(stats.progress, 10);
    const statusEmoji = chatter.status.toLowerCase() === 'actif' ? '🟢 `Actif (En shift)`' : '⚪ `Repos (Hors ligne)`';

    const embed = new EmbedBuilder()
      .setColor(0x00ff88)
      .setTitle(`📊 Performances & Commissions — ${chatter.name}`)
      .setDescription(`Voici le récapitulatif de tes gains pour le **cycle de 2 semaines en cours** :`)
      .addFields(
        { name: '👤 Compte & Shift', value: `Compte: **${chatter.assigned_account}**\nShift: *${chatter.shift}*`, inline: true },
        { name: '⚡ Statut actuel', value: statusEmoji, inline: true },
        { name: '💎 Taux de Commission', value: `**${chatter.commission_rate}%**`, inline: true },
        { name: '💵 Ventes en Attente', value: `**$${stats.pendingTotalSales.toFixed(2)}** (${stats.pendingSalesCount} vente(s))`, inline: true },
        { name: '💰 Commissions Dues', value: `**$${stats.pendingTotalCommission.toFixed(2)}**`, inline: true },
        { name: '💳 Historique Déjà Payé', value: `**$${stats.historicalTotalPaid.toFixed(2)}**`, inline: true },
        {
          name: `🎯 Objectif ($${stats.target.toFixed(2)})`,
          value: `${progressBar} **${stats.progress.toFixed(1)}%**`,
          inline: false,
        }
      )
      .setFooter({ text: 'AVA Agency • Espace Chatter' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ── Prise de Shift (Pointage) ──
  if (id === 'chatter_btn_clock_in') {
    const chatter = await resolveChatter(interaction);
    if (!chatter) return showIdentitySelector(interaction, 'clock_in');

    const res = clockInChatter(chatter.id, interaction.user.id);
    if (res.alreadyActive) {
      return interaction.reply({
        content: `ℹ️ Tu es déjà pointé en **Shift Actif** depuis ${res.shift.started_at} !`,
        ephemeral: true,
      });
    }

    await postShiftStartNotification(client, res).catch(() => {});
    setupChatterAdminChannel(client).catch(() => {});

    return interaction.reply({
      content: `🟢 **Prise de shift enregistrée avec succès !**\n` +
        `• Shift : **${chatter.shift}** (Compte : ${chatter.assigned_account})\n` +
        (res.isLate ? `⚠️ **Attention :** Tu as été noté avec **${res.lateMinutes} minutes de retard**.` : `✅ Tu es pile à l'heure ! Bon shift et bonnes ventes.`),
      ephemeral: true,
    });
  }

  // ── Fin de Shift (Pointage) ──
  if (id === 'chatter_btn_clock_out') {
    const chatter = await resolveChatter(interaction);
    if (!chatter) return showIdentitySelector(interaction, 'clock_out');

    const res = clockOutChatter(chatter.id);
    await postShiftEndNotification(client, res).catch(() => {});
    setupChatterAdminChannel(client).catch(() => {});

    const hours = Math.floor(res.durationMinutes / 60);
    const mins = res.durationMinutes % 60;

    return interaction.reply({
      content: `🔴 **Fin de shift enregistrée avec succès !**\n` +
        `• Durée effectuée : **${hours}h ${String(mins).padStart(2, '0')}min**\n` +
        `• Ventes déclarées pendant le shift : **$${res.salesDuringShift.toFixed(2)}** (${res.salesCount} vente(s))\n` +
        `• Commissions gagnées : **+$${res.commDuringShift.toFixed(2)}**\n\n` +
        `Repose-toi bien !`,
      ephemeral: true,
    });
  }

  // ── Prise / Fin de Shift alternative (Bouton dans #💰revenu) ──
  if (id === 'chatter_btn_toggle_shift') {
    const chatter = await resolveChatter(interaction);
    if (!chatter) return showIdentitySelector(interaction, 'toggle_shift');

    if (chatter.status.toLowerCase() === 'actif') {
      const res = clockOutChatter(chatter.id);
      await postShiftEndNotification(client, res).catch(() => {});
      setupChatterAdminChannel(client).catch(() => {});

      const hours = Math.floor(res.durationMinutes / 60);
      const mins = res.durationMinutes % 60;
      return interaction.reply({
        content: `🔴 **Fin de shift enregistrée !**\nDurée : **${hours}h ${String(mins).padStart(2, '0')}min** · Ventes : **$${res.salesDuringShift.toFixed(2)}** (+${res.commDuringShift.toFixed(2)}$ comm.)`,
        ephemeral: true,
      });
    } else {
      const res = clockInChatter(chatter.id, interaction.user.id);
      await postShiftStartNotification(client, res).catch(() => {});
      setupChatterAdminChannel(client).catch(() => {});

      return interaction.reply({
        content: `🟢 **Prise de shift enregistrée !**\n${res.isLate ? `⚠️ Retard constaté de ${res.lateMinutes} min.` : '✅ À l\'heure.'}`,
        ephemeral: true,
      });
    }
  }

  // ── Salons Fondateurs (Administration, Ajout, Payout) ──
  if (id === 'chatter_admin_add_btn') {
    const modal = new ModalBuilder()
      .setCustomId(`chatter_modal_add_v3_${Date.now()}`)
      .setTitle('➕ Ajouter un nouveau Chatter');

    const nameInput = new TextInputBuilder()
      .setCustomId('name')
      .setLabel('1. Prénom / Nom du Chatter *')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('ex: light, JoJo, Lucas...')
      .setRequired(true);

    const shiftInput = new TextInputBuilder()
      .setCustomId('shift')
      .setLabel('2. Shift / Horaires')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('ex: Nuit (02h-10h), Soir (20h-02h), Matin (08h-14h)')
      .setRequired(false);

    const rateInput = new TextInputBuilder()
      .setCustomId('rate')
      .setLabel('3. Commission % (défaut : 10)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('10 (laisser vide pour 10%)')
      .setRequired(false);

    const initialSalesInput = new TextInputBuilder()
      .setCustomId('initial_sales')
      .setLabel('4. Ventes déjà réalisées en $ (Facultatif)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('ex: 259.00 (laisser vide si 0)')
      .setRequired(false);

    const accountInput = new TextInputBuilder()
      .setCustomId('account')
      .setLabel('5. Compte OnlyFans assigné')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Kim (laisser vide pour Kim)')
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(shiftInput),
      new ActionRowBuilder().addComponents(rateInput),
      new ActionRowBuilder().addComponents(initialSalesInput),
      new ActionRowBuilder().addComponents(accountInput)
    );

    return interaction.showModal(modal);
  }

  if (id === 'chatter_admin_toggle_btn') {
    const chatters = getAllChatters();
    if (chatters.length === 0) {
      return interaction.reply({ content: '❌ Aucun chatter configuré.', ephemeral: true });
    }

    const options = chatters.map(c => {
      const statusLabel = c.status.toLowerCase() === 'actif' ? '🟢 Actif' : '⚪ Repos';
      return {
        label: `${c.name} — Actuellement ${statusLabel}`,
        description: `Shift: ${c.shift} · Compte: ${c.assigned_account}`,
        value: c.id.toString(),
      };
    });

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('chatter_select_toggle_status')
        .setPlaceholder('Sélectionne un chatter pour basculer son statut...')
        .addOptions(options.slice(0, 25))
    );

    return interaction.reply({
      content: '⚡ **Bascule Rapide de Shift (Actif / Repos) :**',
      components: [row],
      ephemeral: true,
    });
  }

  if (id === 'chatter_admin_edit_btn') {
    const chatters = getAllChatters();
    if (chatters.length === 0) {
      return interaction.reply({ content: '❌ Aucun chatter configuré.', ephemeral: true });
    }

    const options = chatters.map(c => ({
      label: c.name,
      description: `${c.commission_rate}% · ${c.shift}`,
      value: c.id.toString(),
    }));

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('chatter_select_edit_pick')
        .setPlaceholder('Sélectionne un chatter à modifier...')
        .addOptions(options.slice(0, 25))
    );

    return interaction.reply({
      content: '✏️ **Modifier les paramètres d\'un chatter :**',
      components: [row],
      ephemeral: true,
    });
  }

  if (id.startsWith('chatter_admin_open_edit_')) {
    const chatterId = parseInt(id.replace('chatter_admin_open_edit_', ''), 10);
    const chatter = getChatterById(chatterId);
    if (!chatter) return interaction.reply({ content: '❌ Chatter introuvable.', ephemeral: true });

    const modal = new ModalBuilder()
      .setCustomId(`chatter_modal_edit_${chatter.id}`)
      .setTitle(`✏️ Modifier ${chatter.name}`);

    const shiftInput = new TextInputBuilder()
      .setCustomId('shift')
      .setLabel('Shift / Horaires')
      .setStyle(TextInputStyle.Short)
      .setValue(chatter.shift || 'Matin (08h-14h)')
      .setRequired(true);

    const rateInput = new TextInputBuilder()
      .setCustomId('rate')
      .setLabel('Taux de commission (%)')
      .setStyle(TextInputStyle.Short)
      .setValue(chatter.commission_rate.toString())
      .setRequired(true);

    const targetInput = new TextInputBuilder()
      .setCustomId('target')
      .setLabel('Objectif de ventes ($)')
      .setStyle(TextInputStyle.Short)
      .setValue((chatter.sales_target || 500).toString())
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(shiftInput),
      new ActionRowBuilder().addComponents(rateInput),
      new ActionRowBuilder().addComponents(targetInput)
    );

    return interaction.showModal(modal);
  }

  if (id === 'chatter_admin_dashboard_btn') {
    await setupChatterAdminChannel(client);
    const dash = getGlobalDashboardData();

    return interaction.reply({
      content: `📊 **Tableau de bord actualisé avec succès !**\n\n` +
        `• Total Ventes en cours : **$${dash.grandTotalSales.toFixed(2)}**\n` +
        `• Total Commissions dues : **$${dash.grandTotalCommission.toFixed(2)}**\n` +
        `• Chatters en Shift Actif : **${dash.activeShiftCount} / ${dash.totalChatters}**`,
      ephemeral: true,
    });
  }

  if (id === 'chatter_admin_payout_btn') {
    const dash = getGlobalDashboardData();
    if (dash.grandTotalCommission <= 0) {
      return interaction.reply({
        content: 'ℹ️ **Aucune commission en attente de paiement.** Les compteurs sont déjà à zéro pour le cycle en cours.',
        ephemeral: true,
      });
    }

    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('chatter_admin_confirm_payout').setLabel('✅ Confirmer le règlement et Reset à 0').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('chatter_admin_cancel_payout').setLabel('❌ Annuler').setStyle(ButtonStyle.Secondary)
    );

    return interaction.reply({
      content: `⚠️ **VALIDATION DE LA PAIE DES 2 SEMAINES**\n\n` +
        `Vous êtes sur le point de clôturer le cycle de paie bimensuel pour l'ensemble des chatters :\n\n` +
        `💵 **Total Ventes réalisées :** \`$${dash.grandTotalSales.toFixed(2)}\`\n` +
        `💎 **Total Commissions à payer :** \`$${dash.grandTotalCommission.toFixed(2)}\`\n\n` +
        `> **Attention :** En confirmant, l'historique complet sera archivé et le compteur de commissions de chaque chatter sera **remis à zéro** pour entamer les 2 prochaines semaines.\n\n` +
        `Confirmez-vous le paiement ?`,
      components: [confirmRow],
      ephemeral: true,
    });
  }

  if (id === 'chatter_admin_confirm_payout') {
    await interaction.deferUpdate();
    const paidList = processAllChatterPayouts(interaction.user.tag);

    // Mettre à jour le panneau d'administration
    await setupChatterAdminChannel(client).catch(() => {});

    // Poster une annonce officielle dans le salon des fondateurs
    const channelId = process.env.CHANNEL_CHATTER_FOUNDER_SALES || '1565370727740342282';
    const founderChannel = await client.channels.fetch(channelId).catch(() => null);

    let summaryText = '';
    let totalPaid = 0;
    for (const p of paidList) {
      totalPaid += p.amount;
      summaryText += `• **${p.chatterName}** : **\$${p.amount.toFixed(2)}** (${p.salesCount} ventes — total: \$${p.totalSales.toFixed(2)})\n`;
    }

    if (founderChannel) {
      const payoutEmbed = new EmbedBuilder()
        .setColor(0x00ff88)
        .setTitle('💳 CLÔTURE DE PAIE BIMENSUELLE (2 SEMAINES) VALIDÉE')
        .setDescription(
          `Les règlements de commissions pour le cycle de 2 semaines ont été validés par **${interaction.user.tag}**.\n` +
          `Les compteurs de commissions de tous les chatters ont été remis à zéro pour le nouveau cycle.\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `💰 **Total Distribué :** \`$${totalPaid.toFixed(2)}\`\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `**Détail des virements effectués :**\n${summaryText || 'Aucun montant dû.'}`
        )
        .setFooter({ text: 'AVA Agency • Payouts Automatiques' })
        .setTimestamp();

      await founderChannel.send({ embeds: [payoutEmbed] }).catch(() => {});
    }

    return interaction.editReply({
      content: `✅ **Paiements validés avec succès !**\nTotal de **$${totalPaid.toFixed(2)}** validé pour ${paidList.length} chatter(s).\nLes compteurs sont repartis à zéro pour les 2 prochaines semaines.`,
      components: [],
    });
  }

  if (id === 'chatter_admin_cancel_payout') {
    return interaction.update({
      content: '❌ Validation de la paie annulée.',
      components: [],
    });
  }

  // ── Suppression d'un Chatter ──
  if (id === 'chatter_admin_delete_btn') {
    const chatters = getAllChatters();
    if (chatters.length === 0) {
      return interaction.reply({ content: '❌ Aucun chatter à supprimer.', ephemeral: true });
    }

    const options = chatters.map(c => ({
      label: `${c.name} (${c.assigned_account})`,
      description: `Shift: ${c.shift} · Taux: ${c.commission_rate}% · Statut: ${c.status}`,
      value: c.id.toString(),
    }));

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('chatter_select_delete_pick')
        .setPlaceholder('Sélectionne le chatter à supprimer...')
        .addOptions(options.slice(0, 25))
    );

    return interaction.reply({
      content: '🗑️ **Suppression d\'un Chatter :**\nChoisissez le profil à retirer de l\'équipe :',
      components: [row],
      ephemeral: true,
    });
  }

  if (id.startsWith('chatter_admin_confirm_delete_')) {
    const chatterId = parseInt(id.replace('chatter_admin_confirm_delete_', ''), 10);
    const chatter = getChatterById(chatterId);
    if (!chatter) return interaction.update({ content: '❌ Chatter introuvable ou déjà supprimé.', components: [] });

    deleteChatter(chatterId);
    await setupChatterAdminChannel(client).catch(() => {});

    return interaction.update({
      content: `✅ Le profil du chatter **${chatter.name}** a été supprimé avec succès.\nLe tableau de bord a été actualisé.`,
      components: [],
    });
  }

  if (id === 'chatter_admin_cancel_delete') {
    return interaction.update({
      content: '❌ Suppression annulée.',
      components: [],
    });
  }
}

// ─── 2. Gestion des Menus Déroulants (Select Menus) ───────────────────────────
async function handleChatterSelect(interaction, client) {
  const id = interaction.customId;

  // ─── Identification initiale (sans action en attente) ────────────────────
  if (id === 'chatter_select_identity') {
    const chatterId = parseInt(interaction.values[0], 10);
    const chatter = getChatterById(chatterId);
    if (!chatter) return interaction.reply({ content: '❌ Chatter introuvable.', ephemeral: true });

    linkChatterDiscord(chatter.id, interaction.user.id);

    return interaction.update({
      content: `✅ **Compte lié avec succès !** Tu es maintenant enregistré comme **${chatter.name}**.\n\n` +
        `🔓 Toutes tes actions (prise de shift, déclaration de vente, stats) sont maintenant débloquées !\n` +
        `Tu n'auras plus besoin de sélectionner ton nom à l'avenir.`,
      components: [],
    });
  }

  // ─── Identification avec action en attente (clock_in, clock_out, etc.) ───
  if (id.startsWith('chatter_select_identity_then_')) {
    const pendingAction = id.replace('chatter_select_identity_then_', '');
    const chatterId = parseInt(interaction.values[0], 10);
    const chatter = getChatterById(chatterId);
    if (!chatter) return interaction.reply({ content: '❌ Chatter introuvable.', ephemeral: true });

    // Lier le Discord ID pour la prochaine fois
    linkChatterDiscord(chatter.id, interaction.user.id);

    // Exécuter directement l'action demandée sans que le chatter ait à recliquer
    if (pendingAction === 'clock_in') {
      const res = clockInChatter(chatter.id, interaction.user.id);
      if (res.alreadyActive) {
        return interaction.update({
          content: `✅ Compte lié à **${chatter.name}** !\nℹ️ Tu es déjà en **Shift Actif** depuis ${res.shift.started_at}.`,
          components: [],
        });
      }
      await postShiftStartNotification(client, res).catch(() => {});
      setupChatterAdminChannel(client).catch(() => {});
      return interaction.update({
        content: `✅ Compte lié à **${chatter.name}** ! 🟢 **Prise de shift enregistrée !**\n` +
          `• Shift : **${chatter.shift}**\n` +
          (res.isLate ? `⚠️ Retard de **${res.lateMinutes} minutes** noté.` : `✅ À l'heure ! Bon shift et bonnes ventes !`),
        components: [],
      });
    }

    if (pendingAction === 'clock_out') {
      const res = clockOutChatter(chatter.id);
      await postShiftEndNotification(client, res).catch(() => {});
      setupChatterAdminChannel(client).catch(() => {});
      const hours = Math.floor(res.durationMinutes / 60);
      const mins = res.durationMinutes % 60;
      return interaction.update({
        content: `✅ Compte lié à **${chatter.name}** ! 🔴 **Fin de shift enregistrée !**\n` +
          `• Durée : **${hours}h ${String(mins).padStart(2, '0')}min**\n` +
          `• Ventes : **$${res.salesDuringShift.toFixed(2)}** · Commissions : **+$${res.commDuringShift.toFixed(2)}**`,
        components: [],
      });
    }

    if (pendingAction === 'toggle_shift') {
      if (chatter.status && chatter.status.toLowerCase() === 'actif') {
        const res = clockOutChatter(chatter.id);
        await postShiftEndNotification(client, res).catch(() => {});
        setupChatterAdminChannel(client).catch(() => {});
        const hours = Math.floor(res.durationMinutes / 60);
        const mins = res.durationMinutes % 60;
        return interaction.update({
          content: `✅ Compte lié à **${chatter.name}** ! 🔴 **Fin de shift** : ${hours}h ${String(mins).padStart(2, '0')}min · $${res.salesDuringShift.toFixed(2)} de ventes.`,
          components: [],
        });
      } else {
        const res = clockInChatter(chatter.id, interaction.user.id);
        await postShiftStartNotification(client, res).catch(() => {});
        setupChatterAdminChannel(client).catch(() => {});
        return interaction.update({
          content: `✅ Compte lié à **${chatter.name}** ! 🟢 **Prise de shift** enregistrée !\n` +
            (res.isLate ? `⚠️ Retard de **${res.lateMinutes} min** noté.` : `✅ À l'heure !`),
          components: [],
        });
      }
    }

    if (pendingAction === 'declare_sale') {
      // Ouvrir directement le formulaire de vente
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder: AR } = require('discord.js');
      const modal = new ModalBuilder()
        .setCustomId(`chatter_modal_sale_${chatter.id}`)
        .setTitle(`💰 Déclarer une vente — ${chatter.name}`);
      const subInput = new TextInputBuilder().setCustomId('sub_name').setLabel('Pseudo du Sub / Fan').setStyle(TextInputStyle.Short).setPlaceholder('ex: Kevin92, Alex_fan').setRequired(true);
      const amountInput = new TextInputBuilder().setCustomId('amount').setLabel('Montant de la vente ($)').setStyle(TextInputStyle.Short).setPlaceholder('ex: 25.00').setRequired(true);
      const ppvInput = new TextInputBuilder().setCustomId('ppv_name').setLabel('Nom du PPV / Média vendu').setStyle(TextInputStyle.Short).setPlaceholder('ex: Pack Douche Vidéo #2, Tip').setRequired(true);
      modal.addComponents(
        new AR().addComponents(subInput),
        new AR().addComponents(amountInput),
        new AR().addComponents(ppvInput)
      );
      return interaction.showModal(modal);
    }

    if (pendingAction === 'my_stats') {
      const stats = getChatterStats(chatter.id);
      const progressBar = renderProgressBar(stats.progress, 10);
      const statusEmoji = chatter.status && chatter.status.toLowerCase() === 'actif' ? '🟢 Actif (En shift)' : '⚪ Repos (Hors ligne)';
      const embed = new EmbedBuilder()
        .setColor(0x00ff88)
        .setTitle(`📊 Performances — ${chatter.name}`)
        .addFields(
          { name: 'Compte & Shift', value: `Compte: **${chatter.assigned_account}**\nShift: *${chatter.shift}*`, inline: true },
          { name: 'Statut', value: statusEmoji, inline: true },
          { name: 'Commission %', value: `**${chatter.commission_rate}%**`, inline: true },
          { name: 'Ventes en Attente', value: `**$${stats.pendingTotalSales.toFixed(2)}** (${stats.pendingSalesCount} ventes)`, inline: true },
          { name: 'Commissions Dues (2 sem.)', value: `**$${stats.pendingTotalCommission.toFixed(2)}**`, inline: true },
          { name: 'Historique Payé', value: `**$${stats.historicalTotalPaid.toFixed(2)}**`, inline: true },
          { name: `Progression Objectif ($${stats.target.toFixed(2)})`, value: `${progressBar} **${stats.progress.toFixed(1)}%**`, inline: false }
        )
        .setFooter({ text: 'AVA Agency • Compte lié automatiquement ✅' })
        .setTimestamp();
      return interaction.update({ content: `✅ Compte lié à **${chatter.name}** !`, embeds: [embed], components: [] });
    }

    // Fallback générique
    return interaction.update({
      content: `✅ **Compte lié avec succès à ${chatter.name} !**\n🔓 Toutes tes actions sont débloquées. Tu peux maintenant cliquer sur le bouton souhaité.`,
      components: [],
    });
  }

  if (id === 'chatter_select_toggle_status') {
    const chatterId = parseInt(interaction.values[0], 10);
    const chatter = getChatterById(chatterId);
    if (!chatter) return interaction.reply({ content: '❌ Chatter introuvable.', ephemeral: true });

    const newStatus = chatter.status.toLowerCase() === 'actif' ? 'Repos' : 'Actif';
    updateChatterStatus(chatter.id, newStatus);

    await setupChatterAdminChannel(client).catch(() => {});

    return interaction.update({
      content: `✅ Le statut de **${chatter.name}** a été passé en **${newStatus === 'Actif' ? '🟢 Actif' : '⚪ Repos'}** !`,
      components: [],
    });
  }

  if (id === 'chatter_select_edit_pick') {
    const chatterId = parseInt(interaction.values[0], 10);
    const chatter = getChatterById(chatterId);
    if (!chatter) return interaction.reply({ content: '❌ Chatter introuvable.', ephemeral: true });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`chatter_admin_open_edit_${chatter.id}`)
        .setLabel(`✏️ Ouvrir le formulaire pour ${chatter.name}`)
        .setStyle(ButtonStyle.Primary)
    );

    return interaction.update({
      content: `Modifier les paramètres de **${chatter.name}** (Actuellement : ${chatter.shift}, ${chatter.commission_rate}%) :`,
      components: [row],
    });
  }

  if (id === 'chatter_select_delete_pick') {
    const chatterId = parseInt(interaction.values[0], 10);
    const chatter = getChatterById(chatterId);
    if (!chatter) return interaction.reply({ content: '❌ Chatter introuvable.', ephemeral: true });

    const stats = getChatterStats(chatter.id);
    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`chatter_admin_confirm_delete_${chatter.id}`)
        .setLabel(`🗑️ Supprimer définitivement ${chatter.name}`)
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('chatter_admin_cancel_delete')
        .setLabel('❌ Annuler')
        .setStyle(ButtonStyle.Secondary)
    );

    return interaction.update({
      content: `⚠️ **CONFIRMATION DE SUPPRESSION**\n\n` +
        `Êtes-vous certain de vouloir supprimer le chatter **${chatter.name}** ?\n` +
        `• Compte : **${chatter.assigned_account}**\n` +
        `• Shift : **${chatter.shift}**\n` +
        `• Taux : **${chatter.commission_rate}%**\n` +
        `• Ventes en cours : **$${stats ? stats.pendingTotalSales.toFixed(2) : '0.00'}** ($${stats ? stats.pendingTotalCommission.toFixed(2) : '0.00'} dues)\n\n` +
        `> ⚠️ *Cette action est irréversible et retirera le chatter de la liste active et des tableaux de bord.*`,
      components: [confirmRow],
    });
  }
}

// ─── 3. Gestion des Modals ───────────────────────────────────────────────────
async function handleChatterModal(interaction, client) {
  const id = interaction.customId;

  // Déclaration d'une vente par un chatter
  if (id.startsWith('chatter_modal_sale_')) {
    const chatterId = parseInt(id.replace('chatter_modal_sale_', ''), 10);
    const chatter = getChatterById(chatterId);
    if (!chatter) return interaction.reply({ content: '❌ Chatter introuvable.', ephemeral: true });

    const subName = interaction.fields.getTextInputValue('sub_name');
    const amountStr = interaction.fields.getTextInputValue('amount').replace(',', '.');
    const ppvName = interaction.fields.getTextInputValue('ppv_name');

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      return interaction.reply({
        content: '❌ **Montant invalide.** Veuillez entrer un nombre positif supérieur à zéro (ex: 25 ou 15.50).',
        ephemeral: true,
      });
    }

    // Enregistrer la vente dans la base de données
    const saleResult = recordSale({
      chatterId: chatter.id,
      subName,
      ppvName,
      amount,
      discordUserId: interaction.user.id,
    });

    // Pousser la notification dans le salon des fondateurs (#revenue-des-chatteur)
    await postSaleNotification(client, saleResult).catch(err => {
      console.error('Erreur postSaleNotification:', err);
    });

    // Actualiser le tableau de bord du salon admin (#ajoute-de-chatter)
    setupChatterAdminChannel(client).catch(() => {});

    // Récupérer les stats mises à jour du chatter
    const stats = getChatterStats(chatter.id);

    return interaction.reply({
      content: `🎉 **Vente enregistrée avec succès !**\n\n` +
        `👤 **Sub :** \`${subName}\`\n` +
        `🎬 **PPV / Média :** \`${ppvName}\`\n` +
        `💵 **Montant Vente :** \`$${amount.toFixed(2)}\`\n` +
        `💎 **Ta commission gagnée :** \`+$${saleResult.commissionEarned.toFixed(2)}\` (${saleResult.commissionRate}%)\n\n` +
        `📈 **Ton total cumulé en attente (Cycle 2 sem.) :** \`$${stats.pendingTotalCommission.toFixed(2)}\` (sur $${stats.pendingTotalSales.toFixed(2)} de ventes totales)\n\n` +
        `*Cette vente a été automatiquement transmise aux fondateurs.*`,
      ephemeral: true,
    });
  }

  // Ajout d'un nouveau chatter par un fondateur
  if (id.startsWith('chatter_modal_add')) {
    const name = interaction.fields.getTextInputValue('name').trim();
    const rateStr = interaction.fields.getTextInputValue('rate')?.replace(',', '.') || '10';
    const shift = interaction.fields.getTextInputValue('shift') || 'Matin (08h-14h)';
    const initialSalesStr = interaction.fields.getTextInputValue('initial_sales')?.replace(',', '.')?.trim() || '0';
    const account = interaction.fields.getTextInputValue('account') || 'Kim';

    const rate = parseFloat(rateStr) || 10.0;
    const initialSales = parseFloat(initialSalesStr) || 0.0;

    try {
      const newChatter = addChatter({
        name,
        assignedAccount: account,
        shift,
        commissionRate: rate,
        salesTarget: 500.0,
        status: 'Actif',
      });

      // Si le fondateur a saisi un montant de ventes antérieures déjà réalisées
      if (initialSales > 0) {
        recordSale({
          chatterId: newChatter.id,
          subName: 'Solde / Ventes Antérieures',
          ppvName: 'Report Initial',
          amount: initialSales,
          discordUserId: null,
        });
      }

      // Mettre à jour le panneau d'administration
      await setupChatterAdminChannel(client).catch(() => {});

      const stats = getChatterStats(newChatter.id);

      return interaction.reply({
        content: `✅ **Chatter ajouté avec succès !**\n\n` +
          `• Nom : **${newChatter.name}**\n` +
          `• Compte : **${newChatter.assigned_account}**\n` +
          `• Shift : **${newChatter.shift}**\n` +
          `• Commission : **${newChatter.commission_rate}%**\n` +
          (initialSales > 0
            ? `• 💵 **Ventes Déjà Réalisées :** \`$${initialSales.toFixed(2)}\` (Commissions dues : \`+$${stats.pendingTotalCommission.toFixed(2)}\`)\n`
            : `• 💵 **Ventes Initiales :** \`$0.00\` (Nouveau départ)\n`) +
          `\nLe chatter peut désormais pointer dans <#${process.env.CHANNEL_CHATTER_SHIFT_CHATTER || '1553741516462362794'}> et déclarer ses ventes dans <#${process.env.CHANNEL_CHATTER_REVENU || '1524736963477901415'}>.`,
        ephemeral: true,
      });
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE')) {
        return interaction.reply({ content: `❌ Un chatter nommé **${name}** existe déjà.`, ephemeral: true });
      }
      return interaction.reply({ content: `❌ Erreur lors de l'ajout : ${err.message}`, ephemeral: true });
    }
  }

  // Modification d'un chatter par un fondateur
  if (id.startsWith('chatter_modal_edit_')) {
    const chatterId = parseInt(id.replace('chatter_modal_edit_', ''), 10);
    const chatter = getChatterById(chatterId);
    if (!chatter) return interaction.reply({ content: '❌ Chatter introuvable.', ephemeral: true });

    const shift = interaction.fields.getTextInputValue('shift');
    const rateStr = interaction.fields.getTextInputValue('rate').replace(',', '.');
    const targetStr = interaction.fields.getTextInputValue('target').replace(',', '.');

    const rate = parseFloat(rateStr) || chatter.commission_rate;
    const target = parseFloat(targetStr) || chatter.sales_target;

    updateChatterShift(chatter.id, shift);
    updateChatterCommission(chatter.id, rate);

    const { db } = require('../database/db');
    db.prepare('UPDATE chatters SET sales_target = ? WHERE id = ?').run(target, chatter.id);

    await setupChatterAdminChannel(client).catch(() => {});

    return interaction.reply({
      content: `✅ Profil de **${chatter.name}** mis à jour avec succès !\n• Shift : **${shift}**\n• Taux : **${rate}%**\n• Objectif : **$${target.toFixed(2)}**`,
      ephemeral: true,
    });
  }
}

module.exports = {
  handleChatterButton,
  handleChatterSelect,
  handleChatterModal,
};

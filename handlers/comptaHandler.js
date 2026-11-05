/**
 * handlers/comptaHandler.js
 * Gestionnaire des interactions (Boutons, Modals, Menus) pour la Comptabilité & Bilan Financier
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
  addExpense,
  deleteExpense,
  addRevenue,
  getRecentExpenses,
  getMonthlyComptaData,
  setupComptaChannel,
} = require('../services/comptaService');

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
async function handleComptaButton(interaction, client) {
  const id = interaction.customId;

  if (!isAuthorized(interaction)) {
    return interaction.reply({
      content: '❌ **Accès réservé** : Seuls les fondateurs et administrateurs ont accès à la comptabilité de l\'agence.',
      ephemeral: true,
    });
  }

  // ── Bouton Ajouter une Dépense ──
  if (id === 'compta_btn_add_expense') {
    const modal = new ModalBuilder()
      .setCustomId(`compta_modal_expense_${Date.now()}`)
      .setTitle('➕ Enregistrer une Dépense');

    const catInput = new TextInputBuilder()
      .setCustomId('category')
      .setLabel('1. Catégorie (Telegram, Modèle, Ads...) *')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Telegram, Modèle, Managers, Numéros, Mails, Twitter, Ads, Autre')
      .setRequired(true);

    const amountInput = new TextInputBuilder()
      .setCustomId('amount')
      .setLabel('2. Montant en $ (USD) *')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('ex: 50.00 ou 120')
      .setRequired(true);

    const descInput = new TextInputBuilder()
      .setCustomId('description')
      .setLabel('3. Description / Détails *')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('ex: Salaire Modèle, Salaire Managers, 40 numéros, Campagne Ads...')
      .setRequired(true);

    const dateInput = new TextInputBuilder()
      .setCustomId('date')
      .setLabel('4. Date AAAA-MM-JJ (optionnel)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('ex: 2026-10-31 (Laisser vide = Aujourd\'hui)')
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(catInput),
      new ActionRowBuilder().addComponents(amountInput),
      new ActionRowBuilder().addComponents(descInput),
      new ActionRowBuilder().addComponents(dateInput)
    );

    return interaction.showModal(modal);
  }

  // ── Bouton Déclarer un Revenu / CA ──
  if (id === 'compta_btn_add_revenue') {
    const modal = new ModalBuilder()
      .setCustomId(`compta_modal_revenue_${Date.now()}`)
      .setTitle('💵 Enregistrer une Entrée CA / Revenu');

    const sourceInput = new TextInputBuilder()
      .setCustomId('source')
      .setLabel('1. Source (OnlyFans, Fansly, Autre) *')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('ex: OnlyFans, Fansly, MYM, Virement...')
      .setRequired(true);

    const amountInput = new TextInputBuilder()
      .setCustomId('amount')
      .setLabel('2. Montant brut en $ (USD) *')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('ex: 1500.00')
      .setRequired(true);

    const descInput = new TextInputBuilder()
      .setCustomId('description')
      .setLabel('3. Description / Période *')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('ex: Abonnements OnlyFans fin de mois, Tips...')
      .setRequired(true);

    const dateInput = new TextInputBuilder()
      .setCustomId('date')
      .setLabel('4. Date AAAA-MM-JJ (optionnel)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('ex: 2026-10-31 (Laisser vide = Aujourd\'hui)')
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(sourceInput),
      new ActionRowBuilder().addComponents(amountInput),
      new ActionRowBuilder().addComponents(descInput),
      new ActionRowBuilder().addComponents(dateInput)
    );

    return interaction.showModal(modal);
  }

  // ── Bouton Historique des Dépenses ──
  if (id === 'compta_btn_history') {
    const expenses = getRecentExpenses(15);
    if (!expenses || expenses.length === 0) {
      return interaction.reply({
        content: 'ℹ️ **Aucune dépense opérationnelle** n\'a encore été enregistrée ce mois-ci.',
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('📜 HISTORIQUE DES 15 DERNIÈRES DÉPENSES')
      .setDescription(
        expenses.map(e => {
          return `**#${e.id}** [${e.category}] • **\$${e.amount.toFixed(2)}**\n` +
                 `└ 📝 *${e.description || 'Sans description'}*\n` +
                 `└ 📅 ${e.date} · 👤 Par : <@${e.created_by_id}>`;
        }).join('\n\n')
      )
      .setFooter({ text: 'Pour supprimer une dépense erronée, sélectionnez-la ci-dessous.' })
      .setTimestamp();

    const options = expenses.slice(0, 25).map(e => ({
      label: `#${e.id} — ${e.category} ($${e.amount.toFixed(2)})`,
      description: `${e.date} : ${e.description ? e.description.slice(0, 50) : 'Sans détails'}`,
      value: e.id.toString(),
    }));

    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('compta_select_delete_expense')
        .setPlaceholder('🗑️ Supprimer une dépense en cas d\'erreur...')
        .addOptions(options)
    );

    return interaction.reply({
      embeds: [embed],
      components: [selectRow],
      ephemeral: true,
    });
  }

  // ── Bouton Basculer Octobre ──
  if (id === 'compta_btn_switch_october') {
    await interaction.deferReply({ ephemeral: true });
    await setupComptaChannel(client, '2026-10');
    return interaction.editReply({
      content: '✅ **Affichage mis à jour : Bilan Clôture Octobre 2026 (Paiements de Demain).**',
    });
  }

  // ── Bouton Basculer Novembre ──
  if (id === 'compta_btn_switch_november') {
    await interaction.deferReply({ ephemeral: true });
    await setupComptaChannel(client, '2026-11');
    return interaction.editReply({
      content: '✅ **Affichage mis à jour : Période en cours (Novembre 2026).**',
    });
  }

  // ── Bouton Rapport Détaillé ──
  if (id === 'compta_btn_details') {
    const isOctober = interaction.message?.embeds?.[0]?.title?.includes('OCTOBRE');
    const targetMonth = isOctober ? '2026-10' : null;
    const data = getMonthlyComptaData(targetMonth);

    const embed = new EmbedBuilder()
      .setColor(data.netProfit >= 0 ? 0x00ff88 : 0xed4245)
      .setTitle(`📊 BILAN & CALCUL MATHÉMATIQUE — ${data.capitalizedMonth.toUpperCase()}`)
      .setDescription(
        `Voici le détail ligne par ligne de la formule de calcul de l'agence :\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📈 **1. REVENUS BRUTS (CA TOTAL) :**\n` +
        `  • Ventes PPV / Tips Chatters : **+\$${data.chatterTotalSales.toFixed(2)}**\n` +
        `  • Autres Entrées Plateformes : **+\$${data.extraRevenues.toFixed(2)}**\n` +
        `  👉 **Sous-Total CA :** \`$${data.totalGrossRevenue.toFixed(2)}\`\n\n` +
        `📉 **2. CHARGES OPÉRATIONNELLES & ÉQUIPE :**\n` +
        `  • VAs Telegram (FR) : **-\$${data.vaCost.toFixed(2)}**` + (data.monthStr === '2026-10' ? ' *(Malachie $73 + Richid $33 + Titi $21)*\n' : ` (${data.vaEligibleSubs} subs éligibles)\n`) +
        (data.categories['VAs US / Clôture'] > 0 ? `  • VAs Clôture US : **-\$${data.categories['VAs US / Clôture'].toFixed(2)}** *(Malachie \$112 + Richi \$11)*\n` : '') +
        (data.monthStr === '2026-10' ? `  👉 **Sous-Total VAs : -\$${(data.vaCost + (data.categories['VAs US / Clôture'] || 0)).toFixed(2)}** *(conforme au rapport)*\n` : '') +
        `  • Commissions Chatters nettes : **-\$${data.chatterNetCommission.toFixed(2)}**\n` +
        `  • 👑 Salaire Modèle : **-\$${data.categories['Salaire Modèle'].toFixed(2)}**` + (data.monthStr === '2026-10' ? ' *(exceptionnel 400$)*\n' : ' *(fixe 700$)*\n') +
        `  • 👔 Salaires Managers (x2) : **-\$${data.categories['Salaires Managers'].toFixed(2)}**` + (data.monthStr === '2026-10' ? ' *(M1: 100$, M2: 80$)*\n' : ' *(2x 100$)*\n') +
        `  • Abonnement Telegram : **-\$${data.categories['Telegram Premium'].toFixed(2)}**\n` +
        `  • Ads & Publicités : **-\$${data.categories['Ads'].toFixed(2)}**\n` +
        `  • Comptes Twitter / Réseaux : **-\$${data.categories['Comptes Twitter'].toFixed(2)}**\n` +
        `  • Numéros (SMSPool) : **-\$${data.categories['Numéros'].toFixed(2)}**\n` +
        `  • Mails : **-\$${data.categories['Mails'].toFixed(2)}**\n` +
        `  • Autre : **-\$${data.categories['Autre'].toFixed(2)}**\n` +
        `  👉 **Sous-Total Charges :** \`-$${data.totalExpenses.toFixed(2)}\`\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `💎 **3. BÉNÉFICE NET DE L'AGENCE :**\n` +
        `  \`$${data.totalGrossRevenue.toFixed(2)} (CA) - $${data.totalExpenses.toFixed(2)} (Charges)\`\n` +
        `  👉 **Bénéfice Net : \`$${data.netProfit.toFixed(2)}\`**\n\n` +
        `🤝 **4. RÉPARTITION ASSOCIÉS (50% / 50%) :**\n` +
        `  • **Associé 1 (50%) :** **\`$${data.associateShare.toFixed(2)}\`**\n` +
        `  • **Associé 2 (50%) :** **\`$${data.associateShare.toFixed(2)}\`**\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
      )
      .setFooter({ text: 'AVA Agency • Transparence Financière' })
      .setTimestamp();

    return interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }

  // ── Bouton Actualiser ──
  if (id === 'compta_btn_refresh') {
    await interaction.deferReply({ ephemeral: true });
    await setupComptaChannel(client);
    return interaction.editReply({
      content: '✅ **Tableau de bord de comptabilité actualisé avec succès !**',
    });
  }
}

// ─── 2. Gestion des Menus Déroulants (Select Menus) ───────────────────────────
async function handleComptaSelect(interaction, client) {
  const id = interaction.customId;

  if (!isAuthorized(interaction)) {
    return interaction.reply({ content: '❌ Non autorisé.', ephemeral: true });
  }

  if (id === 'compta_select_delete_expense') {
    const expenseId = parseInt(interaction.values[0], 10);
    const deleted = deleteExpense(expenseId);

    if (!deleted) {
      return interaction.reply({ content: '❌ Dépense introuvable ou déjà supprimée.', ephemeral: true });
    }

    await setupComptaChannel(client).catch(() => {});

    return interaction.update({
      content: `🗑️ **Dépense #${deleted.id} supprimée avec succès !**\n` +
               `• Catégorie : \`${deleted.category}\`\n` +
               `• Montant : **\$${deleted.amount.toFixed(2)}**\n` +
               `• Date : ${deleted.date}\n\n` +
               `*Le tableau de bord comptable a été actualisé automatiquement.*`,
      embeds: [],
      components: [],
    });
  }
}

// ─── 3. Gestion des Modals ───────────────────────────────────────────────────
async function handleComptaModal(interaction, client) {
  const id = interaction.customId;

  if (!isAuthorized(interaction)) {
    return interaction.reply({ content: '❌ Non autorisé.', ephemeral: true });
  }

  // ── Soumission Ajout Dépense ──
  if (id.startsWith('compta_modal_expense_')) {
    const rawCat = interaction.fields.getTextInputValue('category').trim();
    const rawAmount = interaction.fields.getTextInputValue('amount').replace(',', '.').trim();
    const description = interaction.fields.getTextInputValue('description').trim();
    let date = null;
    try {
      const d = interaction.fields.getTextInputValue('date')?.trim();
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) date = d;
    } catch (_) {}

    const amount = parseFloat(rawAmount);
    if (isNaN(amount) || amount <= 0) {
      return interaction.reply({
        content: '❌ **Montant invalide.** Veuillez saisir un montant numérique supérieur à 0 (ex: 50 ou 25.50).',
        ephemeral: true,
      });
    }

    // Normaliser la catégorie
    const catLower = rawCat.toLowerCase();
    let category = 'Autre';
    if (catLower.includes('tg') || catLower.includes('tele') || catLower.includes('prem')) {
      category = 'Telegram Premium';
    } else if (catLower.includes('num') || catLower.includes('sim') || catLower.includes('smspool')) {
      category = 'Numéros';
    } else if (catLower.includes('mail') || catLower.includes('gmail') || catLower.includes('workspace')) {
      category = 'Mails';
    } else if (catLower.includes('twitter') || catLower.includes('compte') || catLower.includes('x') || catLower.includes('insta')) {
      category = 'Comptes Twitter';
    } else if (catLower.includes('ad') || catLower.includes('pub') || catLower.includes('tiktok') || catLower.includes('boost')) {
      category = 'Ads';
    } else if (catLower.includes('manag')) {
      category = 'Salaires Managers';
    } else if (catLower.includes('mod') || catLower.includes('kim')) {
      category = 'Salaire Modèle';
    } else if (catLower.includes('salaire')) {
      category = 'Salaire Modèle';
    }

    const saved = addExpense({
      category,
      amount,
      description,
      date,
      createdById: interaction.user.id,
      createdByName: interaction.user.username,
    });

    await setupComptaChannel(client).catch(() => {});

    return interaction.reply({
      content: `✅ **Dépense enregistrée avec succès !**\n\n` +
               `🏷️ **Catégorie :** \`${saved.category}\`\n` +
               `💵 **Montant :** \`$${saved.amount.toFixed(2)}\`\n` +
               `📝 **Détails :** *${saved.description}*\n` +
               `📅 **Date :** \`${saved.date}\`\n\n` +
               `*Le tableau de bord dans <#${process.env.CHANNEL_COMPTABILITE || '1566025049104851068'}> a été mis à jour avec les nouveaux calculs.*`,
      ephemeral: true,
    });
  }

  // ── Soumission Ajout Revenu / CA ──
  if (id.startsWith('compta_modal_revenue_')) {
    const rawSource = interaction.fields.getTextInputValue('source').trim();
    const rawAmount = interaction.fields.getTextInputValue('amount').replace(',', '.').trim();
    const description = interaction.fields.getTextInputValue('description').trim();
    let date = null;
    try {
      const d = interaction.fields.getTextInputValue('date')?.trim();
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) date = d;
    } catch (_) {}

    const amount = parseFloat(rawAmount);
    if (isNaN(amount) || amount <= 0) {
      return interaction.reply({
        content: '❌ **Montant invalide.** Veuillez saisir un montant numérique supérieur à 0.',
        ephemeral: true,
      });
    }

    const saved = addRevenue({
      source: rawSource,
      amount,
      description,
      date,
      createdById: interaction.user.id,
      createdByName: interaction.user.username,
    });

    await setupComptaChannel(client).catch(() => {});

    return interaction.reply({
      content: `✅ **Entrée de Chiffre d'Affaires enregistrée avec succès !**\n\n` +
               `🏢 **Source :** \`${saved.source}\`\n` +
               `💰 **Montant :** \`$${saved.amount.toFixed(2)}\`\n` +
               `📝 **Détails :** *${saved.description}*\n` +
               `📅 **Date :** \`${saved.date}\`\n\n` +
               `*Le chiffre d'affaires et la part des associés (50/50) ont été recalculés.*`,
      ephemeral: true,
    });
  }
}

module.exports = {
  handleComptaButton,
  handleComptaSelect,
  handleComptaModal,
};

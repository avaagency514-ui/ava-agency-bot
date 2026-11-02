/**
 * commands/chatter.js
 * Commande Slash /chatter pour piloter l'équipe, consulter les ventes, les shifts et valider les paies
 */
'use strict';

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const {
  getAllChatters,
  getChatterByName,
  getChatterByDiscordId,
  addChatter,
  deleteChatter,
  recordSale,
  updateChatterStatus,
  getChatterStats,
  getGlobalDashboardData,
  processAllChatterPayouts,
  setupChatterAdminChannel,
  renderProgressBar,
  sendDailyChatterSalesReport,
  recordChatterStrike,
  recordChatterAbsence,
} = require('../services/chatterService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('chatter')
    .setDescription('Supervision, statistiques et paies des Chatters')
    .addSubcommand(sub =>
      sub
        .setName('dashboard')
        .setDescription('Afficher le tableau de bord complet des ventes et commissions')
    )
    .addSubcommand(sub =>
      sub
        .setName('stats')
        .setDescription('Consulter les performances d\'un chatter spécifique')
        .addStringOption(opt =>
          opt
            .setName('nom')
            .setDescription('Prénom du chatter (laisser vide pour vos propres stats)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Ajouter un nouveau chatter dans l\'équipe (Fondateur)')
        .addStringOption(opt =>
          opt.setName('nom').setDescription('Prénom / Nom du chatter').setRequired(true)
        )
        .addNumberOption(opt =>
          opt.setName('pourcentage').setDescription('Taux de commission (ex: 10 pour 10%)').setRequired(false)
        )
        .addNumberOption(opt =>
          opt.setName('ventes_initiales').setDescription('Ventes déjà réalisées en $ (facultatif)').setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('compte').setDescription('Compte OnlyFans assigné (défaut: Kim)').setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('shift').setDescription('Créneau horaire (ex: Matin, Soir, Nuit)').setRequired(false)
        )
        .addNumberOption(opt =>
          opt.setName('objectif').setDescription('Objectif de ventes en $ (défaut: 500)').setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('shift')
        .setDescription('Changer le statut de shift d\'un chatter (Fondateur)')
        .addStringOption(opt =>
          opt.setName('nom').setDescription('Prénom du chatter').setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('statut')
            .setDescription('Actif (en ligne) ou Repos')
            .setRequired(true)
            .addChoices(
              { name: '🟢 Actif (En shift)', value: 'Actif' },
              { name: '⚪ Repos (Hors shift)', value: 'Repos' }
            )
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('payer')
        .setDescription('Clôturer le cycle de 2 semaines : valide les paies et remet le compteur à 0 (Fondateur)')
        .addBooleanOption(opt =>
          opt
            .setName('confirmer')
            .setDescription('Confirmez-vous le virement et la remise à 0 ?')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('rapport')
        .setDescription('Générer et envoyer immédiatement le rapport quotidien dans le salon dédié')
        .addStringOption(opt =>
          opt
            .setName('date')
            .setDescription('Date YYYY-MM-DD (optionnel, défaut: aujourd\'hui)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('delete')
        .setDescription('Supprimer définitivement un chatter de l\'équipe (Fondateur)')
        .addStringOption(opt =>
          opt.setName('nom').setDescription('Prénom du chatter à supprimer').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('strike')
        .setDescription('Ajouter un avertissement disciplinaire à un chatter (Fondateur)')
        .addStringOption(opt => opt.setName('nom').setDescription('Prénom du chatter').setRequired(true))
        .addStringOption(opt => opt.setName('motif').setDescription('Motif de l\'avertissement').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('excuse')
        .setDescription('Enregistrer une excuse pour un chatter (évite le renvoi des 5 jours) (Fondateur)')
        .addStringOption(opt => opt.setName('nom').setDescription('Prénom du chatter').setRequired(true))
        .addStringOption(opt => opt.setName('motif').setDescription('Motif de l\'absence justifiée').setRequired(true))
    ),

  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();

    // ── 1. Subcommand: /chatter dashboard ─────────────────────────────────────
    if (subcommand === 'dashboard') {
      await interaction.deferReply({ ephemeral: false });
      const dash = getGlobalDashboardData();

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('📊 TABLEAU DE BORD CHATTERS — CYCLE EN COURS (2 SEM.)')
        .setDescription(
          `👥 **Total Chatters :** \`${dash.totalChatters}\`\n` +
          `🔥 **En Shift Actif :** \`${dash.activeShiftCount}\`\n` +
          `💵 **Chiffre d'Affaires Total :** \`$${dash.grandTotalSales.toFixed(2)}\`\n` +
          `💎 **Commissions Totales Dues :** \`$${dash.grandTotalCommission.toFixed(2)}\`\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        )
        .setFooter({ text: 'AVA Agency • Suivi de Performance' })
        .setTimestamp();

      let tableText = '';
      for (const c of dash.chatterList) {
        const statusBadge = c.status.toLowerCase() === 'actif' ? '🟢 `Actif`' : '⚪ `Repos`';
        const bar = renderProgressBar(c.progress, 6);
        tableText += `• **${c.name}** (${c.account} · *${c.shift}*)\n` +
          `  Ventes: **\$${c.sales.toFixed(2)}** (${c.salesCount}) $\\rightarrow$ Commission: **\$${c.commission.toFixed(2)}** (${c.rate}%)\n` +
          `  Statut: ${statusBadge} | Obj: ${bar} **${c.progress.toFixed(0)}%**\n\n`;
      }

      if (tableText) {
        embed.addFields({ name: '🏆 Classement & Détail par Chatter', value: tableText.slice(0, 1024) });
      }

      return interaction.editReply({ embeds: [embed] });
    }

    // ── 2. Subcommand: /chatter stats ─────────────────────────────────────────
    if (subcommand === 'stats') {
      const nom = interaction.options.getString('nom');
      let chatter = null;

      if (nom) {
        chatter = getChatterByName(nom);
        if (!chatter) {
          return interaction.reply({ content: `❌ Chatter introuvable avec le nom **${nom}**.`, ephemeral: true });
        }
      } else {
        chatter = getChatterByDiscordId(interaction.user.id);
        if (!chatter) {
          return interaction.reply({
            content: '⚠️ Ton compte Discord n\'est pas encore lié à un profil chatter. Précise un nom ou va dans <#1524736963477901415> pour t\'identifier.',
            ephemeral: true,
          });
        }
      }

      const stats = getChatterStats(chatter.id);
      const progressBar = renderProgressBar(stats.progress, 10);
      const statusEmoji = chatter.status.toLowerCase() === 'actif' ? '🟢 Actif (En shift)' : '⚪ Repos (Hors ligne)';

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
          {
            name: `Progression Objectif ($${stats.target.toFixed(2)})`,
            value: `${progressBar} **${stats.progress.toFixed(1)}%**`,
            inline: false,
          }
        )
        .setFooter({ text: 'AVA Agency • Espace Chatters' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ── 3. Subcommand: /chatter add ───────────────────────────────────────────
    if (subcommand === 'add') {
      const name = interaction.options.getString('nom').trim();
      const rate = interaction.options.getNumber('pourcentage') || 10.0;
      const account = interaction.options.getString('compte') || 'Kim';
      const shift = interaction.options.getString('shift') || 'Matin (08h-14h)';
      const target = interaction.options.getNumber('objectif') || 500.0;
      const initialSales = interaction.options.getNumber('ventes_initiales') || 0.0;

      try {
        const newChatter = addChatter({
          name,
          assignedAccount: account,
          shift,
          commissionRate: rate,
          salesTarget: target,
          status: 'Actif',
        });

        // Enregistrer les ventes antérieures si spécifiées
        if (initialSales > 0) {
          recordSale({
            chatterId: newChatter.id,
            subName: 'Solde / Ventes Antérieures',
            ppvName: 'Report Initial',
            amount: initialSales,
            discordUserId: null,
          });
        }

        // Actualiser le salon admin
        await setupChatterAdminChannel(client).catch(() => {});

        const stats = getChatterStats(newChatter.id);

        return interaction.reply({
          content: `✅ **Chatter créé avec succès !**\n\n` +
            `• Prénom : **${newChatter.name}**\n` +
            `• Compte : **${newChatter.assigned_account}**\n` +
            `• Shift : **${newChatter.shift}**\n` +
            `• Taux : **${newChatter.commission_rate}%**\n` +
            (initialSales > 0 ? `• 💵 **Ventes Déjà Réalisées :** \`$${initialSales.toFixed(2)}\` (Commissions dues : \`+$${stats.pendingTotalCommission.toFixed(2)}\`)\n` : '') +
            `• Objectif : **$${newChatter.sales_target.toFixed(2)}**`,
          ephemeral: false,
        });
      } catch (err) {
        return interaction.reply({ content: `❌ Erreur : ${err.message}`, ephemeral: true });
      }
    }

    // ── 4. Subcommand: /chatter shift ─────────────────────────────────────────
    if (subcommand === 'shift') {
      const nom = interaction.options.getString('nom');
      const statut = interaction.options.getString('statut');

      const chatter = getChatterByName(nom);
      if (!chatter) {
        return interaction.reply({ content: `❌ Chatter introuvable : **${nom}**.`, ephemeral: true });
      }

      updateChatterStatus(chatter.id, statut);
      await setupChatterAdminChannel(client).catch(() => {});

      return interaction.reply({
        content: `✅ Le statut de **${chatter.name}** est désormais : **${statut === 'Actif' ? '🟢 Actif (En shift)' : '⚪ Repos'}**.`,
        ephemeral: false,
      });
    }

    // ── 5. Subcommand: /chatter payer ─────────────────────────────────────────
    if (subcommand === 'payer') {
      const confirmer = interaction.options.getBoolean('confirmer');
      if (!confirmer) {
        return interaction.reply({
          content: '❌ Action annulée : vous devez explicitement cocher `confirmer: Vrai` pour valider les paiements.',
          ephemeral: true,
        });
      }

      await interaction.deferReply();
      const paidList = processAllChatterPayouts(interaction.user.tag);

      await setupChatterAdminChannel(client).catch(() => {});

      let totalPaid = 0;
      let summaryText = '';
      for (const p of paidList) {
        totalPaid += p.amount;
        summaryText += `• **${p.chatterName}** : **\$${p.amount.toFixed(2)}** (${p.salesCount} ventes — total: \$${p.totalSales.toFixed(2)})\n`;
      }

      // Notifier dans le salon des fondateurs
      const channelId = process.env.CHANNEL_CHATTER_FOUNDER_SALES || '1565370727740342282';
      const founderChannel = await client.channels.fetch(channelId).catch(() => null);

      if (founderChannel) {
        const payoutEmbed = new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle('💳 CLÔTURE DE PAIE BIMENSUELLE (2 SEMAINES) VALIDÉE')
          .setDescription(
            `Les règlements pour le cycle de 2 semaines ont été validés par **${interaction.user.tag}** via la commande \`/chatter payer\`.\n` +
            `Les compteurs de commissions de chaque chatter sont maintenant remis à zéro pour les 2 prochaines semaines.\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `💰 **Total Distribué :** \`$${totalPaid.toFixed(2)}\`\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `**Détail des règlements :**\n${summaryText || 'Aucun montant dû.'}`
          )
          .setFooter({ text: 'AVA Agency • Payouts Automatiques' })
          .setTimestamp();

        await founderChannel.send({ embeds: [payoutEmbed] }).catch(() => {});
      }

      return interaction.editReply({
        content: `✅ **Cycle de paie clôturé avec succès !**\nTotal de **$${totalPaid.toFixed(2)}** archivé pour ${paidList.length} chatter(s).\nTous les compteurs sont remis à zéro pour le prochain cycle de 2 semaines.`,
      });
    }

    // ── 6. Subcommand: /chatter rapport ───────────────────────────────────────
    if (subcommand === 'rapport') {
      await interaction.deferReply({ ephemeral: true });
      const dateOption = interaction.options.getString('date');
      const res = await sendDailyChatterSalesReport(client, dateOption);

      if (res && res.success) {
        return interaction.editReply({
          content: `✅ **Rapport quotidien des ventes publié avec succès dans les salons dédiés avec la mention @everyone !**`,
        });
      } else {
        return interaction.editReply({
          content: `❌ **Erreur :** ${res ? res.message : 'Impossible d\'envoyer le rapport.'}`,
        });
      }
    }

    // ── 7. Subcommand: /chatter delete ────────────────────────────────────────
    if (subcommand === 'delete') {
      const nom = interaction.options.getString('nom');
      const chatter = getChatterByName(nom);
      if (!chatter) {
        return interaction.reply({ content: `❌ Chatter introuvable avec le nom **${nom}**.`, ephemeral: true });
      }

      deleteChatter(chatter.id);
      await setupChatterAdminChannel(client).catch(() => {});

      return interaction.reply({
        content: `✅ Le profil du chatter **${chatter.name}** a été définitivement supprimé de l'équipe.\nLe tableau de bord a été actualisé.`,
        ephemeral: false,
      });
    }

    // ── 8. Subcommand: /chatter strike ────────────────────────────────────────
    if (subcommand === 'strike') {
      const nom = interaction.options.getString('nom');
      const motif = interaction.options.getString('motif');
      const chatter = getChatterByName(nom);
      if (!chatter) {
        return interaction.reply({ content: `❌ Chatter introuvable avec le nom **${nom}**.`, ephemeral: true });
      }

      const res = await recordChatterStrike(client, chatter.id, 'retard', motif);
      if (!res) {
        return interaction.reply({
          content: `ℹ️ Un avertissement similaire a déjà été enregistré aujourd'hui pour **${chatter.name}**.`,
          ephemeral: true,
        });
      }

      return interaction.reply({
        content: `⚠️ **Avertissement enregistré pour ${chatter.name}** (Total actif : ${res.strikeCount}/3).\n${res.penaltyApplied ? '⛔ Une déduction automatique de 1.00$ a été appliquée sur ses commissions.' : 'ℹ️ Aucune sanction financière (< 4 avertissements).'}\nLes notifications ont été transmises dans les salons dédiés.`,
        ephemeral: false,
      });
    }

    // ── 9. Subcommand: /chatter excuse ────────────────────────────────────────
    if (subcommand === 'excuse') {
      const nom = interaction.options.getString('nom');
      const motif = interaction.options.getString('motif');
      const chatter = getChatterByName(nom);
      if (!chatter) {
        return interaction.reply({ content: `❌ Chatter introuvable avec le nom **${nom}**.`, ephemeral: true });
      }

      await recordChatterAbsence(client, chatter.id, motif);
      return interaction.reply({
        content: `✅ **Absence excusée pour ${chatter.name}** (*${motif}*).\nLe compteur de jours consécutifs d'absence a été réinitialisé à 0.`,
        ephemeral: false,
      });
    }
  },
};

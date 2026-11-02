/**
 * commands/compta.js
 * Commande Slash /compta pour la gestion comptable, les dépenses, le CA et les bénéfices (Fondateurs)
 */
'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const {
  setupComptaChannel,
  getMonthlyComptaData,
  addExpense,
  addRevenue,
} = require('../services/comptaService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('compta')
    .setDescription('Gestion comptable, dépenses, chiffre d\'affaires et répartition 50/50 (Fondateurs)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName('panel')
        .setDescription('Republier ou actualiser le tableau de bord officiel dans #compatabiliter')
    )
    .addSubcommand(sub =>
      sub
        .setName('bilan')
        .setDescription('Consulter le bilan financier d\'un mois')
        .addStringOption(opt =>
          opt
            .setName('mois')
            .setDescription('Mois au format AAAA-MM (ex: 2026-10). Laisser vide = mois en cours.')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('depense')
        .setDescription('Enregistrer une dépense opérationnelle')
        .addStringOption(opt =>
          opt
            .setName('categorie')
            .setDescription('Catégorie de la dépense')
            .setRequired(true)
            .addChoices(
              { name: '✈️ Abonnement Telegram Premium', value: 'Telegram Premium' },
              { name: '📲 Numéros (SMSPool / SIMs)', value: 'Numéros' },
              { name: '✉️ Mails (Comptes / Domaines)', value: 'Mails' },
              { name: '🐦 Comptes Twitter / Réseaux', value: 'Comptes Twitter' },
              { name: '📢 Ads & Publicités', value: 'Ads' },
              { name: '👑 Salaire Modèle', value: 'Salaire Modèle' },
              { name: '👔 Salaires Managers', value: 'Salaires Managers' },
              { name: '⚙️ Autre / Outils', value: 'Autre' }
            )
        )
        .addNumberOption(opt =>
          opt
            .setName('montant')
            .setDescription('Montant en $ (ex: 50.00)')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('description')
            .setDescription('Détails ou motif de la dépense')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('ca')
        .setDescription('Enregistrer une entrée de Chiffre d\'Affaires (OnlyFans, Fansly, etc.)')
        .addStringOption(opt =>
          opt
            .setName('source')
            .setDescription('Source du CA (ex: OnlyFans, Fansly, MYM)')
            .setRequired(true)
        )
        .addNumberOption(opt =>
          opt
            .setName('montant')
            .setDescription('Montant brut en $ (ex: 1500)')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('description')
            .setDescription('Détails / Période')
            .setRequired(true)
        )
    ),

  async execute(interaction, client) {
    const roleFounderId = process.env.ROLE_FUNDER_ID || '1438301065471721636';
    const isFounder = interaction.member?.roles?.cache?.has(roleFounderId);
    const isAdmin = interaction.member?.permissions?.has('Administrator');

    if (!isFounder && !isAdmin) {
      return interaction.reply({
        content: '❌ Commande strictement réservée aux fondateurs et associés de l\'agence.',
        ephemeral: true,
      });
    }

    const sub = interaction.options.getSubcommand();

    // ── 1. /compta panel ──
    if (sub === 'panel') {
      await interaction.deferReply({ ephemeral: true });
      await setupComptaChannel(client);
      return interaction.editReply({
        content: `✅ Le tableau de bord financier officiel a été actualisé dans <#${process.env.CHANNEL_COMPTABILITE || '1566025049104851068'}>.`,
      });
    }

    // ── 2. /compta bilan ──
    if (sub === 'bilan') {
      const monthInput = interaction.options.getString('mois');
      const data = getMonthlyComptaData(monthInput);

      const embed = new EmbedBuilder()
        .setColor(data.netProfit >= 0 ? 0x00ff88 : 0xed4245)
        .setTitle(`📊 BILAN FINANCIER — ${data.capitalizedMonth.toUpperCase()}`)
        .setDescription(
          `Synthèse comptable pour le mois de **${data.capitalizedMonth}** :\n\n` +
          `📈 **Chiffre d'Affaires Brut :** \`$${data.totalGrossRevenue.toFixed(2)}\`\n` +
          `📉 **Total Dépenses & Charges :** \`-$${data.totalExpenses.toFixed(2)}\`\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `💎 **BÉNÉFICE NET :** \`$${data.netProfit.toFixed(2)}\`\n\n` +
          `🤝 **RÉPARTITION ASSOCIÉS (50% / 50%) :**\n` +
          `  └ 👑 **Associé 1 :** **\`$${data.associateShare.toFixed(2)}\`**\n` +
          `  └ 👑 **Associé 2 :** **\`$${data.associateShare.toFixed(2)}\`**\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        )
        .addFields(
          {
            name: '💵 Revenus',
            value: `• Ventes Chatters : **\$${data.chatterTotalSales.toFixed(2)}**\n` +
                   `• Autres Revenus : **\$${data.extraRevenues.toFixed(2)}**`,
            inline: true,
          },
          {
            name: '👥 Équipe (VAs & Chatters)',
            value: `• VAs Telegram (FR) : **\$${data.vaCost.toFixed(2)}**\n` +
                   (data.categories['VAs US / Clôture'] > 0 ? `• VAs Clôture US : **\$${data.categories['VAs US / Clôture'].toFixed(2)}**\n` : '') +
                   (data.categories['Régularisation VAs'] > 0 ? `• Régul. Malachie FR : **\$${data.categories['Régularisation VAs'].toFixed(2)}**\n` : '') +
                   `• Commissions Chatters : **\$${data.chatterNetCommission.toFixed(2)}**\n` +
                   `• Salaire Modèle : **\$${data.categories['Salaire Modèle'].toFixed(2)}**\n` +
                   `• Salaires Managers : **\$${data.categories['Salaires Managers'].toFixed(2)}**`,
            inline: true,
          },
          {
            name: '🛠️ Charges Opérationnelles',
            value: `• Telegram Premium : **\$${data.categories['Telegram Premium'].toFixed(2)}**\n` +
                   `• Ads : **\$${data.categories['Ads'].toFixed(2)}**\n` +
                   `• Comptes Twitter : **\$${data.categories['Comptes Twitter'].toFixed(2)}**\n` +
                   `• Numéros : **\$${data.categories['Numéros'].toFixed(2)}**\n` +
                   `• Mails : **\$${data.categories['Mails'].toFixed(2)}**\n` +
                   `• Autre : **\$${data.categories['Autre'].toFixed(2)}**`,
            inline: false,
          }
        )
        .setFooter({ text: 'AVA Agency • Bilan Comptable' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ── 3. /compta depense ──
    if (sub === 'depense') {
      const category = interaction.options.getString('categorie');
      const amount = interaction.options.getNumber('montant');
      const description = interaction.options.getString('description');

      const saved = addExpense({
        category,
        amount,
        description,
        createdById: interaction.user.id,
        createdByName: interaction.user.username,
      });

      await setupComptaChannel(client).catch(() => {});

      return interaction.reply({
        content: `✅ **Dépense ajoutée avec succès !**\n` +
                 `• Catégorie : \`${saved.category}\`\n` +
                 `• Montant : **\$${saved.amount.toFixed(2)}**\n` +
                 `• Motif : *${saved.description}*\n` +
                 `• Date : \`${saved.date}\`\n\n` +
                 `*Le tableau de bord dans <#${process.env.CHANNEL_COMPTABILITE || '1566025049104851068'}> a été actualisé.*`,
      });
    }

    // ── 4. /compta ca ──
    if (sub === 'ca') {
      const source = interaction.options.getString('source');
      const amount = interaction.options.getNumber('montant');
      const description = interaction.options.getString('description');

      const saved = addRevenue({
        source,
        amount,
        description,
        createdById: interaction.user.id,
        createdByName: interaction.user.username,
      });

      await setupComptaChannel(client).catch(() => {});

      return interaction.reply({
        content: `✅ **Chiffre d'Affaires enregistré avec succès !**\n` +
                 `• Source : \`${saved.source}\`\n` +
                 `• Montant : **\$${saved.amount.toFixed(2)}**\n` +
                 `• Détails : *${saved.description}*\n` +
                 `• Date : \`${saved.date}\`\n\n` +
                 `*Les bénéfices nets et le partage 50/50 ont été recalculés.*`,
      });
    }
  },
};

/**
 * Slash Command /wysper (ou /relances)
 * Permet aux chatteurs et managers de consulter en temps réel les abonnés à relancer,
 * les baleines et les opportunités de vente depuis le CRM Wysper.
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const wysper = require('../services/wysperService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wysper')
    .setDescription('Consulte les relances, baleines et abonnés chauds via le CRM Wysper')
    .addSubcommand(sub =>
      sub.setName('relances')
        .setDescription('Affiche la liste des abonnés à relancer d\'urgence avec des messages types')
    )
    .addSubcommand(sub =>
      sub.setName('baleines')
        .setDescription('Affiche les plus gros acheteurs (Whales) du compte')
    )
    .addSubcommand(sub =>
      sub.setName('stats')
        .setDescription('Statistiques globales du CRM Wysper (Whales, Spenders, Time Wasters)')
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const subcommand = interaction.options.getSubcommand();

    try {
      const accounts = await wysper.getAccounts();
      const activeAccount = accounts.find(a => a.status === 'active') || accounts[0];

      if (!activeAccount) {
        return interaction.editReply('❌ Aucun compte modèle actif trouvé sur Wysper.');
      }

      const analysis = await wysper.analyzeProspects(activeAccount.telegram_id);

      if (subcommand === 'stats') {
        const embed = new EmbedBuilder()
          .setTitle(`📊 Statistiques Wysper CRM — ${activeAccount.name}`)
          .setColor('#3b82f6')
          .addFields(
            { name: '👥 Total Abonnés analysés', value: `**${analysis.totalContacts}** contacts`, inline: true },
            { name: '🐳 Baleines (+100€)', value: `**${analysis.whalesCount}** profils`, inline: true },
            { name: '💸 Spenders actifs', value: `**${analysis.spendersCount}** profils`, inline: true },
            { name: '⌛ Time Wasters (TW)', value: `**${analysis.timeWastersCount}** (0€ dépense)`, inline: true },
            { name: '🚨 Abonnés à relancer', value: `**${analysis.relanceNeeded.length}** opportunités`, inline: true },
            { name: '📱 Statut Compte', value: `\`${activeAccount.status.toUpperCase()}\``, inline: true }
          )
          .setFooter({ text: 'Wysper CRM • Formation Chatting AVA Agency' })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

      if (subcommand === 'baleines') {
        const embed = new EmbedBuilder()
          .setTitle(`🐳 Top Baleines (Whales) — ${activeAccount.name}`)
          .setColor('#10b981')
          .setDescription(
            `Les baleines représentent **80% du CA** de l'agence.\n` +
            `Règles d'or Notion : Réponse en < 1 min, s'intéresser à eux, pas de limite de prix sur les gros médias !\n\n`
          );

        if (analysis.whales.length === 0) {
          embed.addFields({ name: 'Info', value: 'Aucune baleine répertoriée pour le moment.' });
        } else {
          for (const w of analysis.whales.slice(0, 10)) {
            const username = w.username || 'Sans pseudo';
            const lastContact = w.lastOutgoingAt ? new Date(w.lastOutgoingAt).toLocaleDateString('fr-FR') : 'Inconnu';
            embed.addFields({
              name: `🐳 ${w.name} (${username})`,
              value: `• Dépense totale : **${w.totalSpent}€** (${w.paymentsCount} achats)\n• Dernier contact : ${lastContact}\n• Tags : \`${w.tags.join(', ') || 'Aucun'}\``
            });
          }
        }

        embed.setFooter({ text: 'Données issues de Wysper CRM' }).setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      }

      // Par défaut : relances
      const embed = new EmbedBuilder()
        .setTitle(`🚨 Abonnés à Relancer d'Urgence — ${activeAccount.name}`)
        .setColor('#f59e0b')
        .setDescription(
          `Voici les abonnés en attente de réponse ou inactifs qui ont du potentiel d'achat.\n` +
          `Copie directement les messages suggérés pour déclencher une conversation !\n\n`
        );

      const relances = analysis.relanceNeeded.slice(0, 8);
      if (relances.length === 0) {
        embed.addFields({ name: '✅ À jour !', value: 'Tous les abonnés ont reçu une réponse récente.' });
      } else {
        for (const r of relances) {
          const badge = r.priority === 1 ? '🐳 BALEINE' : r.priority === 2 ? '💸 SPENDER' : '👤 NOUVEAU/PROSPECT';
          const name = r.name + (r.username ? ` (${r.username})` : '');
          const spent = r.totalSpent > 0 ? `💰 Déjà dépensé : **${r.totalSpent}€**` : 'Dépense : 0€';

          let exempleRelance = '';
          if (r.priority === 1) {
            exempleRelance = `\`\`\`text\nCoucouu ${r.name} 🥰 je pensais à toi justement... ta journée se passe bien ? Tu m'as manqué hihi 💕\`\`\``;
          } else if (r.priority === 2) {
            exempleRelance = `\`\`\`text\nHeyy ${r.name} 😘 j'ai une petite question pour toi... tu fais quoi ce soir ? Tu es sage ou pas ? 👀\`\`\``;
          } else {
            exempleRelance = `\`\`\`text\nCoucouu ${r.name} :) alors tu as passé un bon après-midi toi ? 😘\`\`\``;
          }

          embed.addFields({
            name: `${badge} : ${name} — ${spent}`,
            value: `• **Statut :** ${r.reason} (depuis ${r.hoursSinceContact}h)\n• **Message à copier :**\n${exempleRelance}`
          });
        }
      }

      embed.setFooter({ text: 'Wysper CRM • Formation Chatting AVA Agency' }).setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('Erreur commande /wysper:', err);
      return interaction.editReply(`❌ Erreur lors de l'exécution de la commande : ${err.message}`);
    }
  }
};

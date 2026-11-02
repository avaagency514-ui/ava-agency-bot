/**
 * commands/tgtracker.js
 * Commande Discord pour gérer le tracker Telegram
 * Sous-commandes :
 *   /tgtracker liens          → affiche les liens d'invitation par VA
 *   /tgtracker stats          → stats du jour (non encore reporté)
 *   /tgtracker rapport        → force le rapport maintenant
 *   /tgtracker sync           → recrée les liens pour toutes les VAs
 *   /tgtracker remun          → tableau de rémunération complet de toutes les VAs
 */
'use strict';

const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');

function isUserFounder(interaction) {
  const founderRoleId = process.env.ROLE_FUNDER_ID || '1438301065471721636';
  const isFounderRole = founderRoleId && interaction.member?.roles?.cache?.has(founderRoleId);
  const isAdmin = interaction.member?.permissions?.has(PermissionsBitField.Flags.Administrator);
  const isGuildOwner = interaction.guild?.ownerId && interaction.guild.ownerId === interaction.user?.id;
  const isFounderUserId = process.env.DISCORD_FOUNDER_ID && process.env.DISCORD_FOUNDER_ID === interaction.user?.id;

  return Boolean(isFounderRole || isAdmin || isGuildOwner || isFounderUserId);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tgtracker')
    .setDescription('Gestion du tracker d\'abonnés Telegram')
    .addSubcommand(sub =>
      sub.setName('liens')
        .setDescription('Affiche les liens d\'invitation nominatifs par VA')
    )
    .addSubcommand(sub =>
      sub.setName('stats')
        .setDescription('Stats d\'aujourd\'hui (abonnés non encore reportés)')
    )
    .addSubcommand(sub =>
      sub.setName('rapport')
        .setDescription('Envoie le rapport quotidien maintenant (force)')
    )
    .addSubcommand(sub =>
      sub.setName('sync')
        .setDescription('Recrée les liens Telegram pour toutes les VAs actives')
    )
    .addSubcommand(sub =>
      sub.setName('remun')
        .setDescription('Tableau de rémunération complet de toutes les VAs')
    )
    .addSubcommand(sub =>
      sub.setName('setlink')
        .setDescription('Enregistre manuellement un lien Telegram pour une VA')
        .addStringOption(opt =>
          opt.setName('va')
            .setDescription('Nom de la VA ou du lien Telegram (ex: Richid twitter)')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('canal')
            .setDescription('Canal ciblé')
            .setRequired(true)
            .addChoices(
              { name: '🇫🇷 Canal FR', value: 'FR' },
              { name: '🇺🇸 Canal US', value: 'US' }
            )
        )
        .addStringOption(opt =>
          opt.setName('lien')
            .setDescription('Lien Telegram (ex: https://t.me/+AbCdEf...)')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('payer')
        .setDescription('Valide le règlement des 2 semaines (>= 30 subs) et remet le compteur à 0')
        .addStringOption(opt =>
          opt.setName('va')
            .setDescription('Nom de la VA spécifique (laisser vide pour régler toutes les VAs qualifiées)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('audit')
        .setDescription('Vérifie la présence réelle de tous les membres sur le canal et élimine les faux/partis')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // Vérification simple : seul le fondateur peut l'utiliser (rôle Manager ou fondateur)
    // On vérifie via l'ID du fondateur en .env ou via un rôle
    const founderId = process.env.DISCORD_FOUNDER_ID || process.env.DISCORD_CLIENT_ID;
    // (Laissé ouvert pour les admins du serveur)

    await interaction.deferReply({ ephemeral: true });

    try {
      const { sendDailyTrackerReport, getTodayStats, getAllInviteLinks, createLinksForAllVAs, auditActiveMembers, getTrackerBot } = require('../services/tgTracker');
      const { buildAllVAsReport } = require('../services/tgRemuneration');

      if (sub === 'audit') {
        const bot = getTrackerBot();
        if (!bot) return interaction.editReply({ content: '❌ Bot Telegram non initialisé.' });

        await interaction.editReply({ content: '🔍 Audit de présence active en cours sur le canal Telegram (vérification de tous les membres)...' });
        const res = await auditActiveMembers(bot, 'FR', true);
        return interaction.editReply({
          content: `🛡️ **Audit anti-fraude Telegram terminé !**\n\n• Membres éligibles analysés : **${res.checked}**\n• Membres partis / comptes supprimés invalidés : **${res.invalidated}**\n• Membres toujours actifs et qualifiés : **${res.checked - res.invalidated}**`
        });
      }

      if (sub === 'liens') {
        const links = getAllInviteLinks().filter(l => l.canal === 'FR');

        if (links.length === 0) {
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(0xf39c12)
                .setTitle('🔗 Liens d\'invitation Telegram')
                .setDescription('Aucun lien généré pour le canal FR pour le moment.\nAssure-toi que `TELEGRAM_TRACKER_TOKEN` et `TELEGRAM_CANAL_FR_ID` sont configurés.')
            ]
          });
        }

        const desc = `**🇫🇷 Canal FR (Canal de Kim 💖)**\n` +
          links.map(l => `👤 **${l.va_name}** → \`${l.invite_link}\``).join('\n');

        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x00aaff)
              .setTitle('🔗 Liens d\'invitation Telegram (France) — Par VA')
              .setDescription(desc.slice(0, 4000))
              .setFooter({ text: 'Donne à chaque VA UNIQUEMENT son propre lien pour le canal français' })
          ]
        });

      } else if (sub === 'stats') {
        const rows = getTodayStats();
        const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

        if (rows.length === 0) {
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(0x95a5a6)
                .setTitle(`📊 Stats Telegram — ${today}`)
                .setDescription('Aucun abonné enregistré depuis le dernier rapport sur le canal français.')
            ]
          });
        }

        const totalSubs = rows.reduce((s, r) => s + r.total, 0);
        const totalOk   = rows.reduce((s, r) => s + (r.ok || 0), 0);
        const totalKo   = rows.reduce((s, r) => s + (r.ko || 0), 0);

        const buildFields = (arr) => arr.map(r => ({
          name: `👤 ${r.va_name}`,
          value: `**${r.total}** sub(s) — ✅ ${r.ok || 0} · ❌ ${r.ko || 0}`,
          inline: true
        }));

        const fields = [];

        // ── Canal FR Unique ──
        fields.push({
          name: `🇫🇷 ── Canal FR (Canal de Kim 💖) ── (${totalSubs} sub${totalSubs > 1 ? 's' : ''} · ✅ ${totalOk} · ❌ ${totalKo})`,
          value: rows.length > 0 ? '\u200b' : '*Aucun nouvel abonné enregistré aujourd\'hui sur ce canal (0 sub)*',
          inline: false
        });
        if (rows.length > 0) {
          fields.push(...buildFields(rows));
        }

        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x2ecc71)
              .setTitle(`📊 Stats Telegram — ${today}`)
              .setDescription(`**Total : ${totalSubs} abonnés** — ✅ ${totalOk} éligibles (France) · ❌ ${totalKo} non-éligibles`)
              .addFields(fields)
              .setFooter({ text: 'Canal FR · Subs non encore inclus dans un rapport quotidien · France uniquement' })
          ]
        });

      } else if (sub === 'rapport') {
        if (!isUserFounder(interaction)) {
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle('⛔ Accès réservé aux fondateurs')
                .setDescription('La commande `/tgtracker rapport` est strictement réservée aux fondateurs de l\'agence afin d\'éviter tout déclenchement manuel non autorisé du rapport quotidien.')
            ]
          });
        }

        await sendDailyTrackerReport(interaction.client);
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x00ff88)
              .setTitle('📊 Rapport envoyé !')
              .setDescription('Le rapport Telegram a été envoyé dans le salon configuré.')
          ]
        });

      } else if (sub === 'sync') {
        await interaction.editReply({
          embeds: [new EmbedBuilder().setColor(0xf39c12).setTitle('🔄 Sync en cours...').setDescription('Création/vérification des liens pour toutes les VAs actives...')]
        });
        await createLinksForAllVAs();
        const links = getAllInviteLinks();
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x00ff88)
              .setTitle('✅ Synchronisation terminée')
              .setDescription(`${links.length} lien(s) présent(s) en base.\nUtilise \`/tgtracker liens\` pour les voir.`)
          ]
        });

      } else if (sub === 'remun') {
        const reports = buildAllVAsReport();
        const today   = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
        const month   = new Date().toISOString().slice(0, 7);

        if (reports.length === 0) {
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(0x95a5a6)
                .setTitle('💰 Rémunérations')
                .setDescription('Aucune donnée de rémunération disponible.')
            ]
          });
        }

        const fields = [];
        let totalDue = 0;
        let bonusVAs = [];

        for (const r of reports) {
          if (r.totalEligible === 0 && r.totalEarned === 0) continue;

          let val = `**${r.totalEligible}** subs valides · **${r.pendingSubs}** en attente`;
          if (r.canPay) {
            const dollars = Math.floor(r.pendingSubs / 3);
            val += `\n💵 **À payer: \$${dollars}**`;
            totalDue += dollars;
          } else if (r.pendingSubs > 0) {
            val += `\n⏳ Min. 30 requis (encore **${30 - r.pendingSubs}** manquant(s))`;
          } else {
            val += `\n✅ Tout à jour`;
          }
          val += `\n📦 Total gagné: **\$${r.totalEarned.toFixed(2)}**`;

          if (r.bonusDue) {
            val += `\n🏆 **PRIME 500 SUBS: +\$10 !**`;
            bonusVAs.push(r.vaName);
          } else if (r.totalEligible >= 500) {
            val += `\n✅ Prime déjà versée (${month})`;
          } else {
            const remaining = 500 - r.totalEligible;
            val += `\n🏁 ${remaining} subs avant prime`;
          }

          fields.push({ name: `👤 ${r.vaName}`, value: val, inline: true });
        }

        let desc = `Rapport au **${today}**\n\n`;
        desc += `**Règles:** 1\$ pour 3 subs français valides · min. 30 subs · prime +10\$ à 500 subs`;
        if (totalDue > 0 || bonusVAs.length > 0) {
          const bonusTotal = bonusVAs.length * 10;
          desc += `\n\n💳 **TOTAL À VERSER: \$${(totalDue + bonusTotal).toFixed(2)}**`;
          if (bonusVAs.length > 0) desc += ` (dont prime pour : ${bonusVAs.join(', ')})`;
          desc += `\n\n💡 *Action fondateur : utilise \`/tgtracker payer\` pour valider les virements et réinitialiser les compteurs à 0.*`;
        }

        const embed = new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle('💰 Rémunérations VAs — Tracker Telegram')
          .setDescription(desc)
          .setFooter({ text: 'Subs français valides (France uniquement · Hors US / Inde / Afrique)' });

        // Discord limite à 25 fields par embed
        const chunkFields = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));
        const fieldChunks = chunkFields(fields, 25);

        for (let i = 0; i < fieldChunks.length; i++) {
          const e = i === 0 ? embed.addFields(fieldChunks[i]) : new EmbedBuilder().setColor(0xf1c40f).addFields(fieldChunks[i]);
          await (i === 0 ? interaction.editReply({ embeds: [e] }) : interaction.followUp({ embeds: [e], ephemeral: true }));
        }
        return;

      } else if (sub === 'setlink') {
        const vaName = interaction.options.getString('va').trim();
        const canal  = interaction.options.getString('canal');
        const link   = interaction.options.getString('lien').trim();

        const { saveInviteLink } = require('../services/tgTracker');
        saveInviteLink(vaName, canal, link);

        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x00ff88)
              .setTitle('✅ Lien enregistré avec succès')
              .setDescription(`Le lien pour **${vaName}** [${canal}] a été enregistré :\n🔗 \`${link}\``)
          ]
        });

      } else if (sub === 'payer') {
        if (!isUserFounder(interaction)) {
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle('⛔ Accès réservé au fondateur')
                .setDescription('Cette commande est strictement réservée au fondateur pour valider les règlements des VAs.')
            ]
          });
        }

        const targetVA = interaction.options.getString('va');
        const { processPayout, processPayoutAll } = require('../services/tgRemuneration');

        if (targetVA) {
          const res = processPayout(targetVA.trim());
          if (!res.success) {
            return interaction.editReply({
              embeds: [
                new EmbedBuilder()
                  .setColor(0xe74c3c)
                  .setTitle('❌ Objectif non atteint')
                  .setDescription(`La VA **${targetVA}** n'a pas encore atteint les 30 subs valides minimum requis pour un virement.\nSon compteur reste conservé et continue de cumuler pour la période suivante.`)
              ]
            });
          }
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(0x00ff88)
                .setTitle('💵 Virement validé avec succès !')
                .setDescription(`👤 **${targetVA}**\n✅ **${res.paidSubs}** subs valides réglés.\n💵 Montant versé : **\$${res.amount}.00**\n🔄 Son compteur en attente a été remis à 0 pour les 2 prochaines semaines.`)
            ]
          });
        } else {
          const result = processPayoutAll();
          if (result.paid.length === 0) {
            return interaction.editReply({
              embeds: [
                new EmbedBuilder()
                  .setColor(0xf39c12)
                  .setTitle('ℹ️ Aucun virement à effectuer')
                  .setDescription('Aucune VA n\'a atteint l\'objectif minimum de 30 subs valides pour ce cycle de 2 semaines.\nTous les compteurs continuent de cumuler normalement.')
              ]
            });
          }

          const paidDesc = result.paid.map(p => `👤 **${p.vaName}** : **${p.subs}** subs $\\rightarrow$ **\$${p.amount}.00** (Compteur remis à 0)`).join('\n');
          const totalPaid = result.paid.reduce((a, b) => a + b.amount, 0);

          let contDesc = '';
          if (result.continued.length > 0) {
            contDesc = '\n\n**🔒 VAs en cours de cumul (< 30 subs, compteurs conservés) :**\n' +
              result.continued.map(c => `• **${c.vaName}** : ${c.pendingSubs} sub(s)`).join('\n');
          }

          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(0x00ff88)
                .setTitle('💵 Règlement des 2 semaines validé !')
                .setDescription(`**Virements effectués :**\n${paidDesc}\n\n💳 **TOTAL VERSÉ : \$${totalPaid}.00**${contDesc}`)
                .setFooter({ text: 'Compteurs des VAs payées réinitialisés à 0. Les autres continuent de cumuler.' })
            ]
          });
        }
      }

    } catch (err) {
      console.error('Erreur /tgtracker:', err);
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle('❌ Erreur')
            .setDescription(err.message)
        ]
      });
    }
  }
};

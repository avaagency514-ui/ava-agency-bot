const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const { igQueries, vaQueries, alertesQueries } = require('../database/db');
const { getAllStats } = require('../services/deeplink');

/**
 * Démarre les alertes automatiques — toutes les heures
 * Vérifie les deeplinks sans clics et les VAs inactifs
 */
function startAlertes(client) {
  const intervalle = process.env.ALERTE_INTERVALLE_HEURES || 1;
  const cronExp = `0 */${intervalle} * * *`; // Toutes les N heures

  cron.schedule(cronExp, async () => {
    console.log('🔍 Vérification des alertes...');
    await checkAlertes(client);
  }, {
    timezone: process.env.TIMEZONE || 'Europe/Paris',
  });

  console.log(`✅ Alertes cron démarré (toutes les ${intervalle}h)`);
}

/**
 * Vérifie les clics et l'activité des VAs, envoie les alertes
 */
async function checkAlertes(client) {
  const channelId = process.env.CHANNEL_MANAGER_ISSUES;
  if (!channelId) return console.warn('⚠️ CHANNEL_MANAGER_ISSUES non défini');

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return console.warn('⚠️ Salon manager-issues introuvable');

  const alertes = [];

  // ─── 1. Vérification des deeplinks (clics) ────────────────
  const comptes = igQueries.getAllActifs.all();
  const stats = await getAllStats(comptes);

  const maintenant = Date.now();
  const SEUIL_24H = 24 * 60 * 60 * 1000;

  for (const compte of stats) {
    const oldClics = compte.clics || 0;
    const newClics = compte.newClics || oldClics;

    // Mettre à jour les clics en DB
    if (newClics !== oldClics) {
      igQueries.updateClics.run({
        id: compte.id,
        clics: newClics,
        last_clic_at: new Date().toISOString(),
      });
    }

    // Alerte : lien actif (avait des clics) mais plus de clic depuis 24h
    if (oldClics > 0 && compte.lastClic) {
      const lastClicTime = new Date(compte.lastClic).getTime();
      if (maintenant - lastClicTime > SEUIL_24H) {
        // Vérifier si alerte déjà envoyée dans les 24h
        const alreadySent = alertesQueries.getRecent.get({
          type: 'no_click_24h',
          reference_id: compte.id,
        });
        if (!alreadySent) {
          alertes.push({
            type: 'no_click_24h',
            compte,
            va: vaQueries.getById.get(compte.va_id),
          });
          alertesQueries.log.run({
            type: 'no_click_24h',
            reference_id: compte.id,
            reference_type: 'compte_ig',
          });
        }
      }
    }
  }

  // ─── 2. Vérification de l'activité des VAs ────────────────
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - SEUIL_24H).toISOString().split('T')[0];
  const vas = vaQueries.getActifs.all();

  for (const va of vas) {
    const { activiteQueries } = require('../database/db');
    const actHier = activiteQueries.getByVaAndDate.get(va.id, yesterday);
    const actAujourd = activiteQueries.getByVaAndDate.get(va.id, today);

    // Si le VA avait de l'activité hier mais rien aujourd'hui
    if (actHier && actHier.count > 0 && !actAujourd) {
      const alreadySent = alertesQueries.getRecent.get({
        type: 'va_inactif_24h',
        reference_id: va.id,
      });
      if (!alreadySent) {
        alertes.push({ type: 'va_inactif_24h', va });
        alertesQueries.log.run({
          type: 'va_inactif_24h',
          reference_id: va.id,
          reference_type: 'va',
        });
      }
    }
  }

  // ─── 3. Envoyer les alertes ───────────────────────────────
  if (alertes.length === 0) {
    console.log('✅ Aucune alerte à envoyer');
    return;
  }

  const funderMention = process.env.ROLE_FUNDER_ID ? `<@&${process.env.ROLE_FUNDER_ID}>` : '@Funder';
  const managerMention = process.env.ROLE_MANAGER_PHONE_ID ? `<@&${process.env.ROLE_MANAGER_PHONE_ID}>` : '@Manager Phone';

  for (const alerte of alertes) {
    let message = '';

    if (alerte.type === 'no_click_24h') {
      const { compte, va } = alerte;
      const vaChannel = va ? `<#${va.channel_id}>` : `**${compte.va_username}**`;
      message = [
        `${funderMention} ${managerMention} — Le lien de ${vaChannel} **# inconnu** sur **@${compte.username_ig}** n'a eu aucun clic depuis 24h alors qu'il tournait bien avant. Ça vaut le coup de voir avec lui ce qui se passe côté compte ✅`,
      ].join('\n');
    }

    if (alerte.type === 'va_inactif_24h') {
      const { va } = alerte;
      const vaChannel = `<#${va.channel_id}>`;
      message = [
        `${funderMention} ${managerMention} — **${vaChannel} # inconnu** n'a pas été actif depuis 24h — on dirait qu'il a mis en pause. Ça serait bien de prendre de ses nouvelles pour savoir où il en est 👍`,
      ].join('\n');
    }

    if (message) {
      await channel.send(message).catch(err => console.error('❌ Erreur envoi alerte:', err));
      await new Promise(r => setTimeout(r, 1000)); // Anti-rate-limit
    }
  }

  console.log(`✅ ${alertes.length} alerte(s) envoyée(s)`);
}

module.exports = { startAlertes, checkAlertes };

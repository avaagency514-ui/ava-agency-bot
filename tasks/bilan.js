const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const { vaQueries, igQueries, activiteQueries } = require('../database/db');

/**
 * Démarre le cron du bilan quotidien
 * Par défaut à 21h00 heure de Paris
 */
function startBilan(client) {
  const heure = process.env.BILAN_HEURE || 21;
  const minute = process.env.BILAN_MINUTE || 0;

  // Cron : tous les jours à HH:MM
  cron.schedule(`${minute} ${heure} * * *`, async () => {
    console.log('📋 Génération du bilan quotidien...');
    await envoyerBilan(client);
  }, {
    timezone: process.env.TIMEZONE || 'Europe/Paris',
  });

  console.log(`✅ Bilan quotidien cron démarré (${heure}h${String(minute).padStart(2, '0')})`);
}

/**
 * Génère et envoie le bilan de la journée dans #comptes
 */
async function envoyerBilan(client) {
  const channelComptesId = process.env.CHANNEL_COMPTES;
  if (!channelComptesId) return console.warn('⚠️ CHANNEL_COMPTES non défini');
  
  const channelBilanId = process.env.CHANNEL_BILAN;
  if (!channelBilanId) return console.warn('⚠️ CHANNEL_BILAN non défini');

  const channelComptes = await client.channels.fetch(channelComptesId).catch(() => null);
  const channelBilan = await client.channels.fetch(channelBilanId).catch(() => null);
  
  if (!channelComptes || !channelBilan) return console.warn('⚠️ Salon #comptes ou #bilan introuvable');

  const today = new Date().toISOString().split('T')[0];
  const dateLabel = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
  });

  // Récupérer l'activité du jour
  const activites = activiteQueries.getByDate.all(today);
  const vas = vaQueries.getAll.all();



  // ─── Calculs globaux ─────────────────────────────────────
  const totalReels = activites.filter(a => a.type === 'reel').reduce((s, a) => s + a.count, 0);
  const totalCTA   = activites.filter(a => a.type === 'cta').reduce((s, a) => s + a.count, 0);
  const totalGains = activites.reduce((s, a) => s + (a.gains || 0), 0);

  // ─── Récupérer les clics depuis la DB ────────────────────
  const allComptes = igQueries.getAllActifs.all();
  const totalClics = allComptes.reduce((s, c) => s + c.clics, 0);

  // ─── Construire le message ligne par ligne ────────────────
  const lines = [];

  // Header
  lines.push(`📋 **Bilan de la journée ${dateLabel}**`);
  lines.push('');
  lines.push(`• 🎬 ${totalReels} reels · 🦅 ${totalCTA} CTA · 💰 $${totalGains.toFixed(2)}`);
  lines.push('---');

  // Par VA
  const vasAvecActivite = new Map();
  for (const a of activites) {
    if (!vasAvecActivite.has(a.va_id)) {
      vasAvecActivite.set(a.va_id, { reels: 0, cta: 0, gains: 0, username: a.username });
    }
    const entry = vasAvecActivite.get(a.va_id);
    if (a.type === 'reel') entry.reels += a.count;
    if (a.type === 'cta') entry.cta += a.count;
    entry.gains += a.gains || 0;
  }

  for (const [vaId, data] of vasAvecActivite) {
    const va = vaQueries.getById.get(vaId);
    if (!va) continue;

    // Récupérer les comptes IG du VA avec leurs clics
    const comptes = igQueries.getByVa.all(vaId);
    const vaClics = comptes.reduce((s, c) => s + c.clics, 0);

    // Emoji de statut
    const statutEmoji = va.statut === 'actif' ? '🟢' : va.statut === 'pause' ? '⏸️' : '🔴';

    // Heure fictive (à adapter si tu tracks l'heure de début)
    lines.push(`# ${statutEmoji} 👤〉 ${va.username} — Start --h--`);
    lines.push(`• 🎬 ${data.reels} reels${data.cta ? ` · 🦅 ${data.cta} CTA` : ''}${data.gains ? ` · 💰 $${data.gains.toFixed(2)}` : ''}`);
    lines.push('---');
  }

  // ─── Fonction utilitaire pour envoyer en chunks ────────────
  async function sendChunks(channel, msgLines) {
    const fullMsg = msgLines.join('\n');
    const MAX_LENGTH = 2000;
    
    if (fullMsg.length <= MAX_LENGTH) {
      await channel.send(fullMsg);
    } else {
      const chunks = [];
      let current = '';
      for (const line of msgLines) {
        if ((current + '\n' + line).length > MAX_LENGTH) {
          chunks.push(current);
          current = line;
        } else {
          current += (current ? '\n' : '') + line;
        }
      }
      if (current) chunks.push(current);
      for (const chunk of chunks) {
        await channel.send(chunk);
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  // 1. Envoyer le Bilan de la journée dans #bilan
  if (lines.length > 0) {
    await sendChunks(channelBilan, lines);
  } else {
    await channelBilan.send(`📋 **Bilan du ${dateLabel}** — Aucune activité enregistrée aujourd'hui.`);
  }

  // 2. Envoyer la liste des comptes dans #comptes
  const linesComptes = [];
  linesComptes.push('**📊 Comptes Instagram — Clics total**');
  linesComptes.push('');

  const vasActifs = vaQueries.getAll.all();
  for (const va of vasActifs) {
    const comptes = igQueries.getByVa.all(va.id);
    for (const c of comptes) {
      const jours = c.created_at
        ? Math.floor((Date.now() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      const statutEmoji = va.statut === 'actif' ? '🟢' : '🔴';
      linesComptes.push(`# ${statutEmoji} 👤〉 ${va.username} · **${c.clics} clic${c.clics !== 1 ? 's' : ''}** : https://instagram.com/${c.username_ig} · depuis ${jours}j`);
    }
  }

  if (linesComptes.length > 2) { // S'il y a plus que le titre
    await sendChunks(channelComptes, linesComptes);
  }

  console.log(`✅ Bilan du ${dateLabel} envoyé (séparé dans #bilan et #comptes)`);
}

/**
 * Commande manuelle pour déclencher le bilan maintenant
 */
async function envoyerBilanMaintenant(client) {
  await envoyerBilan(client);
}

module.exports = { startBilan, envoyerBilan, envoyerBilanMaintenant };

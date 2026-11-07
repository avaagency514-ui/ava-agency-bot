/**
 * Handler Discord pour l'Assistant Chatting & Séduction
 * Salon cible : 1568591980638773360 (#assistant-chatting)
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const https = require('https');
const { analyzeChatting } = require('../services/chatCoachService');
const wysper = require('../services/wysperService');

const TARGET_CHANNEL_ID = '1568591980638773360';

// Cache des contextes de messages pour les boutons d'action (clé: messageId)
const contextCache = new Map();

/**
 * Télécharge une image Discord et la retourne en base64
 */
function downloadImageAsBase64(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer.toString('base64'));
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Construit la barre de boutons d'action
 */
function createActionRow(messageId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`coach_retry_${messageId}`)
      .setLabel('Autre angle')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`coach_objection_${messageId}`)
      .setLabel('Gérer objection')
      .setEmoji('🧊')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`coach_hot_${messageId}`)
      .setLabel('Plus Sexy / Hot')
      .setEmoji('🔥')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`coach_closing_${messageId}`)
      .setLabel('Closing Agressif')
      .setEmoji('💰')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`coach_wysper_${messageId}`)
      .setLabel('Baleines & Relances')
      .setEmoji('🐳')
      .setStyle(ButtonStyle.Secondary)
  );
}

/**
 * Traite un message reçu dans le salon #assistant-chatting
 */
async function handleChatCoachMessage(message) {
  if (message.author.bot) return;
  if (message.channelId !== TARGET_CHANNEL_ID) return;

  try {
    await message.channel.sendTyping();
    await message.react('⏳').catch(() => {});

    let imageBase64 = null;
    let mimeType = 'image/png';

    // 1. Détecter si une image est jointe
    const attachment = message.attachments.first();
    if (attachment && attachment.contentType && attachment.contentType.startsWith('image/')) {
      mimeType = attachment.contentType;
      imageBase64 = await downloadImageAsBase64(attachment.url);
    }

    const textContent = message.content ? message.content.trim() : '';

    if (!imageBase64 && !textContent) {
      await message.reactions.removeAll().catch(() => {});
      return;
    }

    // Sauvegarder dans le cache pour les boutons
    contextCache.set(message.id, {
      imageBase64,
      mimeType,
      textContent,
      authorId: message.author.id,
      timestamp: Date.now()
    });

    // Nettoyer le cache après 1 heure
    setTimeout(() => contextCache.delete(message.id), 3600 * 1000);

    // 2. Analyser la conversation
    const analysis = await analyzeChatting({
      imageBase64,
      mimeType,
      textContent,
      angle: 'standard'
    });

    await message.reactions.removeAll().catch(() => {});
    await message.react('🧠').catch(() => {});

    // 3. Découper la réponse en embeds si nécessaire (limite Discord 4096 car.)
    const embed = new EmbedBuilder()
      .setTitle('🧠 Assistant Chatting & Séduction — AVA Agency')
      .setColor('#ff4081')
      .setDescription(analysis.length > 4000 ? analysis.substring(0, 3990) + '...' : analysis)
      .setFooter({ text: `Demandé par @${message.author.username} • Clique sur un bouton pour ajuster l'angle` })
      .setTimestamp();

    const row = createActionRow(message.id);

    await message.reply({
      embeds: [embed],
      components: [row]
    });
  } catch (error) {
    console.error('Erreur handleChatCoachMessage:', error);
    await message.reactions.removeAll().catch(() => {});
    await message.react('❌').catch(() => {});
    await message.reply({
      content: `❌ **Erreur d'analyse** : ${error.message}`
    }).catch(() => {});
  }
}

/**
 * Traite les clics sur les boutons d'action de l'assistant
 */
async function handleChatCoachInteraction(interaction) {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('coach_')) return;

  const parts = interaction.customId.split('_');
  const action = parts[1]; // retry, objection, hot, closing, wysper
  const targetMessageId = parts[2];

  // Cas spécial : Affichage du tableau de bord des relances Wysper
  if (action === 'wysper') {
    await interaction.deferReply({ ephemeral: true });
    try {
      const accounts = await wysper.getAccounts();
      const activeAccount = accounts.find(a => a.status === 'active') || accounts[0];
      if (!activeAccount) {
        return interaction.editReply({ content: '❌ Aucun compte actif trouvé dans Wysper.' });
      }

      const analysis = await wysper.analyzeProspects(activeAccount.telegram_id);

      const embed = new EmbedBuilder()
        .setTitle(`🐳 Tableau de Bord Wysper — ${activeAccount.name}`)
        .setColor('#10b981')
        .setDescription(
          `📊 **Statistiques Globales :**\n` +
          `• Total Contacts analysés : **${analysis.totalContacts}**\n` +
          `• 🐳 Baleines identifiées : **${analysis.whalesCount}**\n` +
          `• 💸 Spenders actifs : **${analysis.spendersCount}**\n` +
          `• ⌛ Time Wasters (à ignorer) : **${analysis.timeWastersCount}**\n\n` +
          `🚨 **TOP PROSPECTS À RELANCER D'URGENCE :**`
        );

      const relances = analysis.relanceNeeded.slice(0, 5);
      if (relances.length === 0) {
        embed.addFields({ name: '✅ Aucun prospect en attente', value: 'Tous les messages ont reçu une réponse récente !' });
      } else {
        for (const r of relances) {
          const badge = r.priority === 1 ? '🐳 BALEINE' : r.priority === 2 ? '💸 SPENDER' : '👤 PROSPECT';
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
            value: `• **Motif :** ${r.reason} (${r.hoursSinceContact}h)\n• **Message suggéré à copier :**\n${exempleRelance}`
          });
        }
      }

      embed.setFooter({ text: 'Wysper CRM API • Données en temps réel' }).setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('Erreur bouton wysper:', err);
      return interaction.editReply({ content: `❌ Erreur Wysper : ${err.message}` });
    }
  }

  // Autres actions de ré-analyse
  const cached = contextCache.get(targetMessageId);
  if (!cached) {
    return interaction.reply({
      content: '⚠️ Le contexte de cette analyse a expiré. Merci de renvoyer la capture ou le texte dans le salon !',
      ephemeral: true
    });
  }

  await interaction.deferReply();

  let angle = 'standard';
  let angleLabel = 'Nouveau tirage';
  if (action === 'objection') {
    angle = 'objection';
    angleLabel = 'Traitement d\'objection (Notion)';
  } else if (action === 'hot') {
    angle = 'hot';
    angleLabel = 'Sexualisation Poussée & Hot 🔥';
  } else if (action === 'closing') {
    angle = 'aggressive';
    angleLabel = 'Closing Agressif & Conversion 💰';
  }

  try {
    const analysis = await analyzeChatting({
      imageBase64: cached.imageBase64,
      mimeType: cached.mimeType,
      textContent: cached.textContent,
      angle: angle
    });

    const embed = new EmbedBuilder()
      .setTitle(`🧠 Assistant Chatting — Variante : ${angleLabel}`)
      .setColor(action === 'hot' ? '#ff1744' : action === 'closing' ? '#00e676' : '#2979ff')
      .setDescription(analysis.length > 4000 ? analysis.substring(0, 3990) + '...' : analysis)
      .setFooter({ text: `Demandé par @${interaction.user.username} • Variante générée par FreeLLM/Gemini` })
      .setTimestamp();

    const row = createActionRow(targetMessageId);

    await interaction.editReply({
      embeds: [embed],
      components: [row]
    });
  } catch (error) {
    console.error('Erreur variation interaction:', error);
    await interaction.editReply({
      content: `❌ **Erreur lors de la génération** : ${error.message}`
    });
  }
}

module.exports = {
  TARGET_CHANNEL_ID,
  handleChatCoachMessage,
  handleChatCoachInteraction
};

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');
const { getFileForProfile, getAvailableProfiles } = require('../services/drive');
const { processFile } = require('../services/metachanger');
const { generateTwitterText } = require('../services/gemini');
const { getBalance } = require('../services/smspool');
const fs = require('fs');
const path = require('path');

const TW_CHANNELS = {
  FACTORY: process.env.CHANNEL_CONTENT_TWITTER || '1524471089571565778',
  FOLLOW: process.env.CHANNEL_TWITTER_FOLLOW || '1556560307072012389',
  BIO: process.env.CHANNEL_TWITTER_BIO || '1555248940868182026',
  CAPTION: process.env.CHANNEL_TWITTER_CAPTION || '1555248880390635560',
  COMMUNITY: process.env.CHANNEL_TWITTER_COMMUNITY || '1555247770741248020',
};

const TW_CONTENT_LABELS = {
  reels:     { emoji: '🎬', label: 'Reels', color: 0x1da1f2 },
  post:      { emoji: '🖼️', label: 'Post', color: 0x1da1f2 },
  cta:       { emoji: '🔗', label: 'CTA', color: 0x1da1f2 },
  sms:       { emoji: '📱', label: 'SMS Twitter US', color: 0xe0245e },
  bio:       { emoji: '📝', label: 'Bio Twitter', color: 0x1da1f2 },
  caption:   { emoji: '💬', label: 'Légende Tweet', color: 0x1da1f2 },
  follow:    { emoji: '🐦', label: 'Follow Twitter', color: 0x1da1f2 },
  community: { emoji: '👥', label: 'Communautés', color: 0x1da1f2 },
};

/**
 * Configure et publie le panneau Content Factory Twitter dans le salon dédié
 */
async function setupTwitterContentFactory(client) {
  const channelId = TW_CHANNELS.FACTORY;
  if (!channelId) return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    console.warn(`⚠️ Salon Twitter Content Factory introuvable (${channelId}).`);
    return;
  }

  // Purger les anciens messages Content Factory Twitter du bot
  try {
    const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    if (messages) {
      const existingList = messages.filter(m =>
        m.author.id === client.user.id &&
        m.embeds.length > 0 &&
        m.embeds[0]?.title?.includes('Content Factory — Twitter')
      );

      for (const [, oldMsg] of existingList) {
        await oldMsg.delete().catch(() => {});
      }
    }
  } catch (err) {
    console.warn('⚠️ Erreur lors de la purge Twitter Content Factory:', err.message);
  }

  const embed = new EmbedBuilder()
    .setColor(0x1da1f2)
    .setTitle('🐦 Content Factory — Twitter / X')
    .setDescription('Clique sur un bouton pour générer du contenu, obtenir un SMS Twitter US ou du texte (IA).')
    .addFields(
      {
        name: '🎬 Médias',
        value: '**Reels** · **Post** · **CTA**',
        inline: true,
      },
      {
        name: '📝 Textes & Réseau',
        value: '**Bio** · **Légende** · **Follow** · **Communautés**',
        inline: true,
      },
      {
        name: '📱 SMS',
        value: '**SMS Twitter US**',
        inline: true,
      }
    )
    .setFooter({ text: 'AVA Agency Bot • Twitter / X Integration' })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tw_content_reels').setLabel('🎬 Reels').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('tw_content_post').setLabel('🖼️ Post').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('tw_content_cta').setLabel('🔗 CTA').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('tw_content_sms').setLabel('📱 SMS Twitter US').setStyle(ButtonStyle.Danger)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tw_content_bio').setLabel('📝 Bio Twitter').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tw_content_caption').setLabel('💬 Légende Tweet').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tw_content_follow').setLabel('🐦 Follow Twitter').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tw_content_community').setLabel('👥 Communautés').setStyle(ButtonStyle.Secondary)
  );

  await channel.send({ embeds: [embed], components: [row1, row2] });
  console.log(`✅ Twitter Content Factory publié dans #${channel.name} (${channelId})`);
}

/**
 * Gère les clics sur les boutons du Content Factory Twitter
 */
async function handleTwitterContent(interaction) {
  const type = interaction.customId.replace('tw_content_', '');
  const meta = TW_CONTENT_LABELS[type];

  if (!meta) {
    return interaction.reply({ content: '❌ Option Twitter inconnue.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  if (type === 'sms') {
    return handleTwitterSMSRequest(interaction);
  }

  if (type === 'follow') {
    return handleTwitterFollowRequest(interaction, meta);
  }

  if (type === 'bio') {
    return handleTwitterBioRequest(interaction, meta);
  }

  if (type === 'caption') {
    return handleTwitterCaptionRequest(interaction, meta);
  }

  if (type === 'community') {
    return handleTwitterCommunityRequest(interaction, meta);
  }

  // Pour les médias (reels, post, cta) : sélection du Profile ID
  try {
    const profiles = await getAvailableProfiles();
    const idList = profiles.length > 0 ? profiles : ['ID 1'];

    const embed = new EmbedBuilder()
      .setColor(meta.color)
      .setTitle(`👨‍💻 Choix du Profil Twitter — ${meta.label}`)
      .setDescription(`Sélectionne le Profile ID pour lequel tu veux générer du contenu Twitter :`);

    const row = buildTwitterProfileSelectRow(type, idList, 0);
    return interaction.editReply({ embeds: [embed], components: [row] });
  } catch (err) {
    console.error('Erreur getAvailableProfiles Twitter:', err);
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xff0000).setTitle('❌ Erreur').setDescription(err.message)]
    });
  }
}

/**
 * Construction du menu de sélection de profil avec pagination interne
 */
function buildTwitterProfileSelectRow(type, profiles, page = 0) {
  const options = [];
  const totalProfiles = profiles.length;

  if (totalProfiles <= 25) {
    profiles.forEach(p => options.push({ label: p, value: p }));
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`tw_founder_select_${type}`)
      .setPlaceholder('Sélectionner Profile ID')
      .addOptions(options);
    return new ActionRowBuilder().addComponents(selectMenu);
  }

  let startIndex = 0;
  let countForPage = 23;
  if (page === 0) {
    startIndex = 0;
    countForPage = 24;
  } else {
    startIndex = 24 + (page - 1) * 23;
    countForPage = 23;
  }

  const pageItems = profiles.slice(startIndex, startIndex + countForPage);
  const hasPrev = page > 0;
  const hasNext = (startIndex + pageItems.length) < totalProfiles;

  if (hasPrev) {
    options.push({
      label: `⬅️ Page précédente (${page}/${Math.ceil((totalProfiles - 24) / 23) + 1})`,
      value: `page_${page - 1}`,
      description: 'Afficher les profils précédents',
    });
  }

  pageItems.forEach(p => {
    options.push({ label: p, value: p });
  });

  if (hasNext) {
    const nextStart = startIndex + pageItems.length;
    const nextEnd = Math.min(nextStart + 23, totalProfiles) - 1;
    options.push({
      label: `➡️ Page suivante (${profiles[nextStart]} à ${profiles[nextEnd]})...`,
      value: `page_${page + 1}`,
      description: 'Afficher les profils suivants',
    });
  }

  const firstItem = pageItems[0] || 'ID';
  const lastItem = pageItems[pageItems.length - 1] || 'ID';
  const placeholder = `Sélectionner Profile ID (${firstItem} à ${lastItem})`;

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`tw_founder_select_${type}`)
    .setPlaceholder(placeholder)
    .addOptions(options);

  return new ActionRowBuilder().addComponents(selectMenu);
}

/**
 * Gère la sélection d'un Profile ID pour Twitter
 */
async function handleTwitterFounderSelect(interaction) {
  await interaction.deferUpdate();
  const rawType = interaction.customId.replace('tw_founder_select_', '');
  const type = rawType.split('_')[0];
  const selected = interaction.values[0];

  if (selected.startsWith('page_')) {
    const targetPage = parseInt(selected.replace('page_', ''), 10);
    const profiles = await getAvailableProfiles();
    const idList = profiles.length > 0 ? profiles : ['ID 1'];
    const row = buildTwitterProfileSelectRow(type, idList, targetPage);
    return interaction.editReply({ components: [row] });
  }

  const profileId = selected;
  const meta = TW_CONTENT_LABELS[type] || { label: type, color: 0x1da1f2, emoji: '📦' };

  const embed = new EmbedBuilder()
    .setColor(meta.color)
    .setTitle(`${meta.emoji} Demande de ${meta.label} Twitter`)
    .setDescription(`Profil sélectionné : **${profileId}**\nCombien de fichiers différents veux-tu générer ?`);

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`tw_req_${type}_${profileId}`)
      .setPlaceholder('Sélectionner la quantité...')
      .addOptions([
        { label: '1 fichier', value: '1' },
        { label: '2 fichiers', value: '2' },
        { label: '3 fichiers', value: '3' },
        { label: '4 fichiers', value: '4' },
        { label: '5 fichiers', value: '5' },
      ])
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
}

/**
 * Gère la sélection de quantité et le traitement MultiMetaChanger
 */
async function handleTwitterContentSelect(interaction) {
  await interaction.deferUpdate();

  const parts = interaction.customId.split('_'); // ['tw', 'req', type, profileId...]
  const type = parts[2];
  const profileId = parts.slice(3).join('_');
  const qty = parseInt(interaction.values[0], 10);
  const meta = TW_CONTENT_LABELS[type] || { label: type, color: 0x1da1f2, emoji: '📦' };

  let stockRestant = 0;
  const processedFiles = [];

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xffff00)
        .setTitle('⏳ Traitement en cours...')
        .setDescription(`Génération de ${qty} fichier(s) via MultiMetaChanger pour **${profileId}**.\nCeci peut prendre quelques secondes.`)
    ],
    components: []
  });

  try {
    for (let i = 0; i < qty; i++) {
      // Fetch depuis le Drive (par profile_id)
      const driveData = await getFileForProfile(type, profileId, 'US');
      stockRestant = driveData.stockRestant;
      const localPath = driveData.localPath;
      const originalId = driveData.fileInfo.id;
      const isVideo = ['reels'].includes(type);

      // Traitement MultiMetaChanger
      const processedPath = await processFile(localPath, path.dirname(localPath), isVideo);
      processedFiles.push({ path: processedPath, originalId });

      // Clean original downloaded file
      if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    }

    const attachments = processedFiles.map(pf => new AttachmentBuilder(pf.path));

    const embed = new EmbedBuilder()
      .setColor(meta.color)
      .setTitle(`${meta.emoji} Tes ${meta.label} Twitter (${qty})`)
      .setDescription(`Voici tes fichiers uniques et distincts pour **${profileId}**.\n\n📦 **Stock restant :** ${stockRestant}`)
      .setFooter({ text: 'MultiMetaChanger appliqué avec succès' });

    await interaction.editReply({ embeds: [embed], files: attachments });

    // Nettoyage local
    for (const pf of processedFiles) {
      if (fs.existsSync(pf.path)) fs.unlinkSync(pf.path);
    }
  } catch (err) {
    console.error('Erreur Twitter Content Select:', err);
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xff0000).setTitle('❌ Erreur').setDescription(err.message)]
    });
  }
}

/**
 * Gère la demande de SMS Twitter US via SMSPool
 */
async function handleTwitterSMSRequest(interaction) {
  let balanceText = '';
  try {
    const balanceResult = await getBalance();
    if (balanceResult && balanceResult.success && balanceResult.balance !== undefined) {
      balanceText = `\n💰 **Solde SMSPool :** \`$${balanceResult.balance.toFixed(2)}\``;
    }
  } catch (e) {}

  const embed = new EmbedBuilder()
    .setColor(0xe0245e)
    .setTitle('📱 SMSPool — Numéro Twitter / X (USA)')
    .setDescription(`Obtiens un numéro temporaire USA (+1) pour créer ou vérifier un compte Twitter / X.${balanceText}\n\nClique sur le bouton ci-dessous pour réserver un numéro.`)
    .setFooter({ text: 'AVA Agency • SMSPool Twitter US' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('tw_smspool_get_number')
      .setLabel('📱 Obtenir un numéro Twitter (USA)')
      .setStyle(ButtonStyle.Danger)
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
}

/**
 * Gère la demande de Follows Twitter
 */
async function handleTwitterFollowRequest(interaction, meta) {
  try {
    const sourceChannelId = TW_CHANNELS.FOLLOW;
    const channel = await interaction.client.channels.fetch(sourceChannelId).catch(() => null);
    if (!channel) throw new Error(`Salon Comptes à suivre introuvable (${sourceChannelId}).`);

    const messages = await channel.messages.fetch({ limit: 100 });
    const allAccounts = new Set();

    const xLinkRegex = /(?:https?:\/\/)?(?:www\.)?(?:twitter|x)\.com\/([a-zA-Z0-9_]+)/gi;
    const atRegex = /@([a-zA-Z0-9_]+)/g;
    const dashRegex = /^[-*•]\s*@?([a-zA-Z0-9_]+)/gm;
    const plainRegex = /^@?([a-zA-Z0-9_]{3,20})$/gm;

    const reserved = new Set([
      'home', 'explore', 'notifications', 'messages', 'i', 'settings',
      'tos', 'privacy', 'intent', 'share', 'search', 'hashtag', 'login', 'signup'
    ]);

    messages.forEach(msg => {
      const text = msg.content;
      let m;

      // 1. Liens Twitter / X
      while ((m = xLinkRegex.exec(text)) !== null) {
        const u = m[1].trim();
        if (!reserved.has(u.toLowerCase()) && u.length >= 3) {
          allAccounts.add(u);
        }
      }

      // 2. Mentions @pseudo
      while ((m = atRegex.exec(text)) !== null) {
        const u = m[1].trim();
        if (!reserved.has(u.toLowerCase()) && u.length >= 3) {
          allAccounts.add(u);
        }
      }

      // 3. Tirets / listes
      while ((m = dashRegex.exec(text)) !== null) {
        const u = m[1].trim();
        if (!reserved.has(u.toLowerCase()) && u.length >= 3 && !u.includes('http')) {
          allAccounts.add(u);
        }
      }

      // 4. Lignes simples
      while ((m = plainRegex.exec(text)) !== null) {
        const u = m[1].trim();
        if (!reserved.has(u.toLowerCase()) && u.length >= 3 && !u.includes('http')) {
          allAccounts.add(u);
        }
      }
    });

    let arrAccounts = Array.from(allAccounts);

    if (arrAccounts.length === 0) {
      // Fallback si aucun handle n'a encore été posté
      arrAccounts = ['elonmusk', 'x', 'Creators', 'Support'];
    }

    // Tirer 5 comptes distincts au hasard
    const picked = [];
    const pool = [...arrAccounts];
    for (let i = 0; i < 5; i++) {
      if (pool.length === 0) break;
      const idx = Math.floor(Math.random() * pool.length);
      picked.push(pool[idx]);
      pool.splice(idx, 1);
    }

    const listText = picked.map(u => `• **@${u}** ([Ouvrir sur X](https://x.com/${u}))`).join('\n');
    const embed = new EmbedBuilder()
      .setColor(meta.color)
      .setTitle(`🐦 Comptes Twitter / X à Suivre`)
      .setDescription(`Voici **${picked.length}** compte(s) recommandés à follow :\n\n${listText}`)
      .setFooter({ text: 'AVA Agency • Twitter Follow Integration' });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('Erreur Follow Twitter:', err);
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xff0000).setTitle('❌ Erreur').setDescription(err.message)]
    });
  }
}

/**
 * Gère la génération de Bio Twitter unique
 */
async function handleTwitterBioRequest(interaction, meta) {
  try {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffff00)
          .setTitle('⏳ Génération en cours...')
          .setDescription(`Génération d'une **Bio Twitter** unique avec l'IA...\nCeci prend quelques secondes.`)
      ]
    });

    const sourceChannelId = TW_CHANNELS.BIO;
    const channel = await interaction.client.channels.fetch(sourceChannelId).catch(() => null);
    if (!channel) throw new Error(`Salon Bio introuvable (${sourceChannelId}).`);

    const messages = await channel.messages.fetch({ limit: 50 });
    const samples = messages
      .filter(m => !m.author.bot && m.content.trim().length > 5)
      .map(m => m.content.trim());

    const baseText = samples.length > 0
      ? samples[Math.floor(Math.random() * samples.length)]
      : "Sweet as honey, bad as hell ✨ 20yo Parisian living her best life 🌸";

    const uniqueBio = await generateTwitterText(baseText, 'bio');

    const embed = new EmbedBuilder()
      .setColor(meta.color)
      .setTitle(`📝 Ta Bio Twitter / X Unique`)
      .setDescription(`\`\`\`\n${uniqueBio}\n\`\`\``)
      .addFields({
        name: '📏 Longueur',
        value: `\`${uniqueBio.length} / 160 caractères\``,
        inline: true
      })
      .setFooter({ text: 'Généré par IA • Optimisé profil Twitter / X' });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('Erreur Bio Twitter:', err);
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xff0000).setTitle('❌ Erreur').setDescription(err.message)]
    });
  }
}

/**
 * Gère la génération de Légende (Tweet) unique
 */
async function handleTwitterCaptionRequest(interaction, meta) {
  try {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffff00)
          .setTitle('⏳ Génération en cours...')
          .setDescription(`Génération d'une **Légende Tweet** unique avec l'IA...\nCeci prend quelques secondes.`)
      ]
    });

    const sourceChannelId = TW_CHANNELS.CAPTION;
    const channel = await interaction.client.channels.fetch(sourceChannelId).catch(() => null);
    if (!channel) throw new Error(`Salon Légendes introuvable (${sourceChannelId}).`);

    const messages = await channel.messages.fetch({ limit: 50 });
    const samples = messages
      .filter(m => !m.author.bot && m.content.trim().length > 3)
      .map(m => m.content.trim());

    const baseText = samples.length > 0
      ? samples[Math.floor(Math.random() * samples.length)]
      : "Thinking about you... or maybe my next coffee ☕️ Tell me your plans tonight 💭";

    const uniqueCaption = await generateTwitterText(baseText, 'caption');

    const embed = new EmbedBuilder()
      .setColor(meta.color)
      .setTitle(`💬 Ton Tweet / Légende Unique`)
      .setDescription(`\`\`\`\n${uniqueCaption}\n\`\`\``)
      .setFooter({ text: 'Généré par IA • Optimisé viralité & engagement Twitter' });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('Erreur Légende Twitter:', err);
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xff0000).setTitle('❌ Erreur').setDescription(err.message)]
    });
  }
}

/**
 * Gère la récupération de Communautés Twitter
 */
async function handleTwitterCommunityRequest(interaction, meta) {
  try {
    const sourceChannelId = TW_CHANNELS.COMMUNITY;
    const channel = await interaction.client.channels.fetch(sourceChannelId).catch(() => null);
    if (!channel) throw new Error(`Salon Communautés introuvable (${sourceChannelId}).`);

    const messages = await channel.messages.fetch({ limit: 100 });
    const communities = [];
    const seen = new Set();

    messages.forEach(msg => {
      const lines = msg.content.split('\n');
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        // Détection lien communauté X : https://x.com/i/communities/12345...
        const commMatch = line.match(/(?:https?:\/\/)?(?:www\.)?(?:twitter|x)\.com\/i\/communities\/(\d+)/i);
        if (commMatch) {
          const url = `https://x.com/i/communities/${commMatch[1]}`;
          if (!seen.has(url)) {
            seen.add(url);
            let title = line.replace(commMatch[0], '').replace(/^[-*•:]+|\s*[-*•:]+$/g, '').trim();
            if (!title || title.length < 2) title = `Communauté #${commMatch[1]}`;
            communities.push({ title, url });
          }
          continue;
        }

        // Détection autre lien URL
        const urlMatch = line.match(/https?:\/\/[^\s]+/i);
        if (urlMatch) {
          const url = urlMatch[0];
          if (!seen.has(url)) {
            seen.add(url);
            let title = line.replace(url, '').replace(/^[-*•:]+|\s*[-*•:]+$/g, '').trim();
            if (!title) title = 'Rejoindre la communauté';
            communities.push({ title, url });
          }
          continue;
        }

        // Ligne textuelle
        if (line.length >= 3 && !seen.has(line)) {
          seen.add(line);
          communities.push({ title: line, url: null });
        }
      }
    });

    if (communities.length === 0) {
      throw new Error(`Aucune communauté répertoriée dans le salon <#${sourceChannelId}>.`);
    }

    // Tirer 3 à 5 communautés aléatoires
    const pool = [...communities];
    const pickedCount = Math.min(pool.length, 5);
    const picked = [];
    for (let i = 0; i < pickedCount; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      picked.push(pool[idx]);
      pool.splice(idx, 1);
    }

    const listText = picked.map(c => {
      if (c.url) {
        return `• [${c.title}](${c.url})`;
      }
      return `• **${c.title}**`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setColor(meta.color)
      .setTitle(`👥 Communautés Twitter / X à Rejoindre`)
      .setDescription(`Voici des communautés recommandées pour booster la visibilité :\n\n${listText}`)
      .setFooter({ text: 'AVA Agency • Twitter Communities' });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('Erreur Communautés Twitter:', err);
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xff0000).setTitle('❌ Erreur').setDescription(err.message)]
    });
  }
}

module.exports = {
  setupTwitterContentFactory,
  handleTwitterContent,
  handleTwitterFounderSelect,
  handleTwitterContentSelect,
  TW_CHANNELS,
};

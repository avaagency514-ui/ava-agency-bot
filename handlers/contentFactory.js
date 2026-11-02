const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');
const { getFileForProfile } = require('../services/drive');
const { processFile } = require('../services/metachanger');
const fs = require('fs');
const path = require('path');

const CONTENT_LABELS = {
  reels:        { emoji: '🎬', label: 'Reels', color: 0x00ff88 },
  post:         { emoji: '🖼️', label: 'Post', color: 0x00aaff },
  pp:           { emoji: '👤', label: 'Photo de Profil', color: 0x9b59b6 },
  cta:          { emoji: '🔗', label: 'CTA', color: 0xf39c12 },
  textbio:      { emoji: '📝', label: 'Bio', color: 0x3498db, col: 'A' },
  textstorycta: { emoji: '📣', label: 'Story CTA', color: 0x3498db, col: 'B' },
  textprofil:   { emoji: '👤', label: 'Profil Texte', color: 0x3498db, col: 'C' },
  followfr:     { emoji: '🇫🇷', label: 'Follow FR', color: 0x3498db },
};

/**
 * Gère les interactions avec les boutons de la Content Factory
 */
async function handleContentFactory(interaction) {
  const type = interaction.customId.replace('content_', '');

  if (['banger', 'sms', 'captionreel', 'legendsthreads', 'followus'].includes(type)) {
    return interaction.reply({ content: '❌ Cette option n\'est plus disponible (retirée).', ephemeral: true });
  }

  const meta = CONTENT_LABELS[type];
  if (!meta) {
    return interaction.reply({ content: '❌ Type de contenu inconnu.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  if (type.startsWith('text')) {
    return handleTextRequest(interaction, type, meta);
  }

  // Les Follows génèrent toujours 5 comptes
  if (type === 'followfr') {
    return handleFollowRequest(interaction, type, meta, 5);
  }

  // Pour les médias (reels, post, pp, cta), on demande à TOUS les utilisateurs de choisir un Profile ID
  const { getAvailableProfiles } = require('../services/drive');
  const profiles = await getAvailableProfiles();
  const idList = profiles.length > 0 ? profiles : ['ID 1'];
  
  const embed = new EmbedBuilder()
    .setColor(meta.color)
    .setTitle(`👨‍💻 Choix du Profil — ${meta.label}`)
    .setDescription(`Sélectionne le Profile ID pour lequel tu veux générer du contenu :`);

  const row = buildProfileSelectRow(type, idList, 0);
  
  return interaction.editReply({ embeds: [embed], components: [row] });
}

function buildProfileSelectRow(type, profiles, page = 0) {
  const options = [];
  const totalProfiles = profiles.length;

  if (totalProfiles <= 25) {
    profiles.forEach(p => options.push({ label: p, value: p }));
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`founder_select_${type}`)
      .setPlaceholder('Sélectionner Profile ID')
      .addOptions(options);
    return new ActionRowBuilder().addComponents(selectMenu);
  }

  // Si plus de 25 profils : pagination interne dans 1 seul menu déroulant
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
      description: 'Afficher les profils précédents'
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
      description: 'Afficher les profils suivants'
    });
  }

  const firstItem = pageItems[0] || 'ID';
  const lastItem = pageItems[pageItems.length - 1] || 'ID';
  const placeholder = `Sélectionner Profile ID (${firstItem} à ${lastItem})`;

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`founder_select_${type}`)
    .setPlaceholder(placeholder)
    .addOptions(options);

  return new ActionRowBuilder().addComponents(selectMenu);
}

/**
 * Gère la demande de textes générés par IA
 */
async function handleTextRequest(interaction, type, meta) {
  const { getRandomTextFromSheet } = require('../services/sheets');
  const { generateUniqueText } = require('../services/gemini');

  const market = 'FR';
  
  await interaction.editReply({ 
    embeds: [new EmbedBuilder().setColor(0xffff00).setTitle('⏳ Traitement en cours...').setDescription(`Génération du texte **${meta.label}** unique avec l'IA...\nCeci prend quelques secondes.`)]
  });

  try {
    // 1. Piocher la base dans Sheets
    const baseText = await getRandomTextFromSheet(market, meta.col);
    
    // 2. Générer le texte unique avec Gemini
    const uniqueText = await generateUniqueText(baseText, meta.label, market);
    
    // 3. Envoyer
    const embed = new EmbedBuilder()
      .setColor(meta.color)
      .setTitle(`${meta.emoji} Ton texte ${meta.label} unique`)
      .setDescription(`\`\`\`\n${uniqueText}\n\`\`\``)
      .setFooter({ text: 'Généré par IA' });
      
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error(`Erreur TextRequest (${type}):`, err);
    await interaction.editReply({ 
      embeds: [new EmbedBuilder().setColor(0xff0000).setTitle('❌ Erreur de génération').setDescription(err.message)]
    });
  }
}

/**
 * Gère la sélection de quantité (StringSelectMenu)
 */
async function handleContentSelect(interaction) {
  await interaction.deferUpdate();

  const parts = interaction.customId.split('_');
  const type = parts[1];
  const profileId = parts.slice(2).join('_');
  const qty = parseInt(interaction.values[0]);
  const meta = CONTENT_LABELS[type];

  if (!meta) {
    return interaction.editReply({ content: '❌ Option non disponible.', components: [] });
  }

  if (type === 'followfr') {
    return handleFollowRequest(interaction, type, meta, qty);
  }

  let stockRestant = 0;
  const processedFiles = [];
  
  // Message de progression
  await interaction.editReply({ 
    embeds: [new EmbedBuilder().setColor(0xffff00).setTitle('⏳ Traitement en cours...').setDescription(`Génération de ${qty} fichier(s) via MultiMetaChanger.\nCeci peut prendre quelques secondes.`)],
    components: []
  });

  try {
    for (let i = 0; i < qty; i++) {
      // 1. Fetch depuis le Drive (par profile_id). Cela tire un fichier aléatoire à chaque itération
      const market = 'FR';
      const driveData = await getFileForProfile(type, profileId, market);
      stockRestant = driveData.stockRestant;
      const localPath = driveData.localPath;
      const originalId = driveData.fileInfo.id;
      const isVideo = ['reels'].includes(type);

      // 2. Traitement MultiMetaChanger
      const processedPath = await processFile(localPath, path.dirname(localPath), isVideo);
      processedFiles.push({ path: processedPath, originalId: originalId });

      // Clean original downloaded file
      if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    }

    // 3. Envoyer les fichiers traités
    const attachments = processedFiles.map(pf => new AttachmentBuilder(pf.path));
    
    const embed = new EmbedBuilder()
      .setColor(meta.color)
      .setTitle(`${meta.emoji} Tes ${meta.label} (${qty})`)
      .setDescription(`Voici tes fichiers uniques et distincts pour **${profileId}**.\n\n📦 **Stock restant :** ${stockRestant}`)
      .setFooter({ text: 'MultiMetaChanger appliqué avec succès' });

    await interaction.editReply({ embeds: [embed], files: attachments });

    // 4. Nettoyage local
    for (const pf of processedFiles) {
      if (fs.existsSync(pf.path)) fs.unlinkSync(pf.path);
    }

  } catch (err) {
    console.error('Erreur Content Factory:', err);
    await interaction.editReply({ 
      embeds: [new EmbedBuilder().setColor(0xff0000).setTitle('❌ Erreur').setDescription(err.message)]
    });
  }
}

async function handleFounderSelect(interaction) {
  await interaction.deferUpdate();
  const rawType = interaction.customId.replace('founder_select_', '');
  const type = rawType.split('_')[0];
  const selected = interaction.values[0];

  // Si l'utilisateur clique sur "Page suivante" ou "Page précédente" dans le menu
  if (selected.startsWith('page_')) {
    const targetPage = parseInt(selected.replace('page_', ''), 10);
    const { getAvailableProfiles } = require('../services/drive');
    const profiles = await getAvailableProfiles();
    const idList = profiles.length > 0 ? profiles : ['ID 1'];
    const row = buildProfileSelectRow(type, idList, targetPage);
    return interaction.editReply({ components: [row] });
  }

  const profileId = selected;
  const meta = CONTENT_LABELS[type];

  const embed = new EmbedBuilder()
    .setColor(meta.color)
    .setTitle(`${meta.emoji} Demande de ${meta.label}`)
    .setDescription(`Profil sélectionné : **${profileId}**\nCombien de fichiers différents veux-tu générer ?`);

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`req_${type}_${profileId}`)
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

async function handleFollowRequest(interaction, type, meta, qty = 5) {
  try {
    const sourceChannelId = process.env.CHANNEL_FOLLOW_FR || '1565271829915115530';
    const channel = await interaction.client.channels.fetch(sourceChannelId).catch(() => null);
    if (!channel) throw new Error(`Salon ${meta.label} introuvable (${sourceChannelId}).`);

    const messages = await channel.messages.fetch({ limit: 100 });
    const allAccounts = new Set();

    const igLinkRegex = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]+)/g;
    const atRegex = /\@([a-zA-Z0-9_.]+)/g;
    const dashRegex = /^-\s+([a-zA-Z0-9_.]+)/gm;
    const plainRegex = /^([a-zA-Z0-9_.]+)\s*$/gm;

    messages.forEach(msg => {
      const text = msg.content;
      let m;
      let matched = false;

      // 1. Liens Instagram directs (ex: https://www.instagram.com/pseudo?...)
      while ((m = igLinkRegex.exec(text)) !== null) {
        const u = m[1].trim();
        if (!['p', 'reel', 'stories', 'explore', 'direct'].includes(u.toLowerCase()) && u.length > 1) {
          allAccounts.add(u);
          matched = true;
        }
      }

      // 2. Mentions @pseudo
      while ((m = atRegex.exec(text)) !== null) {
        allAccounts.add(m[1].trim());
        matched = true;
      }

      // 3. Tirets - pseudo
      while ((m = dashRegex.exec(text)) !== null) {
        allAccounts.add(m[1].trim());
        matched = true;
      }

      // 4. Pseudos bruts par ligne
      if (!matched) {
        while ((m = plainRegex.exec(text)) !== null) {
          const u = m[1].trim();
          if (u.length > 2 && !u.includes('http')) allAccounts.add(u);
        }
      }
    });

    const arrAccounts = Array.from(allAccounts);

    if (arrAccounts.length === 0) {
      throw new Error(`Aucun compte trouvé dans le salon ${meta.label}.`);
    }

    // Sélection aléatoire de qty comptes distincts
    const picked = [];
    for (let i = 0; i < qty; i++) {
      if (arrAccounts.length === 0) break;
      const idx = Math.floor(Math.random() * arrAccounts.length);
      picked.push(arrAccounts[idx]);
      arrAccounts.splice(idx, 1);
    }

    const listText = picked.map(u => `• \`${u}\` ([Ouvrir](https://www.instagram.com/${u}/))`).join('\n');
    const embed = new EmbedBuilder()
      .setColor(meta.color)
      .setTitle(`${meta.emoji} Comptes à follow (${meta.label})`)
      .setDescription(`Voici ${picked.length} compte(s) Instagram à suivre :\n\n${listText}`);

    await interaction.editReply({ embeds: [embed], components: [] });
  } catch (err) {
    console.error(`Erreur FollowRequest (${type}):`, err);
    await interaction.editReply({ 
      embeds: [new EmbedBuilder().setColor(0xff0000).setTitle('❌ Erreur').setDescription(err.message)],
      components: []
    });
  }
}

module.exports = { handleContentFactory, handleContentSelect, handleFounderSelect };

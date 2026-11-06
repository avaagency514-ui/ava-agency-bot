const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');
const { getFileForProfile } = require('../services/drive');
const { processFile } = require('../services/metachanger');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const CONTENT_LABELS = {
  reels:        { emoji: '🎬', label: 'Reels', color: 0x00ff88 },
  reelscaption: { emoji: '🎬', label: 'Reels avec Caption', color: 0x9b59b6 },
  post:         { emoji: '🖼️', label: 'Post', color: 0x00aaff },
  pp:           { emoji: '👤', label: 'Photo de Profil', color: 0x9b59b6 },
  cta:          { emoji: '🔗', label: 'CTA', color: 0xf39c12 },
  sms:          { emoji: '📱', label: 'SMS', color: 0xe74c3c },
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

  if (['banger', 'captionreel', 'legendsthreads', 'followus'].includes(type)) {
    return interaction.reply({ content: '❌ Cette option n\'est plus disponible (retirée).', ephemeral: true });
  }

  const meta = CONTENT_LABELS[type];
  if (!meta) {
    return interaction.reply({ content: '❌ Type de contenu inconnu.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  if (type === 'sms') {
    return handleSMSRequest(interaction);
  }

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

function getMarketFromInteraction(interaction) {
  const chId = interaction.channelId;
  const chName = interaction.channel?.name?.toLowerCase() || '';
  if (chName.includes('us') || chName.includes('usa')) {
    return 'US';
  }
  if (chName.includes('fr')) {
    return 'FR';
  }
  const isUs = (process.env.CHANNEL_CONTENT_US && chId === process.env.CHANNEL_CONTENT_US) ||
               (process.env.CHANNEL_CONTENT_US_MOBILE && chId === process.env.CHANNEL_CONTENT_US_MOBILE);
  return isUs ? 'US' : 'FR';
}

/**
 * Gère la demande de SMS via SMSPool
 */
async function handleSMSRequest(interaction) {
  const { getBalance } = require('../services/smspool');
  let balanceText = '';
  try {
    const balanceResult = await getBalance();
    if (balanceResult && balanceResult.success && balanceResult.balance !== undefined) {
      balanceText = `\n💰 **Solde SMSPool :** \`$${balanceResult.balance.toFixed(2)}\``;
    }
  } catch (e) {}

  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('📱 SMSPool — Numéro Instagram US')
    .setDescription(`Obtiens un numéro temporaire USA (+1) pour créer ou vérifier un compte Instagram.${balanceText}\n\nClique sur le bouton ci-dessous pour réserver un numéro.`)
    .setFooter({ text: 'AVA Agency • SMSPool Integration' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('smspool_get_number').setLabel('📱 Obtenir un numéro IG (USA)').setStyle(ButtonStyle.Danger)
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
}

/**
 * Gère la demande de textes générés par IA
 */
async function handleTextRequest(interaction, type, meta) {
  const { getRandomTextFromSheet } = require('../services/sheets');
  const { generateUniqueText } = require('../services/gemini');

  const market = getMarketFromInteraction(interaction);
  
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

  // 🎬 Reels avec Caption
  if (type === 'reelscaption') {
    return handleReelsCaptionSelect(interaction, profileId, qty, meta);
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
      const market = getMarketFromInteraction(interaction);
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

// ─────────────────────────────────────────────────────────────────────────────
// 🎬 GÉNÉRER UN REEL AVEC CAPTION
// ─────────────────────────────────────────────────────────────────────────────

const CAPTION_REEL_CHANNEL_ID = process.env.CHANNEL_CAPTION_REEL_ID || '1565272928608583760';

/**
 * Récupère un pool de captions depuis #caption-reel, les mélange aléatoirement
 * et renvoie `count` captions distinctes pour garantir que chaque vidéo a sa propre caption.
 */
async function getCaptionsPool(client, count = 1) {
  const channel = await client.channels.fetch(CAPTION_REEL_CHANNEL_ID).catch(() => null);
  if (!channel) throw new Error(`Salon #caption-reel (${CAPTION_REEL_CHANNEL_ID}) introuvable.`);

  // Récupérer jusqu'à 100 messages récents (incluant ceux du bot !)
  const messages = await channel.messages.fetch({ limit: 100 });
  const pool = [];

  messages.forEach(m => {
    const text = m.content?.trim();
    if (
      text &&
      text.length >= 8 &&
      !text.startsWith('http') &&
      !text.startsWith('❌') &&
      !text.startsWith('🔍') &&
      !text.startsWith('✅') &&
      !text.includes('===CAPTION===')
    ) {
      pool.push(text);
    }
  });

  if (pool.length === 0) {
    throw new Error('Aucune caption exploitable trouvée dans #caption-reel.');
  }

  // Mélange aléatoire (Fisher-Yates shuffle) pour varier à chaque clic
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // Sélection de `count` captions uniques
  const selected = [];
  for (let i = 0; i < count; i++) {
    selected.push(pool[i % pool.length]);
  }
  return selected;
}

/**
 * Découpe le texte en lignes de 22-24 caractères maximum
 * afin d'éviter tout débordement sur les vidéos verticales (format 9:16).
 * Utilise \N (saut de ligne ASS) pour que chaque ligne soit centrée individuellement.
 */
function wrapTextForAss(text, maxChars = 24) {
  const clean = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  const words = clean.split(' ').filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    if ((current + (current ? ' ' : '') + word).length <= maxChars) {
      current += (current ? ' ' : '') + word;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.join('\\N');
}

/**
 * Résout le chemin de ffmpeg dans le projet
 */
function getFfmpegPath() {
  const local = path.join(__dirname, '../multimetachanger/ffmpeg.exe');
  if (fs.existsSync(local)) return local;
  return 'ffmpeg'; // fallback PATH
}

/**
 * Génère un fichier .ass avec le style exact de la capture :
 * - Texte blanc gras
 * - Contour noir épais (5.5px)
 * - Centré individuellement pour chaque ligne (Alignment: 2)
 * - Positionné dans le bas / tiers inférieur (MarginV: 320)
 * - Échelle adaptative (PlayRes 1080x1920)
 */
function createAssSubtitleFile(assPath, captionText) {
  const wrapped = wrapTextForAss(captionText, 24);

  const assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,56,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,5.5,0,2,80,80,320,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:10:00.00,Default,,0,0,0,,${wrapped}
`;

  fs.writeFileSync(assPath, assContent, 'utf8');
}

/**
 * Compression rapide d'une vidéo si > 24 Mo pour respecter la limite Discord
 */
function compressVideo(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = getFfmpegPath();
    execFile(ffmpegPath, [
      '-y', '-i', inputPath,
      '-c:v', 'libx264', '-crf', '28', '-preset', 'fast',
      '-c:a', 'copy', '-movflags', '+faststart',
      outputPath
    ], { timeout: 120000 }, (err) => {
      if (err) reject(new Error(`Compression échouée : ${err.message}`));
      else resolve();
    });
  });
}

/**
 * Injecte une caption dans une vidéo via ffmpeg avec sous-titres ASS (style TikTok caption)
 * @param {string} inputPath - Chemin de la vidéo source
 * @param {string} outputPath - Chemin de sortie
 * @param {string} captionText - Texte de la caption
 * @param {string} workDir - Dossier de travail
 * @returns {Promise<void>}
 */
function injectCaptionIntoVideo(inputPath, outputPath, captionText, workDir) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = getFfmpegPath();
    const assPath = path.join(workDir, `caption_${Date.now()}_${Math.floor(Math.random() * 1000)}.ass`);

    try {
      createAssSubtitleFile(assPath, captionText);
    } catch (e) {
      return reject(new Error(`Impossible de créer le fichier sous-titres : ${e.message}`));
    }

    const escapedAssPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    const filter = `ass='${escapedAssPath}'`;

    const args = [
      '-y',
      '-i', inputPath,
      '-vf', filter,
      '-c:v', 'libx264',
      '-crf', '23',
      '-preset', 'fast',
      '-c:a', 'copy',
      '-movflags', '+faststart',
      outputPath
    ];

    console.log(`🎬 ffmpeg libass render : ${captionText.slice(0, 60)}...`);

    execFile(ffmpegPath, args, { timeout: 120000 }, (err, stdout, stderr) => {
      // Nettoyage immédiat du fichier ASS
      try { if (fs.existsSync(assPath)) fs.unlinkSync(assPath); } catch (_) {}

      if (err) {
        console.error('❌ ffmpeg stderr:', stderr?.slice(-500));
        return reject(new Error(`ffmpeg échoué : ${err.message}`));
      }
      resolve();
    });
  });
}

/**
 * Gère la génération de Reels avec Caption après sélection du Profile ID et de la quantité
 */
async function handleReelsCaptionSelect(interaction, profileId, qty, meta) {
  let stockRestant = 0;
  const processedFiles = [];
  const usedCaptions = [];

  await interaction.editReply({ 
    embeds: [new EmbedBuilder()
      .setColor(0xffff00)
      .setTitle('⏳ Génération en cours...')
      .setDescription(`🎬 Génération de ${qty} Reel(s) avec Caption pour **${profileId}**...\n📥 Récupération des captions uniques depuis #caption-reel...\nCeci peut prendre quelques secondes.`)
    ],
    components: []
  });

  try {
    // 1. Récupérer qty captions distinctes
    const captions = await getCaptionsPool(interaction.client, qty);

    for (let i = 0; i < qty; i++) {
      const caption = captions[i];
      usedCaptions.push(caption);

      // Fetch vidéo Drive (type 'reels')
      const market = getMarketFromInteraction(interaction);
      const driveData = await getFileForProfile('reels', profileId, market);
      stockRestant = driveData.stockRestant;
      const inputPath = driveData.localPath;
      const workDir = path.dirname(inputPath);
      const outputPath = path.join(workDir, `reel_caption_${Date.now()}_${i}.mp4`);

      // Injecter la caption dans la vidéo
      await injectCaptionIntoVideo(inputPath, outputPath, caption, workDir);

      // Clean raw input file
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);

      // Vérification taille (limite 24 Mo Discord)
      const MAX_SIZE = 24 * 1024 * 1024;
      let finalPath = outputPath;
      const size = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0;
      if (size > MAX_SIZE) {
        const compressedPath = path.join(workDir, `compressed_${Date.now()}_${i}.mp4`);
        await compressVideo(outputPath, compressedPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        finalPath = compressedPath;
      }

      processedFiles.push({ path: finalPath, caption });
    }

    // 2. Envoyer les fichiers
    const attachments = processedFiles.map((pf, idx) => 
      new AttachmentBuilder(pf.path, { name: `reel_caption_${profileId.replace(/\s+/g, '_')}_${idx + 1}.mp4` })
    );

    const captionSummary = usedCaptions
      .map((c, idx) => `**Reel ${idx + 1} :**\n> ${c.slice(0, 150)}${c.length > 150 ? '...' : ''}`)
      .join('\n\n');

    const embed = new EmbedBuilder()
      .setColor(meta.color)
      .setTitle(`${meta.emoji} Tes ${meta.label} (${qty}) — ${profileId}`)
      .setDescription(`Voici tes vidéos prêtes avec captions distinctes pour **${profileId}** :\n\n${captionSummary.slice(0, 3800)}\n\n📦 **Stock restant :** ${stockRestant}`)
      .setFooter({ text: 'Sous-titres ASS style TikTok/Instagram • Caption unique par vidéo' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed], files: attachments });

    // 3. Nettoyage
    for (const pf of processedFiles) {
      if (fs.existsSync(pf.path)) try { fs.unlinkSync(pf.path); } catch (_) {}
    }

  } catch (err) {
    console.error('Erreur handleReelsCaptionSelect:', err);
    await interaction.editReply({ 
      embeds: [new EmbedBuilder().setColor(0xff0000).setTitle('❌ Erreur de génération').setDescription(err.message)]
    });
  }
}

/**
 * Ouvre le menu de choix du Profile ID pour "🎬 Générer un Reel (Caption)"
 */
async function handleReelCaptionInit(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const meta = CONTENT_LABELS.reelscaption;
  const { getAvailableProfiles } = require('../services/drive');
  const profiles = await getAvailableProfiles();
  const idList = profiles.length > 0 ? profiles : ['ID 1'];

  const embed = new EmbedBuilder()
    .setColor(meta.color)
    .setTitle(`👨‍💻 Choix du Profil — ${meta.label}`)
    .setDescription(`Sélectionne le Profile ID pour lequel tu veux générer des Reels avec Caption :`);

  const row = buildProfileSelectRow('reelscaption', idList, 0);
  return interaction.editReply({ embeds: [embed], components: [row] });
}

// Alias de rétrocompatibilité
const handleGenerateReel = handleReelCaptionInit;

module.exports = { 
  handleContentFactory, 
  handleContentSelect, 
  handleFounderSelect, 
  handleGenerateReel,
  handleReelCaptionInit 
};

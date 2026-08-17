const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');
const { getFileForProfile, deleteFile } = require('../services/drive');
const { processFile } = require('../services/metachanger');
const { sendSMS, getBalance } = require('../services/smspool');
const { vaQueries, igQueries } = require('../database/db');
const fs = require('fs');
const path = require('path');

const CONTENT_LABELS = {
  reels:  { emoji: '🎬', label: 'Reels', color: 0x00ff88 },
  banger: { emoji: '🔥', label: 'Banger', color: 0xff4400 },
  post:   { emoji: '🖼️', label: 'Post', color: 0x00aaff },
  pp:     { emoji: '👤', label: 'Photo de Profil', color: 0x9b59b6 },
  cta:    { emoji: '🔗', label: 'CTA', color: 0xf39c12 },
  sms:    { emoji: '📱', label: 'SMS', color: 0xe74c3c },
  textbio: { emoji: '📝', label: 'Bio', color: 0x3498db, col: 'A' },
  textstorycta: { emoji: '📣', label: 'Story CTA', color: 0x3498db, col: 'B' },
  textprofil: { emoji: '👤', label: 'Profil Texte', color: 0x3498db, col: 'C' },
};

/**
 * Gère les interactions avec les boutons de la Content Factory
 */
async function handleContentFactory(interaction) {
  const type = interaction.customId.replace('content_', '');
  const meta = CONTENT_LABELS[type];

  await interaction.deferReply({ ephemeral: true });

  if (!meta) return interaction.editReply({ content: '❌ Type de contenu inconnu.' });

  if (type === 'sms') {
    return handleSMSRequest(interaction);
  }

  // Trouver le VA associé à cet utilisateur
  const va = vaQueries.getByDiscordId.get(interaction.user.id);
  const isFounder = interaction.member && interaction.member.roles.cache.has(process.env.ROLE_FUNDER_ID);
  
  let profileId = null;

  if (va) {
    const comptes = igQueries.getByVa.all(va.id);
    if (comptes.length && comptes[0].profile_id) {
      profileId = comptes[0].profile_id;
    }
  }

  if (!profileId) {
    if (isFounder) {
      if (type.startsWith('text') || type === 'sms') {
        profileId = "ID 1"; // Fallback indolore pour texte/sms
      } else {
        const { getAvailableProfiles } = require('../services/drive');
        const profiles = await getAvailableProfiles();
        const idOptions = profiles.length > 0 
          ? profiles.map(p => ({ label: p, value: p }))
          : [{ label: 'ID 1', value: 'ID 1' }];
        const limitedIdOptions = idOptions.slice(0, 25);
        
        const embed = new EmbedBuilder()
          .setColor(meta.color)
          .setTitle(`👨‍💻 Mode Fondateur — ${meta.label}`)
          .setDescription(`Sélectionne le Profile ID pour lequel tu veux générer du contenu :`);

        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`founder_select_${type}`)
            .setPlaceholder('Sélectionner Profile ID')
            .addOptions(limitedIdOptions)
        );
        
        return interaction.editReply({ embeds: [embed], components: [row] });
      }
    } else {
      if (!va) {
        return interaction.editReply({ content: '❌ Tu n\'es enregistré comme VA sur aucun salon.' });
      }
      return interaction.editReply({ content: `❌ Ton compte IG ou Profile ID n'est pas configuré. Demande à un manager d'utiliser \`/acc\` dans ton salon.` });
    }
  }

  if (type.startsWith('text')) {
    return handleTextRequest(interaction, type, meta);
  }

  // Afficher le menu de sélection de quantité
  const embed = new EmbedBuilder()
    .setColor(meta.color)
    .setTitle(`${meta.emoji} Demande de ${meta.label}`)
    .setDescription(`Profil détecté : **${profileId}**\nCombien de fichiers différents veux-tu générer ?`);

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

/**
 * Gère la demande de textes générés par IA
 */
async function handleTextRequest(interaction, type, meta) {
  const { getRandomTextFromSheet } = require('../services/sheets');
  const { generateUniqueText } = require('../services/gemini');

  const market = interaction.channelId === process.env.CHANNEL_CONTENT_US ? 'US' : 'FR';
  
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
      .setFooter({ text: 'Généré par Gemini IA' });
      
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
  await interaction.deferUpdate(); // Indiquer qu'on traite

  const parts = interaction.customId.split('_');
  const type = parts[1];
  const profileId = parts.slice(2).join('_');
  const qty = parseInt(interaction.values[0]);
  const meta = CONTENT_LABELS[type];

  let stockRestant = 0;
  const processedFiles = [];
  
  // Message de progression
  await interaction.editReply({ 
    embeds: [new EmbedBuilder().setColor(0xffff00).setTitle('⏳ Traitement en cours...').setDescription(`Génération de ${qty} fichier(s) via MultiMetaChanger.\nCeci peut prendre quelques secondes.`)],
    components: []
  });

  try {
    for (let i = 0; i < qty; i++) {
      let localPath = null;
      let isVideo = false;
      let originalId = null;

      if (type === 'banger') {
        const channelBanger = process.env.CHANNEL_BANGER;
        const channel = await interaction.client.channels.fetch(channelBanger).catch(() => null);
        if (!channel) throw new Error("Salon Banger introuvable.");
        
        const messages = await channel.messages.fetch({ limit: 50 });
        const msgsWithAttachments = messages.filter(m => m.attachments.size > 0);
        if (msgsWithAttachments.size === 0) throw new Error("Aucun Banger disponible dans le salon dédié.");
        
        // Prendre un message aléatoire à chaque itération pour avoir des fichiers différents
        const randomMsg = msgsWithAttachments.random();
        const attachment = randomMsg.attachments.first();
        stockRestant = msgsWithAttachments.size - 1;
        originalId = attachment.id;
        isVideo = attachment.contentType && attachment.contentType.startsWith('video');

        // Télécharger depuis Discord
        const tempDir = path.join(__dirname, '../temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        localPath = path.join(tempDir, `${Date.now()}_${attachment.name}`);
        
        const axios = require('axios');
        const response = await axios({ url: attachment.url, method: 'GET', responseType: 'stream' });
        const writer = fs.createWriteStream(localPath);
        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });

      } else {
        // 1. Fetch depuis le Drive (par profile_id). Cela tire un fichier aléatoire à chaque itération
        const market = interaction.channelId === process.env.CHANNEL_CONTENT_US ? 'US' : 'FR';
        const driveData = await getFileForProfile(type, profileId, market);
        stockRestant = driveData.stockRestant;
        localPath = driveData.localPath;
        originalId = driveData.fileInfo.id;
        isVideo = ['reels'].includes(type);
      }

      // 2. Traitement MultiMetaChanger
      const { processFile } = require('../services/metachanger');
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

/**
 * Gère la demande de SMS via SMSPool
 */
async function handleSMSRequest(interaction) {
  const balanceResult = await getBalance();
  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('📱 SMSPool — Instagram')
    .setDescription('Obtiens un numéro temporaire pour Instagram.');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('smspool_get_number').setLabel('📱 Obtenir un numéro IG').setStyle(ButtonStyle.Danger)
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
}

async function handleFounderSelect(interaction) {
  await interaction.deferUpdate();
  const type = interaction.customId.replace('founder_select_', '');
  const profileId = interaction.values[0];
  const meta = CONTENT_LABELS[type];

  const embed = new EmbedBuilder()
    .setColor(meta.color)
    .setTitle(`${meta.emoji} Demande de ${meta.label}`)
    .setDescription(`Profil sélectionné (Fondateur) : **${profileId}**\nCombien de fichiers différents veux-tu générer ?`);

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

module.exports = { handleContentFactory, handleContentSelect, handleFounderSelect };

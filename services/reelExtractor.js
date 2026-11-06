/**
 * services/reelExtractor.js
 * Service d'extraction automatique des textes et accroches (hooks) incrustés
 * dans les Reels Instagram / TikTok / vidéos postés dans #reel-scrapper.
 */

const { execFile } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const execFilePromise = util.promisify(execFile);

const { reelQueries } = require('../database/db');
const { extractHookFromFramePaths } = require('./gemini');

// ID des salons Discord
const CHANNEL_REEL_SCRAPPER_ID = '1568157699529773156'; // Salon source d'input
const CHANNEL_CAPTION_REEL_ID   = '1565272928608583760'; // Salon destination d'output

// Répertoire de travail temporaire
const BASE_TEMP_DIR = path.join(__dirname, '../temp/reels');
if (!fs.existsSync(BASE_TEMP_DIR)) {
  fs.mkdirSync(BASE_TEMP_DIR, { recursive: true });
}

/**
 * Retourne le chemin de l'exécutable ffmpeg (support local Windows + conteneur Linux)
 */
function getFfmpegPath() {
  if (process.platform === 'win32') {
    const localFfmpeg = path.join(__dirname, '..', 'multimetachanger', 'ffmpeg.exe');
    if (fs.existsSync(localFfmpeg)) return localFfmpeg;
  }
  return 'ffmpeg';
}

/**
 * Normalise un identifiant unique (clé anti-doublon) pour un Reel ou une vidéo
 */
function normalizeMediaKey(inputUrl) {
  try {
    const parsed = new URL(inputUrl);
    // Cas Instagram Reel ou Post (/reel/SHORTCODE/ ou /p/SHORTCODE/)
    const igMatch = parsed.pathname.match(/\/(?:reel|p|reels)\/([a-zA-Z0-9_-]+)/i);
    if (igMatch && igMatch[1]) {
      return `ig_${igMatch[1]}`;
    }

    // Cas TikTok (/video/123456789)
    const ttMatch = parsed.pathname.match(/\/video\/(\d+)/i);
    if (ttMatch && ttMatch[1]) {
      return `tt_${ttMatch[1]}`;
    }

    // URL générale sans paramètres de tracking
    return `${parsed.hostname}${parsed.pathname}`;
  } catch (e) {
    // Si ce n'est pas une URL standard, on hache ou nettoie la chaîne
    return inputUrl.split('?')[0].trim();
  }
}

/**
 * Télécharge un fichier depuis une URL directe (ex: pièce jointe Discord)
 */
async function downloadDirectFile(url, destPath) {
  const writer = fs.createWriteStream(destPath);
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
    timeout: 30000,
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

/**
 * Télécharge une vidéo via yt-dlp
 */
async function downloadWithYtDlp(videoUrl, outputTemplate) {
  const args = [
    '--no-warnings',
    '--no-playlist',
    '--no-check-certificates',
    '--socket-timeout', '25',
    '-f', 'b[ext=mp4]/b/best',
    '--max-filesize', '50M',
    '-o', outputTemplate,
    videoUrl
  ];

  console.log(`📥 Lancement du téléchargement yt-dlp pour: ${videoUrl}`);
  const { stdout, stderr } = await execFilePromise('yt-dlp', args, { timeout: 60000 });
  return stdout;
}

/**
 * Extrait 3 à 4 images clés des premières secondes d'une vidéo avec ffmpeg
 */
async function extractFramesFromVideo(videoPath, outputDir) {
  const ffmpeg = getFfmpegPath();
  const outputPattern = path.join(outputDir, 'frame_%02d.jpg');

  // Extraction de 1 frame par seconde sur les 4 premières secondes
  const args = [
    '-y',
    '-i', videoPath,
    '-vf', 'fps=1',
    '-vframes', '4',
    '-q:v', '2',
    outputPattern
  ];

  console.log(`🎬 Extraction des frames via ffmpeg (${ffmpeg}) depuis: ${videoPath}`);
  await execFilePromise(ffmpeg, args, { timeout: 30000 });

  const generatedFrames = fs.readdirSync(outputDir)
    .filter(f => f.startsWith('frame_') && f.endsWith('.jpg'))
    .sort()
    .map(f => path.join(outputDir, f));

  return generatedFrames;
}

/**
 * Traite un élément média unique (URL ou pièce jointe)
 */
async function processSingleMediaItem({ mediaUrl, isAttachment, attachmentName, author, channelId, client }) {
  const mediaKey = normalizeMediaKey(isAttachment ? (attachmentName || mediaUrl) : mediaUrl);

  // 1. Vérification anti-doublon en base de données
  const existing = reelQueries.getByKey(mediaKey);
  if (existing) {
    console.log(`ℹ️ Média déjà traité en base pour la clé: ${mediaKey}`);
    return {
      status: 'duplicate',
      key: mediaKey,
      text: existing.extracted_text,
      createdAt: existing.created_at
    };
  }

  // 2. Préparation du dossier de travail temporaire
  const workDir = path.join(BASE_TEMP_DIR, `reel_${Date.now()}_${Math.random().toString(36).substring(7)}`);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    const videoPath = path.join(workDir, 'video.mp4');

    if (isAttachment) {
      await downloadDirectFile(mediaUrl, videoPath);
    } else {
      const outputTmpl = path.join(workDir, 'video.%(ext)s');
      await downloadWithYtDlp(mediaUrl, outputTmpl);

      // Trouver le fichier vidéo téléchargé
      const downloadedFiles = fs.readdirSync(workDir).filter(f => !f.startsWith('frame_'));
      if (downloadedFiles.length === 0) {
        throw new Error('Le téléchargement de la vidéo n\'a produit aucun fichier.');
      }
      fs.renameSync(path.join(workDir, downloadedFiles[0]), videoPath);
    }

    // 3. Extraction des frames clés
    const frames = await extractFramesFromVideo(videoPath, workDir);
    if (!frames || frames.length === 0) {
      throw new Error('Impossible d\'extraire les images de la vidéo.');
    }

    // 4. Analyse OCR Vision avec Gemini 3.5 Flash
    const extractedHook = await extractHookFromFramePaths(frames);

    if (!extractedHook || extractedHook.trim().length === 0) {
      return {
        status: 'no_text',
        key: mediaKey
      };
    }

    const cleanHook = extractedHook.trim();

    // 5. Sauvegarde en base de données
    try {
      reelQueries.save({
        source_key: mediaKey,
        extracted_text: cleanHook,
        author_id: author?.id || null,
        author_tag: author?.tag || author?.username || null,
        channel_id: channelId || null,
      });
    } catch (dbErr) {
      console.warn('⚠️ Erreur enregistrement SQLite scraped_reels:', dbErr.message);
    }

    // 6. Publication du hook dans le salon #caption-reel
    try {
      const captionChannel = await client.channels.fetch(CHANNEL_CAPTION_REEL_ID);
      if (captionChannel && captionChannel.isTextBased()) {
        await captionChannel.send(cleanHook);
        console.log(`✅ Hook publié avec succès dans #caption-reel: "${cleanHook}"`);
      } else {
        console.warn(`⚠️ Salon #caption-reel (${CHANNEL_CAPTION_REEL_ID}) introuvable ou non textuel.`);
      }
    } catch (sendErr) {
      console.error(`❌ Échec de l'envoi dans #caption-reel:`, sendErr.message);
    }

    return {
      status: 'success',
      key: mediaKey,
      text: cleanHook
    };

  } finally {
    // 7. Nettoyage immédiat du dossier temporaire
    try {
      if (fs.existsSync(workDir)) {
        fs.rmSync(workDir, { recursive: true, force: true });
      }
    } catch (cleanupErr) {
      console.warn('⚠️ Erreur nettoyage workDir:', cleanupErr.message);
    }
  }
}

/**
 * Traite un message reçu dans le salon #reel-scrapper
 */
async function processReelScrapperMessage(message, client) {
  // Détecter les URLs dans le message
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  const urls = (message.content.match(urlRegex) || []).filter(url => {
    return /instagram\.com|tiktok\.com|youtube\.com|youtu\.be|x\.com|twitter\.com/i.test(url) ||
           /\.(mp4|mov|webm)$/i.test(url.split('?')[0]);
  });

  // Détecter les vidéos en pièce jointe
  const videoAttachments = message.attachments.filter(att => {
    return (att.contentType && att.contentType.startsWith('video/')) ||
           /\.(mp4|mov|webm|avi|mkv)$/i.test(att.name || '');
  });

  if (urls.length === 0 && videoAttachments.size === 0) {
    return;
  }

  // Poser la réaction d'attente
  try {
    await message.react('⏳');
  } catch (e) {
    // Ignore si manque de permissions
  }

  const results = [];

  // Traiter les URLs détectées
  for (const url of urls) {
    try {
      const res = await processSingleMediaItem({
        mediaUrl: url,
        isAttachment: false,
        attachmentName: null,
        author: message.author,
        channelId: message.channelId,
        client
      });
      results.push({ item: url, ...res });
    } catch (err) {
      console.error(`❌ Erreur traitement URL ${url}:`, err.message);
      results.push({ item: url, status: 'error', error: err.message });
    }
  }

  // Traiter les pièces jointes vidéo
  for (const [, att] of videoAttachments) {
    try {
      const res = await processSingleMediaItem({
        mediaUrl: att.url,
        isAttachment: true,
        attachmentName: att.name,
        author: message.author,
        channelId: message.channelId,
        client
      });
      results.push({ item: att.name, ...res });
    } catch (err) {
      console.error(`❌ Erreur traitement pièce jointe ${att.name}:`, err.message);
      results.push({ item: att.name, status: 'error', error: err.message });
    }
  }

  // Mettre à jour les réactions et envoyer le résumé
  try {
    const hasSuccess = results.some(r => r.status === 'success' || r.status === 'duplicate');
    const hasError = results.some(r => r.status === 'error');
    const onlyNoText = results.every(r => r.status === 'no_text');

    // Nettoyer la réaction sablier
    try {
      const userReactions = message.reactions.resolve('⏳');
      if (userReactions) await userReactions.users.remove(client.user.id);
    } catch (e) {}

    if (hasSuccess) {
      await message.react('✅');
    } else if (onlyNoText) {
      await message.react('⚠️');
    } else if (hasError) {
      await message.react('❌');
    }

    // Réponse de synthèse pour le salon #reel-scrapper
    const lines = [];
    for (const r of results) {
      if (r.status === 'success') {
        lines.push(`✅ **Hook extrait et publié dans <#${CHANNEL_CAPTION_REEL_ID}> :**\n> ${r.text.replace(/\n/g, '\n> ')}`);
      } else if (r.status === 'duplicate') {
        lines.push(`ℹ️ **Ce Reel a déjà été extrait précédemment :**\n> ${r.text ? r.text.replace(/\n/g, '\n> ') : '*(aucun texte)*'}`);
      } else if (r.status === 'no_text') {
        lines.push(`⚠️ **Aucun texte incrusté détecté sur cette vidéo.**`);
      } else if (r.status === 'error') {
        lines.push(`❌ **Erreur d'extraction :** ${r.error}`);
      }
    }

    if (lines.length > 0) {
      await message.reply({ content: lines.join('\n\n'), allowedMentions: { repliedUser: false } });
    }

  } catch (e) {
    console.error('⚠️ Erreur lors de l\'envoi du feedback dans #reel-scrapper:', e.message);
  }
}

module.exports = {
  CHANNEL_REEL_SCRAPPER_ID,
  CHANNEL_CAPTION_REEL_ID,
  normalizeMediaKey,
  processSingleMediaItem,
  processReelScrapperMessage
};

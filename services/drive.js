const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

let driveClient = null;

/**
 * Détecte si un disque Google Drive est monté localement (ex: G:\Mon Drive)
 */
function getLocalDriveBase() {
  const customPath = process.env.LOCAL_DRIVE_PATH;
  if (customPath && fs.existsSync(customPath)) return customPath;

  const candidates = [
    'G:\\Mon Drive',
    'G:\\My Drive',
    'G:\\Shared drives',
    'G:\\',
    'D:\\Google Drive',
    'C:\\Google Drive'
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      if (
        fs.existsSync(path.join(candidate, 'Contenu')) ||
        fs.existsSync(path.join(candidate, 'Contenu FR')) ||
        fs.existsSync(path.join(candidate, 'Contenu US'))
      ) {
        return candidate;
      }
    }
  }
  return null;
}

function initDrive() {
  try {
    let credentials;
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    } else if (fs.existsSync(path.join(__dirname, '../credentials.json'))) {
      credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../credentials.json'), 'utf8'));
    } else {
      console.warn('⚠️ Google Drive API : aucune credentials trouvée (mode local actif).');
      return null;
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    driveClient = google.drive({ version: 'v3', auth });
    console.log('✅ Google Drive API initialisé');
    return driveClient;
  } catch (err) {
    console.error('❌ Google Drive init error:', err.message);
    return null;
  }
}

const CONTENT_TYPE_MAP = {
  reels:        'Reels',
  reelscaption: 'Reels',
  post:         'Posts',
  pp:           'PP',
  cta:          'CTA',
};

function hasAnyMediaFiles(folderPath) {
  try {
    if (!fs.existsSync(folderPath)) return false;
    const subItems = fs.readdirSync(folderPath);
    for (const sub of subItems) {
      const subPath = path.join(folderPath, sub);
      const stat = fs.statSync(subPath);
      if (stat.isDirectory()) {
        const files = fs.readdirSync(subPath);
        const hasMedia = files.some(f => {
          const ext = path.extname(f).toLowerCase();
          return ['.mp4', '.mov', '.avi', '.jpg', '.jpeg', '.png', '.webp'].includes(ext) && !f.startsWith('.');
        });
        if (hasMedia) return true;
      } else {
        const ext = path.extname(sub).toLowerCase();
        if (['.mp4', '.mov', '.avi', '.jpg', '.jpeg', '.png', '.webp'].includes(ext) && !sub.startsWith('.')) {
          return true;
        }
      }
    }
  } catch (e) {
    return false;
  }
  return false;
}

function hasVideoStream(filePath) {
  try {
    const ffprobePath = path.join(__dirname, '../multimetachanger/ffprobe.exe');
    if (!fs.existsSync(ffprobePath)) return true;
    const { execFileSync } = require('child_process');
    const out = execFileSync(ffprobePath, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ], { timeout: 3000 }).toString().trim();
    return out.length > 0;
  } catch (e) {
    return true;
  }
}

/**
 * Récupère les dossiers Profiles disponibles (ex: "ID 1", "ID 2") dans le dossier Contenu unique
 */
async function getAvailableProfiles() {
  const localBase = getLocalDriveBase();
  if (localBase) {
    try {
      const foldersSet = new Set();
      const possibleSubdirs = ['Contenu', 'Contenu FR', 'Contenu US', ''];

      for (const sub of possibleSubdirs) {
        const targetPath = sub ? path.join(localBase, sub) : localBase;
        if (fs.existsSync(targetPath)) {
          const items = fs.readdirSync(targetPath);
          for (const item of items) {
            const fullPath = path.join(targetPath, item);
            if (fs.statSync(fullPath).isDirectory() && item.match(/^ID\s*\d+/i)) {
              foldersSet.add(item);
            }
          }
        }
      }

      const folders = Array.from(foldersSet);
      folders.sort((a, b) => {
        const numA = parseInt(a.replace(/[^0-9]/g, '')) || 0;
        const numB = parseInt(b.replace(/[^0-9]/g, '')) || 0;
        return numA - numB;
      });

      console.log(`⚡ Profiles détectés dans le dossier unique Contenu (${localBase}) :`, folders);
      return folders;
    } catch (e) {
      console.error('Erreur getAvailableProfiles local:', e.message);
    }
  }

  // Fallback API Google Drive
  if (!driveClient) driveClient = initDrive();
  if (!driveClient) return [];

  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER || process.env.GOOGLE_DRIVE_FR || '1teZ84s4rxBgSEKtADegvsQo61FCd7nRu';
  
  try {
    const foldersSet = new Set();
    const res = await driveClient.files.list({
      q: `'${rootFolderId}' in parents AND mimeType = 'application/vnd.google-apps.folder' AND trashed = false`,
      fields: 'files(id, name)',
      pageSize: 100,
    });
    res.data.files.forEach(f => {
      if (f.name.match(/^ID\s*\d+/i)) foldersSet.add(f.name);
    });
    
    const folders = Array.from(foldersSet);
    folders.sort((a, b) => {
      const numA = parseInt(a.replace(/[^0-9]/g, '')) || 0;
      const numB = parseInt(b.replace(/[^0-9]/g, '')) || 0;
      return numA - numB;
    });
    return folders;
  } catch (e) {
    console.error('Erreur getAvailableProfiles API:', e.message);
    return [];
  }
}

/**
 * Récupère un fichier pour un profile_id donné dans le dossier Contenu unique
 */
async function getFileForProfile(type, profileId, market = 'FR') {
  const localBase = getLocalDriveBase();
  const folderName = CONTENT_TYPE_MAP[type.toLowerCase()] || type;

  if (localBase) {
    const candidatePaths = [
      path.join(localBase, 'Contenu', profileId),
      path.join(localBase, market === 'US' ? 'Contenu US' : 'Contenu FR', profileId),
      path.join(localBase, profileId)
    ];

    let profileDirPath = candidatePaths.find(p => fs.existsSync(p));

    if (!profileDirPath) {
      throw new Error(`Dossier local "${profileId}" introuvable dans le dossier Contenu.`);
    }

    // Chercher le sous-dossier (ex: "Reels", "Posts", etc.)
    let targetDirPath = path.join(profileDirPath, folderName);
    if (!fs.existsSync(targetDirPath)) {
      const subItems = fs.readdirSync(profileDirPath);
      const match = subItems.find(s => s.toLowerCase() === folderName.toLowerCase());
      if (match) {
        targetDirPath = path.join(profileDirPath, match);
      } else {
        throw new Error(`Sous-dossier "${folderName}" introuvable dans "${profileId}".`);
      }
    }

    // Lister les fichiers média éligibles
    const items = fs.readdirSync(targetDirPath);
    const validFiles = items.filter(file => {
      const ext = path.extname(file).toLowerCase();
      const isMedia = ['.mp4', '.mov', '.avi', '.jpg', '.jpeg', '.png', '.webp'].includes(ext);
      return isMedia && !file.startsWith('.');
    });

    if (validFiles.length === 0) {
      throw new Error(`Stock vide : aucun fichier média dans ${profileId}/${folderName}.`);
    }

    // Choisir un fichier au hasard
    let chosenFileName = null;
    let chosenFilePath = null;

    // Pour les reels, s'assurer qu'on sélectionne une VRAIE vidéo avec flux vidéo (et pas un son/audio MP3 .mp4)
    if (type.toLowerCase() === 'reels') {
      const shuffled = [...validFiles].sort(() => Math.random() - 0.5);
      for (const cand of shuffled) {
        const candPath = path.join(targetDirPath, cand);
        if (hasVideoStream(candPath)) {
          chosenFileName = cand;
          chosenFilePath = candPath;
          break;
        } else {
          console.warn(`⚠️ Fichier ignoré pour Reels (piste audio uniquement, sans vidéo) : ${cand}`);
        }
      }
    }

    if (!chosenFileName) {
      chosenFileName = validFiles[Math.floor(Math.random() * validFiles.length)];
      chosenFilePath = path.join(targetDirPath, chosenFileName);
    }
    const stockRestant = validFiles.length - 1;

    // Copier le fichier dans temp local
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const localPath = path.join(tempDir, `${Date.now()}_${chosenFileName}`);
    fs.copyFileSync(chosenFilePath, localPath);

    console.log(`⚡ Fichier extrait depuis (${chosenFilePath}) | Stock restant: ${stockRestant}`);

    return {
      fileInfo: { id: chosenFilePath, name: chosenFileName },
      localPath,
      stockRestant
    };
  }

  // Fallback Google Drive API
  if (!driveClient) driveClient = initDrive();
  if (!driveClient) throw new Error('Drive non configuré');

  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER || process.env.GOOGLE_DRIVE_FR || '1teZ84s4rxBgSEKtADegvsQo61FCd7nRu';
  const profileFolderId = await getFolderIdByName(rootFolderId, profileId);
  if (!profileFolderId) {
    throw new Error(`Dossier "${profileId}" introuvable dans le Drive.`);
  }

  const targetFolderId = await getFolderIdByName(profileFolderId, folderName);
  if (!targetFolderId) {
    throw new Error(`Sous-dossier "${folderName}" introuvable dans "${profileId}".`);
  }

  const filesRes = await driveClient.files.list({
    q: `'${targetFolderId}' in parents AND trashed = false AND mimeType != 'application/vnd.google-apps.folder'`,
    fields: 'files(id, name, mimeType)',
    orderBy: 'createdTime asc',
    pageSize: 50,
  });

  const files = filesRes.data.files;
  if (files.length === 0) {
    throw new Error(`Stock vide : aucun fichier dans ${profileId}/${folderName}.`);
  }

  const file = files[Math.floor(Math.random() * files.length)];
  const stockRestant = files.length - 1;

  let fileName = file.name;
  if (!fileName.includes('.')) {
    const mimeMap = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
      'video/x-msvideo': 'avi'
    };
    const ext = mimeMap[file.mimeType] || file.mimeType.split('/')[1] || 'jpg';
    fileName += `.${ext}`;
  }
  const localPath = await downloadFile(file.id, fileName);

  return {
    fileInfo: file,
    localPath,
    stockRestant
  };
}

async function getFolderIdByName(parentFolderId, folderName) {
  try {
    const res = await driveClient.files.list({
      q: `'${parentFolderId}' in parents AND name = '${folderName}' AND mimeType = 'application/vnd.google-apps.folder' AND trashed = false`,
      fields: 'files(id, name)',
    });
    return res.data.files.length > 0 ? res.data.files[0].id : null;
  } catch (e) {
    console.error('Erreur getFolderIdByName:', e.message);
    return null;
  }
}

async function downloadFile(fileId, fileName) {
  const tempDir = path.join(__dirname, '../temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const destPath = path.join(tempDir, `${Date.now()}_${fileName}`);

  const dest = fs.createWriteStream(destPath);
  const res = await driveClient.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });

  return new Promise((resolve, reject) => {
    res.data
      .on('end', () => resolve(destPath))
      .on('error', err => reject(err))
      .pipe(dest);
  });
}

async function deleteFile(fileId) {
  if (fs.existsSync(fileId)) {
    try {
      fs.unlinkSync(fileId);
    } catch (e) {
      console.error(`Impossible de supprimer le fichier local ${fileId}:`, e.message);
    }
    return;
  }
  if (!driveClient) driveClient = initDrive();
  if (driveClient) {
    try {
      await driveClient.files.delete({ fileId });
    } catch (e) {
      console.error(`Impossible de supprimer le fichier Drive ${fileId}:`, e.message);
    }
  }
}

async function fetchProfileLinks(profileId) {
  if (!driveClient) driveClient = initDrive();
  if (!driveClient) return { driveUrl: '', captionUrl: '', ctaUrl: '' };

  let driveUrl = '';
  let captionUrl = '';
  let ctaUrl = '';

  const rootId = process.env.GOOGLE_DRIVE_FOLDER || '1teZ84s4rxBgSEKtADegvsQo61FCd7nRu';
  
  try {
    const profId = await getFolderIdByName(rootId, profileId);
    if (!profId) return { driveUrl, captionUrl, ctaUrl };

    driveUrl = `https://drive.google.com/drive/folders/${profId}?usp=drive_link`;

    const postsId = await getFolderIdByName(profId, 'Posts');
    if (postsId) {
      const postsFiles = await driveClient.files.list({
        q: `'${postsId}' in parents AND mimeType contains 'text' AND trashed = false`,
        fields: 'files(id, name)'
      });
      const captionFile = postsFiles.data.files.find(f => f.name.toLowerCase().includes('caption') || f.name.toLowerCase().includes('thread')) || postsFiles.data.files[0];
      if (captionFile) {
        captionUrl = `https://drive.google.com/file/d/${captionFile.id}/view?usp=drive_link`;
      }
    }

    const ctaId = await getFolderIdByName(profId, 'CTA');
    if (ctaId) {
      const ctaFiles = await driveClient.files.list({
        q: `'${ctaId}' in parents AND mimeType contains 'text' AND trashed = false`,
        fields: 'files(id, name)'
      });
      const ctaFile = ctaFiles.data.files.find(f => f.name.toLowerCase().includes('story') || f.name.toLowerCase().includes('cta')) || ctaFiles.data.files[0];
      if (ctaFile) {
        ctaUrl = `https://drive.google.com/file/d/${ctaFile.id}/view?usp=drive_link`;
      }
    }
  } catch (err) {
    console.error("fetchProfileLinks error:", err.message);
  }

  return { driveUrl, captionUrl, ctaUrl };
}

module.exports = {
  initDrive,
  getLocalDriveBase,
  hasAnyMediaFiles,
  getAvailableProfiles,
  getFileForProfile,
  getFolderIdByName,
  downloadFile,
  deleteFile,
  fetchProfileLinks
};

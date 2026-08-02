const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

let driveClient = null;

function initDrive() {
  try {
    let credentials;
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    } else if (fs.existsSync(path.join(__dirname, '../credentials.json'))) {
      credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../credentials.json'), 'utf8'));
    } else {
      console.warn('⚠️ Google Drive : aucune credentials trouvée.');
      return null;
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    driveClient = google.drive({ version: 'v3', auth });
    console.log('✅ Google Drive initialisé');
    return driveClient;
  } catch (err) {
    console.error('❌ Google Drive init error:', err.message);
    return null;
  }
}

const CONTENT_TYPE_MAP = {
  reels:  'Reels',
  post:   'Posts',
  pp:     'PP',
  cta:    'CTA',
};

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

/**
 * Download a file from Drive to a local temp folder
 */
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

/**
 * Delete a file from Drive
 */
async function deleteFile(fileId) {
  try {
    await driveClient.files.delete({ fileId });
  } catch (e) {
    console.error(`Impossible de supprimer le fichier ${fileId}:`, e.message);
  }
}

/**
 * Récupère un fichier d'un type de contenu depuis Drive pour un profile_id donné
 * Structure : Root -> ID X -> Reels
 */
async function getFileForProfile(type, profileId, market = 'FR') {
  if (!driveClient) driveClient = initDrive();
  if (!driveClient) throw new Error('Drive non configuré');

  const rootFolderId = market === 'US' ? process.env.GOOGLE_DRIVE_US : process.env.GOOGLE_DRIVE_FR;
  
  // 1. Chercher le dossier Profile (ex: "ID 1")
  const profileFolderId = await getFolderIdByName(rootFolderId, profileId);
  if (!profileFolderId) {
    throw new Error(`Dossier "${profileId}" introuvable dans le Drive.`);
  }

  // 2. Chercher le sous-dossier (ex: "Reels")
  const folderName = CONTENT_TYPE_MAP[type.toLowerCase()] || type;
  const targetFolderId = await getFolderIdByName(profileFolderId, folderName);
  
  if (!targetFolderId) {
    throw new Error(`Sous-dossier "${folderName}" introuvable dans "${profileId}".`);
  }

  // 3. Lister les fichiers
  const filesRes = await driveClient.files.list({
    q: `'${targetFolderId}' in parents AND trashed = false AND mimeType != 'application/vnd.google-apps.folder'`,
    fields: 'files(id, name, mimeType)',
    orderBy: 'createdTime asc', // Prendre le plus ancien par exemple
    pageSize: 50,
  });

  const files = filesRes.data.files;
  if (files.length === 0) {
    throw new Error(`Stock vide : aucun fichier dans ${profileId}/${folderName}.`);
  }

  // On prend le premier fichier pour ne pas envoyer toujours le même (on pourrait aussi le faire au hasard)
  const file = files[Math.floor(Math.random() * files.length)];
  const stockRestant = files.length - 1;

  // 4. Télécharger le fichier
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

/**
 * Liste les dossiers Profiles disponibles (ex: "ID 1", "ID 2") dans les dossiers racines (FR et US)
 */
async function getAvailableProfiles() {
  if (!driveClient) driveClient = initDrive();
  if (!driveClient) return [];

  const rootFolderFr = process.env.GOOGLE_DRIVE_FR;
  const rootFolderUs = process.env.GOOGLE_DRIVE_US;
  
  try {
    const foldersSet = new Set();
    
    // Fonction utilitaire pour fetch un dossier
    const fetchFromRoot = async (rootId) => {
      if (!rootId) return;
      const res = await driveClient.files.list({
        q: `'${rootId}' in parents AND mimeType = 'application/vnd.google-apps.folder' AND trashed = false`,
        fields: 'files(id, name)',
        pageSize: 100,
      });
      res.data.files.forEach(f => foldersSet.add(f.name));
    };

    await Promise.all([fetchFromRoot(rootFolderFr), fetchFromRoot(rootFolderUs)]);
    
    const folders = Array.from(foldersSet);
    
    // Trier les dossiers par numéro s'ils sont du format "ID X"
    folders.sort((a, b) => {
      const numA = parseInt(a.replace(/[^0-9]/g, '')) || 0;
      const numB = parseInt(b.replace(/[^0-9]/g, '')) || 0;
      return numA - numB;
    });
    return folders;
  } catch (e) {
    console.error('Erreur getAvailableProfiles:', e.message);
    return [];
  }
}

module.exports = { initDrive, getFileForProfile, deleteFile, getAvailableProfiles };

require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');

const credentials = JSON.parse(fs.readFileSync('./credentials.json', 'utf8'));
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

(async () => {
  console.log('\n🔍 Test Google Drive API...');
  console.log('Folder ID:', FOLDER_ID);
  console.log('Service Account:', credentials.client_email);

  try {
    const res = await drive.files.list({
      q: `'${FOLDER_ID}' in parents AND trashed = false`,
      fields: 'files(id, name, mimeType)',
      pageSize: 30,
    });

    const files = res.data.files;
    console.log('\n✅ Connexion Google Drive : OK !');
    console.log('📁 Fichiers/dossiers dans le Drive :', files.length);

    if (files.length === 0) {
      console.log('\n⚠️  Le dossier est vide OU pas encore partagé avec le bot.');
      console.log('👉 Partage requis avec :', credentials.client_email);
    } else {
      files.forEach(f => {
        const type = f.mimeType.includes('folder') ? '📁' : '📄';
        console.log(' ', type, f.name);
      });
    }
  } catch (err) {
    console.error('\n❌ Erreur Drive:', err.message);
    if (err.code === 403 || err.message.includes('forbidden') || err.message.includes('notFound')) {
      console.log('\n👉 Le dossier Drive n\'est PAS partagé avec le compte de service.');
      console.log('Email à ajouter :', credentials.client_email);
      console.log('\nComment faire :');
      console.log('1. Ouvre ton Drive : https://drive.google.com');
      console.log('2. Clic droit sur le dossier → Partager');
      console.log('3. Ajoute :', credentials.client_email);
      console.log('4. Rôle : Lecteur → Envoyer');
    }
  }
})();

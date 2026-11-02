require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { getAvailableProfiles } = require('../services/drive');
const { getRandomTextFromSheet } = require('../services/sheets');

async function main() {
  const market = process.argv[2] || 'US';

  try {
    // 1. Récupérer un Profile ID disponible depuis Google Drive
    const profiles = await getAvailableProfiles();
    if (!profiles || profiles.length === 0) {
      console.log("JSON_OUTPUT:" + JSON.stringify({ status: 'error', message: 'Aucun profil disponible dans le Drive (dossier Contenu).' }));
      process.exit(1);
    }
    const profileId = profiles[Math.floor(Math.random() * profiles.length)];

    // 2. Récupérer un pseudo aléatoire depuis Google Sheets (colonne C = Profil)
    const pseudo = await getRandomTextFromSheet(market, 'C');

    // 3. Récupérer une bio aléatoire depuis Google Sheets (colonne A = Bio)
    let bio = '';
    try {
      bio = await getRandomTextFromSheet(market, 'A');
    } catch(e) {
      bio = 'Juste moi';
    }

    console.log("JSON_OUTPUT:" + JSON.stringify({
      status: 'success',
      profile_id: profileId,
      pseudo: pseudo.trim(),
      bio: bio.trim(),
      market: market
    }));
    process.exit(0);

  } catch (error) {
    console.log("JSON_OUTPUT:" + JSON.stringify({ status: 'error', message: error.message }));
    process.exit(1);
  }
}

main();

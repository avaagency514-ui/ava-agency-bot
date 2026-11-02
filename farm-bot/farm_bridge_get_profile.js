const { getAvailableProfiles } = require('../services/drive');

async function main() {
  try {
    const profiles = await getAvailableProfiles();
    if (!profiles || profiles.length === 0) {
      console.log("JSON_OUTPUT:" + JSON.stringify({ status: 'error', message: 'Aucun profil disponible dans le Drive (dossier Contenu).' }));
      process.exit(1);
    }
    
    // Pick a random available profile
    const randomProfile = profiles[Math.floor(Math.random() * profiles.length)];
    
    console.log("JSON_OUTPUT:" + JSON.stringify({ status: 'success', profile_id: randomProfile }));
  } catch (error) {
    console.log("JSON_OUTPUT:" + JSON.stringify({ status: 'error', message: error.message }));
    process.exit(1);
  }
}

main();

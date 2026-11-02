const { igQueries, vaQueries } = require('../database/db');
const { fetchProfileLinks } = require('../services/drive');
const { appendAccountToSheet } = require('../services/sheets');

async function main() {
  try {
    const data = JSON.parse(process.argv[2]);
    const { 
      va_id = 1, // Fallback if no specific VA selected
      username_ig, 
      profile_id, 
      os, 
      password, 
      two_fa, 
      email_numero,
      registration_date,
      market = 'FR'
    } = data;

    if (!username_ig || !profile_id) {
      throw new Error("Missing username_ig or profile_id");
    }

    // 1. Insert in SQLite DB
    igQueries.create.run({ 
      va_id: va_id, 
      username_ig: username_ig, 
      deeplink: null,
      profile_id: profile_id,
      os: os,
      password: password,
      two_fa: two_fa,
      registration_date: registration_date
    });

    // 2. Build Instagram tracking link
    const cleanUsername = username_ig.replace(/[^a-zA-Z0-9]/g, '');
    const lienInsta = `https://linky.fans/${cleanUsername}`;

    // 3. Get Drive links
    const links = await fetchProfileLinks(profile_id);

    // 4. Save to Google Sheets
    await appendAccountToSheet([
      market,               // A: Marché
      "Pause",              // B: Statut
      username_ig,          // C: Nom d'utilisateur
      password || '',       // D: Mot de passe
      email_numero || '',   // E: Mail/Numero
      two_fa || '',         // F: 2FA
      '',                   // G: Api buffer
      links.captionUrl || '',// H: Caption Threads
      '',                   // I: Reels txt
      links.ctaUrl || '',   // J: Story CTA
      profile_id,           // K: ID Dossier
      links.driveUrl || '', // L: Lien Drive
      lienInsta             // M: Lien Insta
    ]);

    console.log("JSON_OUTPUT:" + JSON.stringify({ status: 'success', lienInsta }));
    process.exit(0);
  } catch (err) {
    console.log("JSON_OUTPUT:" + JSON.stringify({ status: 'error', message: err.message }));
    process.exit(1);
  }
}

main();

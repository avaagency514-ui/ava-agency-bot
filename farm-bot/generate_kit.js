require('dotenv').config({ path: '../.env' });
const { Client, GatewayIntentBits } = require('discord.js');
const { getRandomTextFromSheet } = require('../services/sheets');
const { generateUniqueText } = require('../services/gemini');

// Le script Node.js qui prépare le "Kit de création" pour le script Python
async function generateKit() {
  const kit = { success: false };
  
  try {
    // 1. Générer le pseudo (sans caractères spéciaux, que des lettres minuscules)
    const firstNames = ['lea', 'chloe', 'camille', 'emma', 'jade', 'alice', 'louise', 'garance', 'roxane', 'nina'];
    const lastNames = ['martin', 'bernard', 'dubois', 'thomas', 'robert', 'richard', 'ciel', 'merre', 'flux'];
    
    const randomFirst = firstNames[Math.floor(Math.random() * firstNames.length)];
    const randomLast = lastNames[Math.floor(Math.random() * lastNames.length)];
    const pseudo = (randomFirst + randomLast).toLowerCase().replace(/[^a-z]/g, '');
    
    kit.pseudo = pseudo;
    kit.linky = `https://linky.fans/${pseudo}`;
    kit.password = "Ava" + Math.random().toString(36).substring(2, 10) + "!";
    
    // 2. Générer une Bio avec Gemini (Marche US par défaut)
    const baseBio = await getRandomTextFromSheet('US', 'A'); // Colonne A = Bio
    kit.bio = await generateUniqueText(baseBio, 'Bio', 'US');
    
    // 3. Récupérer 5 comptes à follow (Depuis le discord)
    const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
    await client.login(process.env.DISCORD_TOKEN);
    
    const channel = await client.channels.fetch('1527606264803364864'); // Follow US
    const messages = await channel.messages.fetch({ limit: 50 });
    const allUsernames = new Set();
    const atRegex = /\@([a-zA-Z0-9_.]+)/g;
    const dashRegex = /^-\s+([a-zA-Z0-9_.]+)/gm;

    messages.forEach(msg => {
      let match;
      while ((match = atRegex.exec(msg.content)) !== null) allUsernames.add(match[1]);
      while ((match = dashRegex.exec(msg.content)) !== null) allUsernames.add(match[1]);
    });
    
    const arrUsernames = Array.from(allUsernames);
    kit.follow_list = [];
    for (let i = 0; i < 5; i++) {
      if (arrUsernames.length > 0) {
        const idx = Math.floor(Math.random() * arrUsernames.length);
        kit.follow_list.push(arrUsernames[idx]);
        arrUsernames.splice(idx, 1);
      }
    }
    
    // TODO: Ajouter la récupération d'une PP (Photo de profil)
    kit.pp_path = ""; 
    
    kit.success = true;
    console.log(JSON.stringify(kit));
    process.exit(0);

  } catch (err) {
    kit.error = err.message;
    console.log(JSON.stringify(kit));
    process.exit(1);
  }
}

generateKit();

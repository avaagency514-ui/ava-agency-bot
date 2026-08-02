require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { initDatabase } = require('./database/db');
const { startTasks } = require('./tasks');

// ─── Démarrage de l'API Python (MultiMetaChanger) ────────────
function startPythonAPI() {
  const pythonPath = path.join(__dirname, 'multimetachanger', 'app.py');
  
  // Vérifie si le fichier existe (on est bien dans un conteneur Docker)
  if (!fs.existsSync(pythonPath)) {
    console.log('⚠️  app.py introuvable - MultiMetaChanger non disponible');
    return;
  }

  const py = spawn('python3', ['-u', pythonPath], {
    cwd: path.join(__dirname, 'multimetachanger'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  py.stdout.on('data', (d) => console.log(`[Python] ${d.toString().trim()}`));
  py.stderr.on('data', (d) => console.error(`[Python ERR] ${d.toString().trim()}`));
  py.on('close', (code) => console.error(`[Python] Processus terminé avec code ${code}`));

  console.log('🐍 API Python (MultiMetaChanger) lancée en arrière-plan...');
}

startPythonAPI();


// ─── Client Discord ───────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
  ],
});

client.commands = new Collection();

// ─── Chargement des commandes ─────────────────────────────────
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
    console.log(`✅ Commande chargée : /${command.data.name}`);
  }
}

// ─── Chargement des événements ────────────────────────────────
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));

for (const file of eventFiles) {
  const event = require(path.join(eventsPath, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
  console.log(`✅ Événement chargé : ${event.name}`);
}

// ─── Initialisation ──────────────────────────────────────────
async function main() {
  console.log('🤖 AVA Agency Bot — Démarrage...');
  
  // Init DB
  initDatabase();
  
  // Login Discord
  await client.login(process.env.DISCORD_TOKEN);
  
  // Démarrer les tâches cron (après connexion Discord)
  client.once('ready', () => {
    startTasks(client);
  });
}

main().catch(err => {
  console.error('❌ Erreur fatale :', err);
  process.exit(1);
});

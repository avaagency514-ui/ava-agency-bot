require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { initDatabase } = require('./database/db');
const { startTasks } = require('./tasks');

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

require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.on('ready', async () => {
  const guild = client.guilds.cache.get('1179331591789608990');
  const channels = await guild.channels.fetch();
  const bilan = channels.find(c => c.name.toLowerCase() === 'bilan');
  console.log(bilan ? bilan.id : 'NOT_FOUND');
  process.exit(0);
});
client.login(process.env.DISCORD_TOKEN);

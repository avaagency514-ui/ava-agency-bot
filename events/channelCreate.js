const { Events, ChannelType, OverwriteType } = require('discord.js');
const { sendTicketWelcome } = require('../handlers/ticketHandler');

// Protection anti-doublon en mémoire (par channelId)
const processedTickets = new Set();

module.exports = {
  name: Events.ChannelCreate,

  async execute(channel, client) {
    try {
      if (!channel.guild || channel.guild.id !== process.env.DISCORD_GUILD_ID) return;
      if (channel.type !== ChannelType.GuildText) return;

      const channelName = channel.name.toLowerCase();
      if (!channelName.startsWith('ticket-')) return;

      if (processedTickets.has(channel.id)) {
        return;
      }
      processedTickets.add(channel.id);

      // Nettoyer le Set après 1 heure pour éviter les fuites mémoire
      setTimeout(() => processedTickets.delete(channel.id), 60 * 60 * 1000);

      console.log(`🎟️ Nouveau salon ticket détecté : #${channel.name} (${channel.id})`);

      // Attendre 2 secondes que Ticket Tool applique ses permissions et poste son message
      setTimeout(async () => {
        try {
          const freshChannel = await channel.guild.channels.fetch(channel.id).catch(() => null);
          if (!freshChannel) return;

          // Vérifier si un message de bienvenue AVA n'est pas déjà présent
          const messages = await freshChannel.messages.fetch({ limit: 10 }).catch(() => null);
          const alreadySent = messages && messages.some(m => m.author.id === client.user.id);
          if (alreadySent) {
            console.log(`ℹ️ Onboarding déjà envoyé dans #${freshChannel.name}, pas de renvoi.`);
            return;
          }

          let candidateId = 'any';

          // 1. Chercher la mention dans le message de Ticket Tool (<@USER_ID>)
          if (messages) {
            for (const msg of messages.values()) {
              const match = msg.content.match(/<@!?([0-9]{17,20})>/);
              if (match && match[1] !== client.user.id && match[1] !== msg.author.id) {
                candidateId = match[1];
                break;
              }
            }
          }

          // 2. Si non trouvé, regarder les permissions membres
          if (candidateId === 'any') {
            for (const [id, overwrite] of freshChannel.permissionOverwrites.cache) {
              if (overwrite.type === OverwriteType.Member && id !== client.user.id && id !== '557628352828014614') {
                candidateId = id;
                break;
              }
            }
          }

          console.log(`🎯 Envoi unique de l'onboarding pour #${freshChannel.name} (Candidat: ${candidateId})`);
          await sendTicketWelcome(freshChannel, candidateId);

        } catch (innerErr) {
          console.error('❌ Erreur initialisation ticket après délai :', innerErr);
        }
      }, 2000);

    } catch (err) {
      console.error('❌ Erreur event channelCreate ticket :', err);
    }
  }
};

const { Events, ChannelType, OverwriteType } = require('discord.js');
const { sendTicketWelcome } = require('../handlers/ticketHandler');
const { findCandidateInTicket, renameTicketToCandidate } = require('../services/ticketRenamer');

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

      // Attendre 2.5 secondes que Ticket Tool applique ses permissions et poste son message
      setTimeout(async () => {
        try {
          const freshChannel = await channel.guild.channels.fetch(channel.id).catch(() => null);
          if (!freshChannel) return;

          let candidateId = await findCandidateInTicket(freshChannel, client);

          // Si le candidat est identifié, renommer immédiatement le ticket à son nom
          if (candidateId) {
            await renameTicketToCandidate(freshChannel, candidateId, channel.guild);
          }

          // Vérifier si un message de bienvenue AVA n'est pas déjà présent
          const messages = await freshChannel.messages.fetch({ limit: 10 }).catch(() => null);
          const alreadySent = messages && messages.some(m => m.author.id === client.user.id);
          if (alreadySent) {
            console.log(`ℹ️ Onboarding déjà envoyé dans #${freshChannel.name}, pas de renvoi.`);
            return;
          }

          console.log(`🎯 Envoi unique de l'onboarding pour #${freshChannel.name} (Candidat: ${candidateId || 'any'})`);
          await sendTicketWelcome(freshChannel, candidateId || 'any');

          // Deuxième tentative de renommage 4 secondes plus tard si Ticket Tool a mis du temps
          if (!candidateId) {
            setTimeout(async () => {
              const lateCh = await channel.guild.channels.fetch(channel.id).catch(() => null);
              if (lateCh) {
                const lateCandidateId = await findCandidateInTicket(lateCh, client);
                if (lateCandidateId) {
                  await renameTicketToCandidate(lateCh, lateCandidateId, channel.guild);
                }
              }
            }, 4000);
          }

        } catch (innerErr) {
          console.error('❌ Erreur initialisation ticket après délai :', innerErr);
        }
      }, 2500);

    } catch (err) {
      console.error('❌ Erreur event channelCreate ticket :', err);
    }
  }
};

const { Events } = require('discord.js');
const { hasRecruitedRole, formatTicketChannelName, renameTicketToCandidate } = require('../services/ticketRenamer');

module.exports = {
  name: Events.GuildMemberUpdate,

  async execute(oldMember, newMember, client) {
    try {
      if (newMember.user.bot) return;

      const hadRole = hasRecruitedRole(oldMember);
      const hasRoleNow = hasRecruitedRole(newMember);

      // Si le membre vient de recevoir un rôle attribué par l'équipe
      if (!hadRole && hasRoleNow) {
        const exactName = newMember.displayName || newMember.user.globalName || newMember.user.username;
        const ticketPrefixName = formatTicketChannelName(exactName, false); // ex: ticket-donovan

        const guild = newMember.guild;
        const channels = await guild.channels.fetch();
        const ticketChannel = channels.find(c => c && c.name === ticketPrefixName);

        if (ticketChannel) {
          console.log(`🎉 [RÔLE DÉTECTÉ] ${exactName} a reçu un rôle ! Renommage du salon #${ticketChannel.name} ➔ #${formatTicketChannelName(exactName, true)}...`);
          await renameTicketToCandidate(ticketChannel, newMember.id, guild, true);
        }
      }
    } catch (err) {
      console.error('❌ Erreur event guildMemberUpdate :', err);
    }
  }
};

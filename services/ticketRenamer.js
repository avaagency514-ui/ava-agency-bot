const { ChannelType, OverwriteType } = require('discord.js');

/**
 * Nettoie et formate un nom d'utilisateur pour en faire un nom de salon Discord valide.
 * Exemple: "Skylerlarmanie" -> "ticket-skylerlarmanie"
 */
function formatTicketChannelName(rawName) {
  if (!rawName) return null;

  const clean = rawName
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Supprimer les accents
    .replace(/[^a-z0-9_-]/g, '-') // Remplacer caractères spéciaux par un tiret
    .replace(/-+/g, '-') // Éviter les tirets multiples consécutifs
    .replace(/^-|-$/g, '') // Supprimer les tirets au début ou à la fin
    .slice(0, 28);

  if (!clean) return null;
  return `ticket-${clean}`;
}

/**
 * Détecte l'identifiant Discord (ID) du candidat dans un salon ticket donné.
 */
async function findCandidateInTicket(channel, client) {
  if (!channel || channel.type !== ChannelType.GuildText) return null;

  // 1. Analyser les messages récents (recherche dans les boutons et les mentions)
  try {
    const messages = await channel.messages.fetch({ limit: 30 }).catch(() => null);
    if (messages) {
      // 1a. Vérifier les composants ActionRow (boutons du bot contenant le candidateId)
      for (const msg of messages.values()) {
        if (msg.components && msg.components.length > 0) {
          for (const row of msg.components) {
            for (const comp of row.components) {
              if (comp.customId && comp.customId.startsWith('ticket_')) {
                const parts = comp.customId.split(':');
                if (parts[1] && parts[1] !== 'any' && /^\d{17,20}$/.test(parts[1])) {
                  return parts[1];
                }
              }
            }
          }
        }
      }

      // 1b. Vérifier les embeds du bot ou les mentions du candidat (<@USER_ID>)
      for (const msg of messages.values()) {
        if (msg.embeds && msg.embeds.length > 0) {
          for (const emb of msg.embeds) {
            const textToSearch = `${emb.title || ''} ${emb.description || ''}`;
            const m = textToSearch.match(/<@!?([0-9]{17,20})>/);
            if (m && m[1] !== client.user.id && m[1] !== '557628352828014614') {
              return m[1];
            }
          }
        }

        // Vérifier le texte brut du message
        const textMatch = msg.content.match(/<@!?([0-9]{17,20})>/);
        if (textMatch && textMatch[1] !== client.user.id && textMatch[1] !== '557628352828014614') {
          return textMatch[1];
        }
      }
    }
  } catch (err) {
    console.warn(`[TICKET DETECT] Erreur lecture messages #${channel.name}:`, err.message);
  }

  // 2. Analyser les permissions spécifiques au salon (Member Overwrites de Ticket Tool)
  try {
    if (channel.permissionOverwrites) {
      for (const [id, overwrite] of channel.permissionOverwrites.cache) {
        if (overwrite.type === OverwriteType.Member && id !== client.user.id && id !== '557628352828014614') {
          return id;
        }
      }
    }
  } catch (err) {
    console.warn(`[TICKET DETECT] Erreur lecture permissions #${channel.name}:`, err.message);
  }

  return null;
}

/**
 * Renomme un ticket au nom du candidat si nécessaire
 */
async function renameTicketToCandidate(channel, candidateId, guild) {
  if (!channel || !candidateId || candidateId === 'any') return false;

  try {
    const member = await guild.members.fetch(candidateId).catch(() => null);
    if (!member) return false;

    const rawUsername = member.user.username || member.displayName;
    const targetName = formatTicketChannelName(rawUsername);
    if (!targetName) return false;

    if (channel.name !== targetName) {
      await channel.setName(targetName, 'Renommage automatique au nom du candidat');
      console.log(`🏷️ Ticket #${channel.id} renommé : #${channel.name} ➔ #${targetName} (@${member.user.tag})`);
      return true;
    }
  } catch (err) {
    console.warn(`⚠️ Erreur renommage #${channel.name}:`, err.message);
  }

  return false;
}

/**
 * Scanne et renomme TOUS les anciens tickets existants sur le serveur Discord
 */
async function renameAllExistingTickets(guild, client) {
  if (!guild) return 0;

  try {
    console.log(`🔍 [TICKETS] Recherche de tous les tickets existants sur ${guild.name}...`);
    const channels = await guild.channels.fetch();

    const ticketChannels = channels.filter(c => {
      if (!c || c.type !== ChannelType.GuildText) return false;
      const name = c.name.toLowerCase();
      const parentName = c.parent?.name?.toLowerCase() || '';
      return name.startsWith('ticket-') ||
             parentName.includes('ticket') ||
             parentName.includes('recrutement') ||
             parentName.includes('onboarding');
    });

    console.log(`📋 [TICKETS] ${ticketChannels.size} salon(s) ticket détecté(s).`);

    let renamedCount = 0;
    for (const [, ch] of ticketChannels) {
      try {
        const candidateId = await findCandidateInTicket(ch, client);
        if (!candidateId || candidateId === 'any') {
          continue;
        }

        const member = await guild.members.fetch(candidateId).catch(() => null);
        if (!member) continue;

        const targetName = formatTicketChannelName(member.user.username || member.displayName);
        if (!targetName) continue;

        if (ch.name !== targetName) {
          console.log(`🔄 [TICKETS] Renommage #${ch.name} ➔ #${targetName} (Candidat: @${member.user.tag})`);
          await ch.setName(targetName, 'Renommage automatique au nom du candidat');
          renamedCount++;

          // Pause de 1500ms entre chaque renommage pour respecter le rate limit de l'API Discord
          await new Promise(r => setTimeout(r, 1500));
        }
      } catch (errCh) {
        console.warn(`⚠️ [TICKETS] Erreur sur #${ch.name}:`, errCh.message);
      }
    }

    console.log(`✅ [TICKETS] Analyse terminée : ${renamedCount} ticket(s) renommé(s) avec succès.`);
    return renamedCount;
  } catch (err) {
    console.error('❌ [TICKETS] Erreur globale renameAllExistingTickets:', err);
    return 0;
  }
}

module.exports = {
  formatTicketChannelName,
  findCandidateInTicket,
  renameTicketToCandidate,
  renameAllExistingTickets,
};

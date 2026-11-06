const { ChannelType, OverwriteType } = require('discord.js');

/**
 * Nettoie et formate un nom (affichage, prénom, surnom) pour en faire un nom de salon Discord valide.
 * Exemple: "Donovan" -> "ticket-donovan"
 *          "KARINA.H🌷" -> "ticket-karina-h"
 *          "♡🌹ᥫ᭡𝐌𝐞́𝐥𝐢𝐬𝐬𝐚 𝐁𝐞𝐥𝐥𝐚ᥫ᭡🌹🩷" -> "ticket-melissa-bella"
 */
function formatTicketChannelName(rawName) {
  if (!rawName) return null;

  const clean = rawName
    .replace(/[øØ]/g, 'o')
    .replace(/[æÆ]/g, 'ae')
    .replace(/[œŒ]/g, 'oe')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // Supprimer les accents
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-') // Remplacer caractères spéciaux par un tiret
    .replace(/-+/g, '-') // Éviter les tirets multiples consécutifs
    .replace(/^-|-$/g, '') // Supprimer les tirets au début ou à la fin
    .slice(0, 32);

  if (!clean) return null;
  return `ticket-${clean}`;
}

/**
 * Détecte l'identifiant Discord (ID) du candidat / créateur du ticket.
 * Priorise strictement les messages du bot d'onboarding AVA et de Ticket Tool,
 * afin de ne JAMAIS sélectionner un manager ou un autre membre intervenant dans le chat.
 */
async function findCandidateInTicket(channel, client) {
  if (!channel || channel.type !== ChannelType.GuildText) return null;

  // 1. Analyser les messages du salon
  try {
    const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    if (messages && messages.size > 0) {
      const sorted = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      // 1a. Messages d'onboarding AVA Agent (👋 <@ID> ou embed "Le candidat <@ID>")
      for (const m of sorted) {
        if (m.author.id === client.user.id) {
          // Content : 👋 <@ID>
          const mWave = m.content?.match(/👋\s*<@!?([0-9]{17,20})>/);
          if (mWave) return mWave[1];

          // Embeds : Le candidat <@ID> ou Bonjour <@ID>
          if (m.embeds) {
            for (const emb of m.embeds) {
              const text = `${emb.description || ''} ${emb.title || ''}`;
              const mCand = text.match(/Le candidat <@!?([0-9]{17,20})>/) || text.match(/Bonjour <@!?([0-9]{17,20})>/);
              if (mCand) return mCand[1];
            }
          }

          // Boutons : customId ticket_type_va:ID ou ticket_type_chatter:ID
          if (m.components) {
            for (const row of m.components) {
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
      }

      // 1b. Message d'ouverture de Ticket Tool (le bot Ticket Tool mentionne le créateur du ticket)
      const ticketToolMsg = sorted.find(m => m.author.id === '557628352828014614');
      if (ticketToolMsg) {
        const m1 = ticketToolMsg.content?.match(/<@!?([0-9]{17,20})>/);
        if (m1) return m1[1];
        if (ticketToolMsg.embeds) {
          for (const emb of ticketToolMsg.embeds) {
            const t = `${emb.title || ''} ${emb.description || ''} ${emb.fields?.map(f => `${f.name} ${f.value}`).join(' ') || ''}`;
            const m2 = t.match(/<@!?([0-9]{17,20})>/);
            if (m2) return m2[1];
          }
        }
      }
    }
  } catch (err) {
    console.warn(`[TICKET DETECT] Erreur lecture messages #${channel.name}:`, err.message);
  }

  // 2. Permissions Overwrite spécifiques au salon (Member Overwrites du créateur de ticket)
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
 * Renomme un ticket au nom exact (displayName / globalName) du candidat
 */
async function renameTicketToCandidate(channel, candidateId, guild) {
  if (!channel || !candidateId || candidateId === 'any') return false;

  try {
    // Récupérer le membre du serveur
    const member = await guild.members.fetch(candidateId).catch(() => null);
    let exactName = null;

    if (member) {
      // Priorité 1: displayName (surnom serveur ou nom d'affichage global du profil Discord)
      exactName = member.displayName || member.user.globalName || member.user.displayName || member.user.username;
    } else {
      // Si le candidat a quitté le serveur, récupérer son profil Discord global
      const user = await channel.client.users.fetch(candidateId).catch(() => null);
      if (user) {
        exactName = user.globalName || user.displayName || user.username;
      }
    }

    if (!exactName) return false;

    const targetName = formatTicketChannelName(exactName);
    if (!targetName) return false;

    if (channel.name !== targetName) {
      await channel.setName(targetName, `Renommage automatique au nom exact du candidat (${exactName})`);
      console.log(`🏷️ Ticket #${channel.id} renommé : #${channel.name} ➔ #${targetName} (Nom exact: "${exactName}")`);
      return true;
    }
  } catch (err) {
    console.warn(`⚠️ Erreur renommage #${channel.name}:`, err.message);
  }

  return false;
}

/**
 * Scanne et renomme TOUS les anciens tickets existants sur le serveur Discord au nom exact de leur créateur
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

        const renamed = await renameTicketToCandidate(ch, candidateId, guild);
        if (renamed) {
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

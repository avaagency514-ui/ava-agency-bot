const { ChannelType, OverwriteType } = require('discord.js');

const IGNORED_ROLES = new Set([
  '1179331591789608990', // @everyone
  '1557494396717498459', // Non vérifié
  '1557491020785131583', // RaidProtect
  '1557491413305004102', // bot
  '1533104409637163069', // AVA Agent
  '1524700087509323907', // Ticket Tool
]);

/**
 * Vérifie si le membre a reçu un rôle officiel attribué par l'agence
 */
function hasRecruitedRole(member) {
  if (!member || !member.roles) return false;
  return member.roles.cache.some(r => !IGNORED_ROLES.has(r.id));
}

/**
 * Nettoie et formate un nom (affichage, prénom, surnom) pour en faire un nom de salon Discord valide.
 * Si hasRole est true, le préfixe "ticket-" est retiré pour ne laisser que le nom (ex: "donovan").
 * Si hasRole est false, le nom commence par "ticket-" (ex: "ticket-donovan").
 */
function formatTicketChannelName(rawName, hasRole = false) {
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
  return hasRole ? clean : `ticket-${clean}`;
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
 * Renomme un ticket au nom exact du candidat (ou retire "ticket-" si un rôle est attribué)
 */
async function renameTicketToCandidate(channel, candidateId, guild, forceRole = null) {
  if (!channel || !candidateId || candidateId === 'any') return false;

  try {
    const member = await guild.members.fetch(candidateId).catch(() => null);
    let exactName = null;
    let hasRole = false;

    if (member) {
      exactName = member.displayName || member.user.globalName || member.user.displayName || member.user.username;
      hasRole = forceRole !== null ? forceRole : hasRecruitedRole(member);
    } else {
      const user = await channel.client.users.fetch(candidateId).catch(() => null);
      if (user) {
        exactName = user.globalName || user.displayName || user.username;
      }
    }

    if (!exactName) return false;

    const targetName = formatTicketChannelName(exactName, hasRole);
    if (!targetName) return false;

    if (channel.name !== targetName) {
      await channel.setName(targetName, `Renommage ticket (${hasRole ? 'Rôle attribué' : 'Candidat'} : ${exactName})`);
      console.log(`🏷️ Ticket #${channel.id} renommé : #${channel.name} ➔ #${targetName} (Nom exact: "${exactName}", Rôle: ${hasRole})`);
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
  hasRecruitedRole,
  formatTicketChannelName,
  findCandidateInTicket,
  renameTicketToCandidate,
  renameAllExistingTickets,
};

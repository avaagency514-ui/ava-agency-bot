/**
 * services/pubService.js
 * Studio de Diffusion d'Annonces & Communication Interne (#pub)
 * Permet de créer, prévisualiser et diffuser des posts modernes avec embeds
 * et mentions ciblées dans les salons de l'agence.
 * Inclut l'optimisation IA (Gemini 3.5 Flash) et la prise en charge sans coupure
 * des textes longs (multi-embeds automatiques).
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType
} = require('discord.js');

const axios = require('axios');
const { vaQueries } = require('../database/db');
const { formatAnnouncementWithAI } = require('./gemini');

// ID du salon de contrôle
const CHANNEL_PUB_ID = '1568173565474373702';

// ID salon annonce général
const CHANNEL_ANNONCE_GENERAL_ID = '1496964824578523356';

// Map des brouillons en cours d'édition (draftId -> DraftObject)
const pubDrafts = new Map();

// Thèmes visuels disponibles
const PUB_THEMES = {
  info: {
    id: 'info',
    label: 'Information',
    badge: 'INFORMATION OFFICIELLE',
    color: 0x3498db, // Bleu Cobalt
    emoji: 'ℹ️'
  },
  success: {
    id: 'success',
    label: 'Succès / Primes',
    badge: 'FÉLICITATIONS & OBJECTIFS',
    color: 0x2ecc71, // Vert Émeraude
    emoji: '🏆'
  },
  warning: {
    id: 'warning',
    label: 'Rappel / Consigne',
    badge: 'RAPPEL IMPORTANT • CONSIGNES',
    color: 0xf39c12, // Orange Vif
    emoji: '⚠️'
  },
  urgent: {
    id: 'urgent',
    label: 'Urgent / Alerte',
    badge: 'COMMUNIQUÉ URGENT • ACTION REQUISE',
    color: 0xe74c3c, // Rouge Carmin
    emoji: '🚨'
  },
  royal: {
    id: 'royal',
    label: 'Direction AVA',
    badge: 'COMMUNICATION DE LA DIRECTION',
    color: 0x9b59b6, // Violet AVA
    emoji: '👑'
  }
};

// Modèles express prédéfinis
const PUB_TEMPLATES = {
  fin_session: {
    title: '🏁 FIN DE SESSION & BILAN DES SUBMISSIONS',
    badge: 'CLÔTURE DE SESSION',
    theme: 'success',
    content: `L'ensemble de l'équipe tient à féliciter les VAs et Chatters pour leur investissement durant cette session !\n\n` +
             `📊 **Rappels importants pour les règlements :**\n` +
             `• Vérifiez que tous vos subs ont bien été comptabilisés dans vos salons respectifs.\n` +
             `• Seuil minimum de validation : **30 subs valides** (report automatique pour la session suivante en cas de seuil non atteint).\n` +
             `• Les bonus d'excellence et primes seront versés sous 48h.\n\n` +
             `*Merci pour votre professionnalisme et continuez sur cette lancée ! 🚀*`
  },
  pointage_rappel: {
    title: '⏰ RAPPEL OBLIGATOIRE : POINTAGE DES SHIFTS CHATTERS',
    badge: 'CONSIGNE OPÉRATIONNELLE',
    theme: 'warning',
    content: `Rappel à tous les **Chatters** concernant la gestion des créneaux de travail :\n\n` +
             `1️⃣ **Arrivée en shift :** Vous devez obligatoirement cliquer sur **Prise de poste** dans <#1553741516462362794> dès votre connexion.\n` +
             `2️⃣ **Tolérance retard :** Tout retard supérieur à **15 minutes** non justifié auprès du Manager sera sanctionné d'un avertissement officiel.\n` +
             `3️⃣ **Fin de shift :** N'oubliez pas de valider votre **Fin de poste** et d'enregistrer vos ventes de la journée.\n\n` +
             `*La ponctualité et la rigueur sont indispensables à la réussite de l'agence.*`
  },
  nouvelle_regle: {
    title: '📋 NOUVELLE DIRECTIVE OPÉRATIONNELLE',
    badge: 'RÈGLEMENT & PROCÉDURES',
    theme: 'info',
    content: `Une mise à jour importante de nos processus de travail vient d'être mise en place :\n\n` +
             `📌 **Ce qui change dès aujourd'hui :**\n` +
             `• Merci de consulter attentivement le guide mis à jour dans vos salons de formation.\n` +
             `• Les managers de pôle restent à votre disposition pour toute question ou accompagnement.\n\n` +
             `*Veuillez réagir avec un emoji sous ce message pour confirmer votre lecture et prise en compte.*`
  },
  urgence: {
    title: '🚨 ATTENTION REQUISE : SITUATION URGENTE',
    badge: 'ALERTE IMMÉDIATE',
    theme: 'urgent',
    content: `Merci de suspendre immédiatement vos actions en cours et de lire attentivement cette consigne :\n\n` +
             `⚠️ **Action requise de tous les membres concernés :**\n` +
             `• Suivez scrupuleusement les consignes transmises par votre manager.\n` +
             `• Tout manquement sera immédiatement signalé à la direction.\n\n` +
             `*Reprise normale des activités dès confirmation officielle.*`
  }
};

/**
 * Découpe intelligemment un texte trop long en morceaux de moins de maxChunk caractères
 * en respectant les paragraphes et retours à la ligne.
 */
function splitContentIntoChunks(content, maxChunk = 3800) {
  if (!content || content.length <= maxChunk) {
    return [content || ''];
  }

  const chunks = [];
  let remaining = content;

  while (remaining.length > 0) {
    if (remaining.length <= maxChunk) {
      chunks.push(remaining);
      break;
    }

    // Coupure sur double saut de ligne si possible
    let splitIdx = remaining.lastIndexOf('\n\n', maxChunk);
    if (splitIdx === -1 || splitIdx < maxChunk * 0.5) {
      // Sinon sur simple saut de ligne
      splitIdx = remaining.lastIndexOf('\n', maxChunk);
    }
    if (splitIdx === -1 || splitIdx < maxChunk * 0.3) {
      // Sinon sur espace
      splitIdx = remaining.lastIndexOf(' ', maxChunk);
    }
    if (splitIdx === -1) {
      splitIdx = maxChunk;
    }

    chunks.push(remaining.substring(0, splitIdx).trim());
    remaining = remaining.substring(splitIdx).trim();
  }

  return chunks;
}

/**
 * Construit un tableau d'Embeds modernes pour l'annonce.
 * Si le contenu dépasse la limite Discord, il est automatiquement découpé en plusieurs embeds consécutifs sans perte.
 */
function buildAnnouncementEmbeds(draft) {
  const theme = PUB_THEMES[draft.theme] || PUB_THEMES.info;
  const activeContent = (draft.useAi && draft.aiContent) ? draft.aiContent : draft.rawContent;
  const chunks = splitContentIntoChunks(activeContent, 3800);

  const embeds = [];

  chunks.forEach((chunk, index) => {
    const isFirst = index === 0;
    const isLast = index === chunks.length - 1;

    const embed = new EmbedBuilder().setColor(theme.color);

    if (isFirst) {
      embed.setAuthor({
        name: `AVA Agency • ${draft.badge || theme.badge}`,
        iconURL: draft.authorAvatar || undefined
      });
      embed.setTitle(`${theme.emoji} ${draft.title}`);
      if (draft.imageUrl) {
        embed.setImage(draft.imageUrl);
      }
    } else {
      embed.setTitle(`${theme.emoji} ${draft.title} — Suite (${index + 1}/${chunks.length})`);
    }

    embed.setDescription(chunk);

    if (isLast) {
      const modeNotice = draft.useAi ? ' • ✨ Optimisé par IA' : '';
      embed.setFooter({
        text: `Publié par ${draft.authorTag}${modeNotice} • AVA Management System`
      });
      embed.setTimestamp(draft.createdAt || Date.now());
    }

    embeds.push(embed);
  });

  return embeds;
}

/**
 * Extrait un salon Discord à partir d'un lien complet, d'une mention ou d'un ID
 */
function extractChannelFromInput(input, guild) {
  if (!input) return null;
  const str = input.trim();

  // 1. Chercher tous les IDs numériques (17 à 20 chiffres)
  const matches = str.match(/\d{17,20}/g);
  if (matches && matches.length > 0) {
    // Tester du dernier au premier (dans https://discord.com/channels/GUILD_ID/CHANNEL_ID, le second est le salon)
    for (let i = matches.length - 1; i >= 0; i--) {
      const ch = guild.channels.cache.get(matches[i]);
      if (ch && ch.isTextBased()) return ch;
    }
  }

  // 2. Recherche par mention ou nom
  const clean = str.replace(/[<#>]/g, '').trim().toLowerCase();
  const byExactName = guild.channels.cache.find(c => c.isTextBased() && c.name.toLowerCase() === clean);
  if (byExactName) return byExactName;

  const byPartialName = guild.channels.cache.find(c => c.isTextBased() && c.name.toLowerCase().includes(clean));
  if (byPartialName) return byPartialName;

  return null;
}

/**
 * Génère le texte d'en-tête de notification (mentions)
 */
function getMentionText(draft) {
  if (draft.mentionType === 'everyone') {
    return '📢 **Notification Générale :** @everyone\n';
  }
  if (draft.mentionType === 'here') {
    return '📢 **Notification d\'Équipe :** @here\n';
  }
  if (draft.mentionType === 'role' && draft.mentionRoleId) {
    return `📢 **Notification :** <@&${draft.mentionRoleId}>\n`;
  }
  if (draft.targetMode === 'role' && draft.targetRoleId) {
    return `📢 **Notification :** <@&${draft.targetRoleId}>\n`;
  }
  return '';
}

/**
 * Retourne le libellé de la cible sélectionnée
 */
function getTargetLabel(draft) {
  if (draft.targetMode === 'role' && draft.targetRoleId) {
    return `👥 **Par Rôle :** <@&${draft.targetRoleId}> (Salons du pôle + Salons privés)`;
  }
  if (draft.targetMode === 'channels') {
    const ids = draft.channelIds || [];
    if (ids.length === 0) return '⚠️ Aucun salon sélectionné !';
    if (ids.length === 1) return `📍 **Salon :** <#${ids[0]}>`;
    if (ids.length <= 4) return `📍 **Salons (${ids.length}) :** ${ids.map(id => `<#${id}>`).join(', ')}`;
    return `📍 **Salons (${ids.length}) :** ${ids.slice(0, 3).map(id => `<#${id}>`).join(', ')} (+${ids.length - 3} autres)`;
  }

  // Mode preset
  switch (draft.targetPreset) {
    case 'all_vas_team':
      return '💼 **Pôles VAs** (Tous les salons d\'équipe : FB, Twitter, Insta, Threads)';
    case 'all_vas_personal':
      return '👤 **VAs Actifs** (Salons individuels privés)';
    case 'all_chatters':
      return '💬 **Pôle Chatters** (FR & US)';
    case 'all_managers':
      return '👔 **Espace Managers**';
    default:
      return '📢 **#annonce-general**';
  }
}

/**
 * Construit l'ensemble des composants interactifs de l'aperçu
 */
function buildPreviewComponents(draft) {
  // Ligne 1 : Thèmes de Style
  const themeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pub_theme_info_${draft.id}`)
      .setLabel('🔵 Info')
      .setStyle(draft.theme === 'info' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`pub_theme_success_${draft.id}`)
      .setLabel('🟢 Succès')
      .setStyle(draft.theme === 'success' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`pub_theme_warning_${draft.id}`)
      .setLabel('🟠 Rappel')
      .setStyle(draft.theme === 'warning' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`pub_theme_urgent_${draft.id}`)
      .setLabel('🔴 Urgent')
      .setStyle(draft.theme === 'urgent' ? ButtonStyle.Danger : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`pub_theme_royal_${draft.id}`)
      .setLabel('🟣 Direction')
      .setStyle(draft.theme === 'royal' ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );

  // Ligne 2 : Menu Déroulant des Cibles (Présélections, Rôle, Salons)
  const destSelect = new StringSelectMenuBuilder()
    .setCustomId(`pub_select_dest_${draft.id}`)
    .setPlaceholder('🎯 Choisir la cible (Par Rôle, Par Salon, Groupes VAs...)')
    .addOptions([
      {
        label: '📢 #annonce-general',
        description: 'Publier dans le salon général d\'annonces',
        value: 'annonce_general',
        emoji: '📢',
        default: draft.targetMode === 'preset' && draft.targetPreset === 'annonce_general'
      },
      {
        label: '👥 Par Rôle spécifique...',
        description: 'Cibler les salons d\'un rôle précis (ex: VA FB, Chatter...)',
        value: 'pick_role',
        emoji: '👥',
        default: draft.targetMode === 'role'
      },
      {
        label: '💼 Tous les pôles VAs (Salons d\'équipe)',
        description: 'Salons de discussion et travail d\'Insta, Twitter, Threads, FB...',
        value: 'all_vas_team',
        emoji: '💼',
        default: draft.targetMode === 'preset' && draft.targetPreset === 'all_vas_team'
      },
      {
        label: '👤 VAs Actifs (Salons individuels)',
        description: 'Envoyer directement dans chaque salon privé de VA',
        value: 'all_vas_personal',
        emoji: '👤',
        default: draft.targetMode === 'preset' && draft.targetPreset === 'all_vas_personal'
      },
      {
        label: '💬 Pôle Chatters (FR & US)',
        description: 'Salons de travail et discussion des Chatters',
        value: 'all_chatters',
        emoji: '💬',
        default: draft.targetMode === 'preset' && draft.targetPreset === 'all_chatters'
      },
      {
        label: '👔 Espace Managers',
        description: 'Salons privés des managers',
        value: 'all_managers',
        emoji: '👔',
        default: draft.targetMode === 'preset' && draft.targetPreset === 'all_managers'
      },
      {
        label: '📍 Choisir des salons dans la liste...',
        description: 'Cocher un ou plusieurs salons précis dans le serveur',
        value: 'pick_channels',
        emoji: '📍',
        default: draft.targetMode === 'channels'
      },
      {
        label: '🔗 Coller un Lien / ID de salon...',
        description: 'Entrer directement le lien Discord ou l\'ID d\'un salon',
        value: 'paste_link',
        emoji: '🔗'
      }
    ]);

  const targetRow = new ActionRowBuilder().addComponents(destSelect);

  // Ligne 3 : Options de mentions
  const mentionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pub_mention_none_${draft.id}`)
      .setLabel('🔕 Sans ping')
      .setStyle(draft.mentionType === 'none' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`pub_mention_everyone_${draft.id}`)
      .setLabel('🔔 @everyone')
      .setStyle(draft.mentionType === 'everyone' ? ButtonStyle.Danger : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`pub_mention_here_${draft.id}`)
      .setLabel('⚡ @here')
      .setStyle(draft.mentionType === 'here' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`pub_open_role_menu_${draft.id}`)
      .setLabel(draft.mentionRoleId ? '👥 Rôle choisi ✅' : '👥 Choisir un Rôle...')
      .setStyle(draft.mentionType === 'role' ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );

  // Ligne 4 : Options de mise en forme & IA
  const aiButtonLabel = draft.useAi ? '✨ Version IA (Active)' : '📄 Version d\'origine (Active)';
  const aiRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pub_toggle_ai_${draft.id}`)
      .setLabel(aiButtonLabel)
      .setEmoji(draft.useAi ? '✨' : '📄')
      .setStyle(draft.useAi ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`pub_btn_reai_${draft.id}`)
      .setLabel('🔄 Re-sublimer avec l\'IA')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`pub_btn_edit_${draft.id}`)
      .setLabel('✏️ Modifier manuellement')
      .setStyle(ButtonStyle.Secondary)
  );

  // Ligne 5 : Actions finales et Raccourcis Cibles directs
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pub_btn_broadcast_${draft.id}`)
      .setLabel('🚀 Diffuser Maintenant')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`pub_btn_direct_role_${draft.id}`)
      .setLabel('👥 Par Rôle')
      .setStyle(draft.targetMode === 'role' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`pub_btn_direct_link_${draft.id}`)
      .setLabel('🔗 Coller Lien / ID')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`pub_btn_cancel_${draft.id}`)
      .setLabel('🗑️ Annuler')
      .setStyle(ButtonStyle.Danger)
  );

  return [themeRow, targetRow, mentionRow, aiRow, actionRow];
}

/**
 * Construit le message de prévisualisation complet
 */
function buildPreviewMessage(draft) {
  const embeds = buildAnnouncementEmbeds(draft);
  const mentionPreview = getMentionText(draft);
  const targetLabel = getTargetLabel(draft);

  const partsCount = embeds.length > 1 ? ` *(Message divisé en ${embeds.length} parties pour Discord)*` : '';
  const aiModeStatus = draft.useAi ? '✨ **Sublimé par l\'IA** (mise en page moderne)' : '📄 **Texte d\'origine** (brut)';

  const header = `### 👁️ APERÇU DE VOTRE ANNONCE AVA STUDIO\n` +
                 `📍 **Destination :** ${targetLabel}${partsCount}\n` +
                 `🔔 **Mention :** ${mentionPreview.trim() || '*Aucune (diffusion silencieuse)*'}\n` +
                 `🎨 **Style :** ${aiModeStatus}\n` +
                 `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  // Discord autorise jusqu'à 10 embeds par message
  return {
    content: `${header}\n${mentionPreview}`,
    embeds: embeds.slice(0, 10),
    components: buildPreviewComponents(draft)
  };
}

/**
 * Configure ou met à jour le panneau de contrôle permanent dans #pub
 */
async function setupPubPanelChannel(client) {
  try {
    const channel = await client.channels.fetch(CHANNEL_PUB_ID).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    // Purger les anciens panneaux du bot
    const messages = await channel.messages.fetch({ limit: 30 }).catch(() => null);
    if (messages) {
      const oldPanels = messages.filter(m =>
        m.author.id === client.user.id &&
        m.embeds.length > 0 &&
        m.embeds[0]?.title?.includes('AVA Broadcast Studio')
      );
      for (const [, oldMsg] of oldPanels) {
        await oldMsg.delete().catch(() => {});
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x8A2BE2) // Violet élégant
      .setTitle('📢 AVA Broadcast Studio — Diffusion d\'Annonces & Posts')
      .setDescription(
        `Bienvenue dans le **Centre de Diffusion Officiel** d'AVA Agency.\n` +
        `Depuis cet espace, vous pouvez créer, styliser et propulser des annonces percutantes vers l'ensemble de vos équipes.\n\n` +
        `✨ **Comment créer un post ?**\n` +
        `• **Option 1 (Direct dans ce salon) :** Écrivez ou collez simplement votre texte (sans limite de longueur, même de très longs guides ou SOPs) ou déposez un fichier \`.txt\` ou une image.\n` +
        `• **Option 2 (Formulaire interactif) :** Cliquez sur **📝 Créer une Annonce** ci-dessous.\n\n` +
        `🤖 **Mise en forme intelligente par l'IA :**\n` +
        `L'IA (Gemini 3.5 Flash) prend automatiquement en charge la restructuration de vos textes bruts : titres élégants, étapes claires, gras percutant, listes aérées et emojis adaptés.\n\n` +
        `🎯 **Fonctionnalités disponibles :**\n` +
        `• **Prise en charge intégrale des longs textes :** Aucune coupure, découpage automatique en multi-embeds si nécessaire.\n` +
        `• **5 Thèmes visuels :** Info, Succès/Primes, Rappels, Urgent, Direction.\n` +
        `• **Ciblage par pôle :** Annonce générale, VAs (salons d'équipe ou individuels), Chatters, ou sur-mesure.\n` +
        `• **Mentions ciblées :** Sans ping, \`@everyone\`, \`@here\`, ou mentions par rôle spécifique.\n\n` +
        `*Prêt à communiquer ? Utilisez les commandes interactives ci-dessous :*`
      )
      .setFooter({ text: 'AVA Agency • Studio de Communication Interne' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('pub_btn_create_modal')
        .setLabel('📝 Créer une Annonce')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('pub_btn_templates')
        .setLabel('⚡ Modèles Express')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('pub_btn_refresh_panel')
        .setLabel('🔄 Actualiser le Studio')
        .setStyle(ButtonStyle.Secondary)
    );

    await channel.send({ embeds: [embed], components: [row] });
    console.log('✅ Panneau AVA Broadcast Studio initialisé dans #pub');
  } catch (err) {
    console.error('❌ Erreur setupPubPanelChannel:', err.message);
  }
}

/**
 * Gère le dépôt direct d'un message dans #pub
 */
async function handlePubMessageDrop(message, client) {
  if (message.author.bot) return;
  if (message.channelId !== CHANNEL_PUB_ID) return;

  let rawContent = message.content ? message.content.trim() : '';
  let imageUrl = null;

  // Vérifier les pièces jointes (fichiers texte ou images)
  if (message.attachments && message.attachments.size > 0) {
    for (const [, att] of message.attachments) {
      if (att.name.endsWith('.txt')) {
        try {
          const res = await axios.get(att.url, { responseType: 'text' });
          if (res.data) {
            rawContent = (rawContent ? rawContent + '\n\n' : '') + res.data;
          }
        } catch (e) {
          console.warn('⚠️ Échec lecture fichier txt joint:', e.message);
        }
      } else if (att.contentType?.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(att.name)) {
        imageUrl = att.url;
      }
    }
  }

  if (!rawContent && !imageUrl) return;

  // Supprimer le message d'origine du salon pour garder #pub propre
  try {
    await message.delete();
  } catch (e) {}

  // Message temporaire pour signaler l'optimisation IA
  const loadingMsg = await message.channel.send({
    content: `⏳ **Analyse et mise en forme de votre post par l'IA en cours...** (Veuillez patienter 2 secondes)`
  });

  // Déduire un titre automatique ou laisser l'IA le générer
  const lines = rawContent.split('\n').map(l => l.trim()).filter(Boolean);
  let titleHint = (lines.length > 0 && lines[0].length <= 80) ? lines[0].replace(/^[#* \-_]+|[#* \-_]+$/g, '') : 'COMMUNIQUÉ OFFICIEL';

  let aiResult = null;
  try {
    aiResult = await formatAnnouncementWithAI(rawContent, titleHint);
  } catch (aiErr) {
    console.warn('⚠️ Échec optimisation IA annonce:', aiErr.message);
  }

  const draftId = `pub_${Date.now()}_${message.author.id}`;
  const draft = {
    id: draftId,
    authorId: message.author.id,
    authorTag: message.author.tag || message.author.username,
    authorAvatar: message.author.displayAvatarURL(),
    title: aiResult ? aiResult.title : titleHint,
    badge: aiResult ? aiResult.badge : 'COMMUNICATION INTERNE',
    rawContent: rawContent,
    aiContent: aiResult ? aiResult.content : rawContent,
    useAi: Boolean(aiResult),
    imageUrl,
    theme: 'info',
    channelIds: [CHANNEL_ANNONCE_GENERAL_ID],
    targetPreset: 'annonce_general',
    customChannelIds: [],
    mentionType: 'none',
    mentionRoleId: null,
    createdAt: Date.now()
  };

  pubDrafts.set(draftId, draft);

  // Mettre à jour avec l'aperçu interactif
  const preview = buildPreviewMessage(draft);
  await loadingMsg.edit(preview);
}

/**
 * Résout les salons cibles pour un draft donné
 */
async function resolveTargetChannels(draft, guild) {
  const channels = [];

  // 1. Ciblage PAR RÔLE
  if (draft.targetMode === 'role' && draft.targetRoleId) {
    const role = guild.roles.cache.get(draft.targetRoleId);
    const roleName = role ? role.name.toLowerCase() : '';

    const categoryIds = [];
    if (roleName.includes('fb') || roleName.includes('face')) {
      categoryIds.push('1555269794696274172'); // Espace facebook
    } else if (roleName.includes('twitter') && roleName.includes('fr')) {
      categoryIds.push('1502713094789529792'); // Espace twitter FR
    } else if (roleName.includes('twitter') && roleName.includes('us')) {
      categoryIds.push('1555278617058091058'); // Espace twitter US
    } else if (roleName.includes('insta') || roleName.includes('mobile')) {
      categoryIds.push('1498966532322234508'); // Espace insta Mobile FR
    } else if (roleName.includes('jailbreak')) {
      categoryIds.push('1430837591166685194'); // Espace insta jailbreak FR
    } else if (roleName.includes('threads')) {
      categoryIds.push('1555277343122264266'); // Espace threads fr
    } else if (roleName.includes('chatter')) {
      categoryIds.push('1524736043985928244'); // Chatting FR
      categoryIds.push('1555279742008295424'); // Chatting US
    } else if (roleName.includes('manager') || roleName.includes('fondateur') || roleName.includes('boss')) {
      categoryIds.push('1555451162302353408'); // Espace manager
    }

    // Salons d'équipe associés à ces catégories
    for (const catId of categoryIds) {
      const catChannels = guild.channels.cache.filter(c =>
        c.parentId === catId &&
        c.isTextBased() &&
        (c.name.includes('discussion') || c.name.includes('travaille') || c.name.includes('sop') || c.name.includes('drive-contenu'))
      );
      catChannels.forEach(c => channels.push(c));
    }

    // Salons privés des membres ayant ce rôle
    if (role) {
      try {
        const vas = vaQueries.getActifs.all();
        const memberIds = new Set(role.members.map(m => m.id));
        for (const va of vas) {
          if (va.discord_id && memberIds.has(va.discord_id) && va.channel_id) {
            const ch = guild.channels.cache.get(va.channel_id);
            if (ch && ch.isTextBased()) channels.push(ch);
          }
        }
      } catch (e) {
        console.warn('⚠️ Erreur lecture salons privés pour rôle:', e.message);
      }
    }

    if (channels.length === 0) {
      const ch = guild.channels.cache.get(CHANNEL_ANNONCE_GENERAL_ID);
      if (ch && ch.isTextBased()) channels.push(ch);
    }
  }

  // 2. Ciblage PAR SALON(S)
  else if (draft.targetMode === 'channels') {
    const ids = (draft.channelIds && draft.channelIds.length > 0)
      ? draft.channelIds
      : (draft.customChannelIds && draft.customChannelIds.length > 0)
        ? draft.customChannelIds
        : [CHANNEL_ANNONCE_GENERAL_ID];

    for (const chId of ids) {
      const ch = guild.channels.cache.get(chId);
      if (ch && ch.isTextBased()) channels.push(ch);
    }
  }

  // 3. Ciblage PAR GROUPE PRÉDÉFINI (PRESET)
  else {
    if (draft.targetPreset === 'all_vas_team') {
      const vaCategories = [
        '1498966532322234508', // Espace insta Mobile FR
        '1502713094789529792', // Espace twitter FR
        '1555278617058091058', // Espace twitter US
        '1555277343122264266', // Espace threads fr
        '1555269794696274172', // Espace facebook
        '1430837591166685194', // Espace insta jailbreak FR
      ];

      for (const catId of vaCategories) {
        const catChannels = guild.channels.cache.filter(c =>
          c.parentId === catId &&
          c.isTextBased() &&
          (c.name.includes('discussion') || c.name.includes('travaille') || c.name.includes('sop') || c.name.includes('drive-contenu'))
        );
        catChannels.forEach(c => channels.push(c));
      }
    }
    else if (draft.targetPreset === 'all_vas_personal') {
      try {
        const vas = vaQueries.getActifs.all();
        for (const va of vas) {
          if (va.channel_id) {
            const ch = guild.channels.cache.get(va.channel_id);
            if (ch && ch.isTextBased()) channels.push(ch);
          }
        }
      } catch (e) {
        console.warn('⚠️ Erreur lecture vas dans SQLite:', e.message);
      }
    }
    else if (draft.targetPreset === 'all_chatters') {
      const chatterCategories = [
        '1524736043985928244', // Chatting FR
        '1555279742008295424', // Chatting US
      ];

      for (const catId of chatterCategories) {
        const catChannels = guild.channels.cache.filter(c =>
          c.parentId === catId &&
          c.isTextBased() &&
          (c.name.includes('discusion') || c.name.includes('work') || c.name.includes('travaille') || c.name.includes('revenu'))
        );
        catChannels.forEach(c => channels.push(c));
      }
    }
    else if (draft.targetPreset === 'all_managers') {
      const mgrChannels = guild.channels.cache.filter(c =>
        c.parentId === '1555451162302353408' &&
        c.isTextBased()
      );
      mgrChannels.forEach(c => channels.push(c));
    }
    else {
      const ch = guild.channels.cache.get(CHANNEL_ANNONCE_GENERAL_ID);
      if (ch && ch.isTextBased()) channels.push(ch);
    }
  }

  // Éliminer les doublons éventuels
  const uniqueChannels = Array.from(new Map(channels.map(c => [c.id, c])).values());
  return uniqueChannels;
}

/**
 * Gère toutes les interactions liées à #pub (Boutons, Modals, Sélecteurs)
 */
async function handlePubInteraction(interaction, client) {
  const id = interaction.customId;

  // 1. Bouton "Créer une Annonce" (Ouvre la modale)
  if (id === 'pub_btn_create_modal') {
    const modal = new ModalBuilder()
      .setCustomId('pub_modal_create_submit')
      .setTitle('📢 Nouvelle Annonce AVA Studio');

    const titleInput = new TextInputBuilder()
      .setCustomId('pub_input_title')
      .setLabel('Titre de l\'Annonce')
      .setPlaceholder('Ex: 🚀 NOUVEL OBJECTIF DE SEMAINE')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(100)
      .setRequired(true);

    const badgeInput = new TextInputBuilder()
      .setCustomId('pub_input_badge')
      .setLabel('Badge / Sous-titre (Optionnel)')
      .setPlaceholder('Ex: ANNONCE IMPORTANTE • PÔLE VAs')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(50)
      .setRequired(false);

    const contentInput = new TextInputBuilder()
      .setCustomId('pub_input_content')
      .setLabel('Contenu du Message (Markdown supporté)')
      .setPlaceholder('Rédigez ou collez votre texte ici... L\'IA se chargera de le sublimer ! (max 4000 car.)')
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(4000)
      .setRequired(true);

    const imageInput = new TextInputBuilder()
      .setCustomId('pub_input_image')
      .setLabel('URL de l\'image ou bannière (Optionnel)')
      .setPlaceholder('https://...')
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(badgeInput),
      new ActionRowBuilder().addComponents(contentInput),
      new ActionRowBuilder().addComponents(imageInput)
    );

    return interaction.showModal(modal);
  }

  // 2. Bouton "Modèles Express"
  if (id === 'pub_btn_templates') {
    const select = new StringSelectMenuBuilder()
      .setCustomId('pub_select_template_apply')
      .setPlaceholder('📋 Choisissez un modèle d\'annonce...')
      .addOptions([
        {
          label: '🏆 Fin de Session & Bilan des Submissions',
          description: 'Félicitations, rappels des 30 subs, validation et primes',
          value: 'fin_session',
          emoji: '🏆'
        },
        {
          label: '⏰ Rappel Pointage Chatters',
          description: 'Prise de poste obligatoire, retards 15 min, sanctions',
          value: 'pointage_rappel',
          emoji: '⏰'
        },
        {
          label: '📋 Nouvelle Directive Opérationnelle',
          description: 'Mise à jour des règles, lecture obligatoire',
          value: 'nouvelle_regle',
          emoji: '📋'
        },
        {
          label: '🚨 Alerte Urgente / Consigne Immédiate',
          description: 'Action requise de tous les membres concernés',
          value: 'urgence',
          emoji: '🚨'
        }
      ]);

    const row = new ActionRowBuilder().addComponents(select);
    return interaction.reply({
      content: '👉 **Sélectionnez un modèle pré-rempli ci-dessous pour créer un brouillon :**',
      components: [row],
      ephemeral: true
    });
  }

  // 3. Application d'un modèle express sélectionné
  if (id === 'pub_select_template_apply') {
    const tmplKey = interaction.values[0];
    const tmpl = PUB_TEMPLATES[tmplKey];
    if (!tmpl) return interaction.reply({ content: 'Modèle introuvable.', ephemeral: true });

    const draftId = `pub_${Date.now()}_${interaction.user.id}`;
    const draft = {
      id: draftId,
      authorId: interaction.user.id,
      authorTag: interaction.user.tag || interaction.user.username,
      authorAvatar: interaction.user.displayAvatarURL(),
      title: tmpl.title,
      badge: tmpl.badge,
      rawContent: tmpl.content,
      aiContent: tmpl.content,
      useAi: true,
      imageUrl: null,
      theme: tmpl.theme,
      channelIds: [CHANNEL_ANNONCE_GENERAL_ID],
      targetPreset: 'annonce_general',
      customChannelIds: [],
      mentionType: 'none',
      mentionRoleId: null,
      createdAt: Date.now()
    };

    pubDrafts.set(draftId, draft);

    const channel = interaction.channel;
    const preview = buildPreviewMessage(draft);
    await channel.send(preview);

    return interaction.update({
      content: `✅ Modèle **${tmpl.title}** généré avec succès dans le salon !`,
      components: []
    });
  }

  // 4. Bouton Actualiser le studio
  if (id === 'pub_btn_refresh_panel') {
    await interaction.deferUpdate();
    return setupPubPanelChannel(client);
  }

  // 5. Soumission de la modale de création
  if (id === 'pub_modal_create_submit') {
    await interaction.deferReply();

    const title = interaction.fields.getTextInputValue('pub_input_title');
    const badge = interaction.fields.getTextInputValue('pub_input_badge') || 'COMMUNICATION INTERNE';
    const rawContent = interaction.fields.getTextInputValue('pub_input_content');
    const imageUrl = interaction.fields.getTextInputValue('pub_input_image') || null;

    let aiResult = null;
    try {
      aiResult = await formatAnnouncementWithAI(rawContent, title);
    } catch (aiErr) {
      console.warn('⚠️ Échec optimisation IA modale:', aiErr.message);
    }

    const draftId = `pub_${Date.now()}_${interaction.user.id}`;
    const draft = {
      id: draftId,
      authorId: interaction.user.id,
      authorTag: interaction.user.tag || interaction.user.username,
      authorAvatar: interaction.user.displayAvatarURL(),
      title: aiResult ? aiResult.title : title,
      badge: aiResult ? aiResult.badge : badge,
      rawContent,
      aiContent: aiResult ? aiResult.content : rawContent,
      useAi: Boolean(aiResult),
      imageUrl,
      theme: 'info',
      channelIds: [CHANNEL_ANNONCE_GENERAL_ID],
      targetPreset: 'annonce_general',
      customChannelIds: [],
      mentionType: 'none',
      mentionRoleId: null,
      createdAt: Date.now()
    };

    pubDrafts.set(draftId, draft);

    const preview = buildPreviewMessage(draft);
    return interaction.editReply(preview);
  }

  // 6. Changement de Thème (pub_theme_THEME_DRAFTID)
  if (id.startsWith('pub_theme_')) {
    const parts = id.split('_');
    const themeName = parts[2];
    const draftId = parts.slice(3).join('_');

    const draft = pubDrafts.get(draftId);
    if (!draft) return interaction.reply({ content: 'Brouillon introuvable ou expiré.', ephemeral: true });

    draft.theme = themeName;
    const preview = buildPreviewMessage(draft);
    return interaction.update(preview);
  }

  // 7. Basculer entre Version IA et Version d'origine (pub_toggle_ai_DRAFTID)
  if (id.startsWith('pub_toggle_ai_')) {
    const draftId = id.replace('pub_toggle_ai_', '');
    const draft = pubDrafts.get(draftId);
    if (!draft) return interaction.reply({ content: 'Brouillon introuvable ou expiré.', ephemeral: true });

    draft.useAi = !draft.useAi;
    const preview = buildPreviewMessage(draft);
    return interaction.update(preview);
  }

  // 8. Re-sublimer avec l'IA (pub_btn_reai_DRAFTID)
  if (id.startsWith('pub_btn_reai_')) {
    const draftId = id.replace('pub_btn_reai_', '');
    const draft = pubDrafts.get(draftId);
    if (!draft) return interaction.reply({ content: 'Brouillon introuvable ou expiré.', ephemeral: true });

    await interaction.deferUpdate();

    try {
      const aiResult = await formatAnnouncementWithAI(draft.rawContent, draft.title);
      if (aiResult) {
        draft.title = aiResult.title;
        draft.badge = aiResult.badge;
        draft.aiContent = aiResult.content;
        draft.useAi = true;
      }
    } catch (aiErr) {
      console.warn('⚠️ Échec ré-optimisation IA:', aiErr.message);
    }

    const preview = buildPreviewMessage(draft);
    return interaction.editReply(preview);
  }

  // 9. Sélecteur principal de cible / destination (pub_select_dest_DRAFTID)
  if (id.startsWith('pub_select_dest_')) {
    const draftId = id.replace('pub_select_dest_', '');
    const draft = pubDrafts.get(draftId);
    if (!draft) return interaction.reply({ content: 'Brouillon introuvable ou expiré.', ephemeral: true });

    const val = interaction.values[0];

    if (val === 'pick_role') {
      const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId(`pub_select_role_target_${draft.id}`)
        .setPlaceholder('👥 Choisissez le rôle à cibler (ex: VA FB fr, Chatter Fr...)')
        .setMinValues(1)
        .setMaxValues(1);

      const row = new ActionRowBuilder().addComponents(roleSelect);
      return interaction.reply({
        content: '🎯 **Choisissez le rôle précis à cibler :**\n*Le post sera diffusé dans les salons d\'équipe de ce pôle (ex: FB, Insta...) et aux salons privés de ses membres avec notification du rôle.*',
        components: [row],
        ephemeral: true
      });
    }

    if (val === 'pick_channels') {
      const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId(`pub_select_channels_picker_${draft.id}`)
        .setPlaceholder('📍 Cochez le ou les salons précis dans la liste...')
        .setChannelTypes([ChannelType.GuildText, ChannelType.GuildAnnouncement])
        .setMinValues(1)
        .setMaxValues(25);

      if (draft.channelIds && draft.channelIds.length > 0) {
        channelSelect.setDefaultChannels(draft.channelIds.slice(0, 25));
      }

      const row = new ActionRowBuilder().addComponents(channelSelect);
      return interaction.reply({
        content: '📍 **Sélectionnez le ou les salons cibles dans la liste du serveur :**',
        components: [row],
        ephemeral: true
      });
    }

    if (val === 'paste_link') {
      const modal = new ModalBuilder()
        .setCustomId(`pub_modal_link_submit_${draft.id}`)
        .setTitle('🔗 Coller le Lien ou l\'ID du Salon');

      const input = new TextInputBuilder()
        .setCustomId('pub_input_channel_link')
        .setLabel('Lien Discord, ID ou nom du salon')
        .setPlaceholder('ex: https://discord.com/channels/... ou #sop ou ID')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // Présélections prédéfinies (annonce_general, all_vas_team, all_vas_personal, all_chatters, all_managers)
    draft.targetMode = 'preset';
    draft.targetPreset = val;
    draft.targetRoleId = null;
    const preview = buildPreviewMessage(draft);
    return interaction.update(preview);
  }

  // 9a. Bouton direct "Par Rôle" (pub_btn_direct_role_DRAFTID)
  if (id.startsWith('pub_btn_direct_role_')) {
    const draftId = id.replace('pub_btn_direct_role_', '');
    const draft = pubDrafts.get(draftId);
    if (!draft) return interaction.reply({ content: 'Brouillon introuvable ou expiré.', ephemeral: true });

    const roleSelect = new RoleSelectMenuBuilder()
      .setCustomId(`pub_select_role_target_${draft.id}`)
      .setPlaceholder('👥 Choisissez le rôle à cibler (ex: VA FB fr, Chatter Fr...)')
      .setMinValues(1)
      .setMaxValues(1);

    const row = new ActionRowBuilder().addComponents(roleSelect);
    return interaction.reply({
      content: '🎯 **Choisissez le rôle précis à cibler :**\n*Le post sera diffusé dans les salons d\'équipe de ce pôle (ex: FB, Insta...) et aux salons privés de ses membres avec notification du rôle.*',
      components: [row],
      ephemeral: true
    });
  }

  // 9b. Sélection du rôle cible (pub_select_role_target_DRAFTID)
  if (id.startsWith('pub_select_role_target_')) {
    const draftId = id.replace('pub_select_role_target_', '');
    const draft = pubDrafts.get(draftId);
    if (!draft) return interaction.reply({ content: 'Brouillon introuvable.', ephemeral: true });

    const roleId = interaction.values[0];
    draft.targetMode = 'role';
    draft.targetRoleId = roleId;
    draft.mentionType = 'role';
    draft.mentionRoleId = roleId;

    await interaction.update({
      content: `✅ **Cible définie par Rôle :** <@&${roleId}>\n*Salons du pôle correspondants et salons membres sélectionnés avec notification du rôle.*`,
      components: []
    });

    try {
      const messages = await interaction.channel.messages.fetch({ limit: 10 });
      const previewMsg = messages.find(m => m.components.some(row => row.components.some(btn => btn.customId && btn.customId.includes(draftId))));
      if (previewMsg) {
        await previewMsg.edit(buildPreviewMessage(draft));
      }
    } catch (e) {}
    return;
  }

  // 9c. Bouton direct "Coller Lien / ID" (pub_btn_direct_link_DRAFTID)
  if (id.startsWith('pub_btn_direct_link_')) {
    const draftId = id.replace('pub_btn_direct_link_', '');
    const draft = pubDrafts.get(draftId);
    if (!draft) return interaction.reply({ content: 'Brouillon introuvable ou expiré.', ephemeral: true });

    const modal = new ModalBuilder()
      .setCustomId(`pub_modal_link_submit_${draft.id}`)
      .setTitle('🔗 Coller le Lien ou l\'ID du Salon');

    const input = new TextInputBuilder()
      .setCustomId('pub_input_channel_link')
      .setLabel('Lien Discord, ID ou nom du salon')
      .setPlaceholder('ex: https://discord.com/channels/... ou #sop ou ID')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  // 9d. Validation de la modale de lien/ID (pub_modal_link_submit_DRAFTID)
  if (id.startsWith('pub_modal_link_submit_')) {
    const draftId = id.replace('pub_modal_link_submit_', '');
    const draft = pubDrafts.get(draftId);
    if (!draft) return interaction.reply({ content: 'Brouillon introuvable.', ephemeral: true });

    const rawVal = interaction.fields.getTextInputValue('pub_input_channel_link').trim();
    const ch = extractChannelFromInput(rawVal, interaction.guild);

    if (!ch) {
      return interaction.reply({
        content: `❌ Aucun salon texte trouvé pour **« ${rawVal} »** sur le serveur AVA Agency.\nVérifiez le lien copié ou tapez le nom exact (ex: #sop).`,
        ephemeral: true
      });
    }

    draft.targetMode = 'channels';
    draft.channelIds = [ch.id];
    draft.customChannelIds = [ch.id];
    draft.targetRoleId = null;

    await interaction.reply({
      content: `✅ **Salon de destination défini avec succès :** <#${ch.id}> ${ch.parent ? `*(Catégorie ${ch.parent.name})*` : ''}`,
      ephemeral: true
    });

    try {
      const messages = await interaction.channel.messages.fetch({ limit: 10 });
      const previewMsg = messages.find(m => m.components.some(row => row.components.some(btn => btn.customId && btn.customId.includes(draftId))));
      if (previewMsg) {
        await previewMsg.edit(buildPreviewMessage(draft));
      }
    } catch (e) {}
    return;
  }

  // 9e. Sélection des salons via le picker (pub_select_channels_picker_DRAFTID)
  if (id.startsWith('pub_select_channels_picker_')) {
    const draftId = id.replace('pub_select_channels_picker_', '');
    const draft = pubDrafts.get(draftId);
    if (!draft) return interaction.reply({ content: 'Brouillon introuvable.', ephemeral: true });

    draft.targetMode = 'channels';
    draft.channelIds = interaction.values;
    draft.customChannelIds = interaction.values;
    draft.targetRoleId = null;

    await interaction.update({
      content: `✅ **${interaction.values.length} salon(s) sélectionné(s) :** ${interaction.values.map(chId => `<#${chId}>`).join(', ')}`,
      components: []
    });

    try {
      const messages = await interaction.channel.messages.fetch({ limit: 10 });
      const previewMsg = messages.find(m => m.components.some(row => row.components.some(btn => btn.customId && btn.customId.includes(draftId))));
      if (previewMsg) {
        await previewMsg.edit(buildPreviewMessage(draft));
      }
    } catch (e) {}
    return;
  }

  // 9f. Sélection directe de n'importe quel salon du serveur (rétrocompatibilité pub_select_channels_DRAFTID)
  if (id.startsWith('pub_select_channels_')) {
    const draftId = id.replace('pub_select_channels_', '');
    const draft = pubDrafts.get(draftId);
    if (!draft) return interaction.reply({ content: 'Brouillon introuvable ou expiré.', ephemeral: true });

    draft.targetMode = 'channels';
    draft.channelIds = interaction.values;
    draft.customChannelIds = interaction.values;
    draft.targetRoleId = null;
    const preview = buildPreviewMessage(draft);
    return interaction.update(preview);
  }

  // 9g. Raccourcis de compatibilité
  if (id.startsWith('pub_btn_target_annonce_')) {
    const draftId = id.replace('pub_btn_target_annonce_', '');
    const draft = pubDrafts.get(draftId);
    if (!draft) return interaction.reply({ content: 'Brouillon introuvable ou expiré.', ephemeral: true });

    draft.targetMode = 'preset';
    draft.targetPreset = 'annonce_general';
    draft.channelIds = [CHANNEL_ANNONCE_GENERAL_ID];
    draft.targetRoleId = null;
    const preview = buildPreviewMessage(draft);
    return interaction.update(preview);
  }

  if (id.startsWith('pub_btn_target_vas_')) {
    const draftId = id.replace('pub_btn_target_vas_', '');
    const draft = pubDrafts.get(draftId);
    if (!draft) return interaction.reply({ content: 'Brouillon introuvable ou expiré.', ephemeral: true });

    draft.targetMode = 'preset';
    draft.targetPreset = 'all_vas_team';
    draft.targetRoleId = null;
    const preview = buildPreviewMessage(draft);
    return interaction.update(preview);
  }

  if (id.startsWith('pub_select_target_')) {
    const draftId = id.replace('pub_select_target_', '');
    const draft = pubDrafts.get(draftId);
    if (!draft) return interaction.reply({ content: 'Brouillon introuvable ou expiré.', ephemeral: true });

    const selectedPreset = interaction.values[0];
    draft.targetMode = 'preset';
    draft.targetPreset = selectedPreset;
    draft.targetRoleId = null;

    const preview = buildPreviewMessage(draft);
    return interaction.update(preview);
  }

  // 10. Sélection des salons personnalisés (pub_select_custom_channels_DRAFTID)
  if (id.startsWith('pub_select_custom_channels_')) {
    const draftId = id.replace('pub_select_custom_channels_', '');
    const draft = pubDrafts.get(draftId);
    if (!draft) return interaction.reply({ content: 'Brouillon introuvable.', ephemeral: true });

    draft.customChannelIds = interaction.values;
    draft.targetPreset = 'custom';

    await interaction.update({
      content: `✅ **${interaction.values.length} salon(s) sélectionné(s) :** ${interaction.values.map(chId => `<#${chId}>`).join(', ')}`,
      components: []
    });

    try {
      const messages = await interaction.channel.messages.fetch({ limit: 10 });
      const previewMsg = messages.find(m => m.components.some(row => row.components.some(btn => btn.customId && btn.customId.includes(draftId))));
      if (previewMsg) {
        await previewMsg.edit(buildPreviewMessage(draft));
      }
    } catch (e) {}
    return;
  }

  // 11. Mentions rapides (pub_mention_none, pub_mention_everyone, pub_mention_here)
  if (id.startsWith('pub_mention_none_')) {
    const draftId = id.replace('pub_mention_none_', '');
    const draft = pubDrafts.get(draftId);
    if (!draft) return interaction.reply({ content: 'Brouillon introuvable.', ephemeral: true });

    draft.mentionType = 'none';
    draft.mentionRoleId = null;
    return interaction.update(buildPreviewMessage(draft));
  }

  if (id.startsWith('pub_mention_everyone_')) {
    const draftId = id.replace('pub_mention_everyone_', '');
    const draft = pubDrafts.get(draftId);
    if (!draft) return interaction.reply({ content: 'Brouillon introuvable.', ephemeral: true });

    draft.mentionType = 'everyone';
    draft.mentionRoleId = null;
    return interaction.update(buildPreviewMessage(draft));
  }

  if (id.startsWith('pub_mention_here_')) {
    const draftId = id.replace('pub_mention_here_', '');
    const draft = pubDrafts.get(draftId);
    if (!draft) return interaction.reply({ content: 'Brouillon introuvable.', ephemeral: true });

    draft.mentionType = 'here';
    draft.mentionRoleId = null;
    return interaction.update(buildPreviewMessage(draft));
  }

  // 12. Menu déroulant pour choisir un rôle spécifique
  if (id.startsWith('pub_open_role_menu_')) {
    const draftId = id.replace('pub_open_role_menu_', '');
    const draft = pubDrafts.get(draftId);
    if (!draft) return interaction.reply({ content: 'Brouillon introuvable.', ephemeral: true });

    const roleSelect = new RoleSelectMenuBuilder()
      .setCustomId(`pub_select_role_${draft.id}`)
      .setPlaceholder('👥 Cliquez pour sélectionner le rôle à mentionner...')
      .setMinValues(1)
      .setMaxValues(1);

    const row = new ActionRowBuilder().addComponents(roleSelect);
    return interaction.reply({
      content: '👉 **Choisissez le rôle précis à notifier :**',
      components: [row],
      ephemeral: true
    });
  }

  // 13. Sauvegarde du rôle sélectionné
  if (id.startsWith('pub_select_role_')) {
    const draftId = id.replace('pub_select_role_', '');
    const draft = pubDrafts.get(draftId);
    if (!draft) return interaction.reply({ content: 'Brouillon introuvable.', ephemeral: true });

    const selectedRoleId = interaction.values[0];
    draft.mentionType = 'role';
    draft.mentionRoleId = selectedRoleId;

    await interaction.update({
      content: `✅ Rôle <@&${selectedRoleId}> configuré pour l'annonce !`,
      components: []
    });

    try {
      const messages = await interaction.channel.messages.fetch({ limit: 10 });
      const previewMsg = messages.find(m => m.components.some(row => row.components.some(btn => btn.customId && btn.customId.includes(draftId))));
      if (previewMsg) {
        await previewMsg.edit(buildPreviewMessage(draft));
      }
    } catch (e) {}
    return;
  }

  // 14. Annuler le brouillon
  if (id.startsWith('pub_btn_cancel_')) {
    const draftId = id.replace('pub_btn_cancel_', '');
    pubDrafts.delete(draftId);
    return interaction.update({
      content: '🗑️ **Brouillon d\'annonce annulé et supprimé.**',
      embeds: [],
      components: []
    });
  }

  // 15. Modifier manuellement le texte du brouillon
  if (id.startsWith('pub_btn_edit_')) {
    const draftId = id.replace('pub_btn_edit_', '');
    const draft = pubDrafts.get(draftId);
    if (!draft) return interaction.reply({ content: 'Brouillon introuvable.', ephemeral: true });

    const modal = new ModalBuilder()
      .setCustomId(`pub_modal_edit_submit_${draft.id}`)
      .setTitle('✏️ Modifier l\'Annonce');

    const titleInput = new TextInputBuilder()
      .setCustomId('pub_input_title')
      .setLabel('Titre de l\'Annonce')
      .setValue(draft.title.slice(0, 100))
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const badgeInput = new TextInputBuilder()
      .setCustomId('pub_input_badge')
      .setLabel('Badge / Sous-titre')
      .setValue((draft.badge || '').slice(0, 50))
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    const currentText = draft.useAi ? draft.aiContent : draft.rawContent;
    const contentInput = new TextInputBuilder()
      .setCustomId('pub_input_content')
      .setLabel('Contenu du Message (max 4000 car.)')
      .setValue(currentText.slice(0, 4000))
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(4000)
      .setRequired(true);

    const imageInput = new TextInputBuilder()
      .setCustomId('pub_input_image')
      .setLabel('URL de l\'image (Optionnel)')
      .setValue(draft.imageUrl || '')
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(badgeInput),
      new ActionRowBuilder().addComponents(contentInput),
      new ActionRowBuilder().addComponents(imageInput)
    );

    return interaction.showModal(modal);
  }

  // 16. Validation de la modification du brouillon
  if (id.startsWith('pub_modal_edit_submit_')) {
    const draftId = id.replace('pub_modal_edit_submit_', '');
    const draft = pubDrafts.get(draftId);
    if (!draft) return interaction.reply({ content: 'Brouillon introuvable.', ephemeral: true });

    draft.title = interaction.fields.getTextInputValue('pub_input_title');
    draft.badge = interaction.fields.getTextInputValue('pub_input_badge') || 'COMMUNICATION INTERNE';
    const newContent = interaction.fields.getTextInputValue('pub_input_content');
    draft.rawContent = newContent;
    draft.aiContent = newContent;
    draft.useAi = false; // Mode manuel
    draft.imageUrl = interaction.fields.getTextInputValue('pub_input_image') || null;

    const preview = buildPreviewMessage(draft);
    return interaction.update(preview);
  }

  // 17. Lancement de la diffusion intégrale (pub_btn_broadcast_DRAFTID)
  if (id.startsWith('pub_btn_broadcast_')) {
    const draftId = id.replace('pub_btn_broadcast_', '');
    const draft = pubDrafts.get(draftId);
    if (!draft) return interaction.reply({ content: 'Brouillon introuvable ou déjà diffusé.', ephemeral: true });

    await interaction.deferUpdate();

    const guild = interaction.guild;
    const targetChannels = await resolveTargetChannels(draft, guild);

    if (targetChannels.length === 0) {
      return interaction.followUp({
        content: '❌ **Aucun salon de destination valide trouvé.** Veuillez vérifier vos options de ciblage.',
        ephemeral: true
      });
    }

    const embeds = buildAnnouncementEmbeds(draft);
    const mentionText = getMentionText(draft);
    const successList = [];
    const errorList = [];

    for (const channel of targetChannels) {
      try {
        // Envoi avec découpage en lots de 10 embeds maximum par message Discord
        for (let i = 0; i < embeds.length; i += 10) {
          const batch = embeds.slice(i, i + 10);
          const isFirstBatch = i === 0;

          await channel.send({
            content: (isFirstBatch && mentionText) ? mentionText.trim() : undefined,
            embeds: batch
          });
        }
        successList.push(`<#${channel.id}>`);
      } catch (err) {
        console.error(`❌ Échec envoi dans #${channel.name}:`, err.message);
        errorList.push(`• <#${channel.id}> (${err.message})`);
      }
    }

    // Supprimer le brouillon une fois diffusé
    pubDrafts.delete(draftId);

    const reportEmbed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('🚀 Annonce Diffusée avec Succès !')
      .setDescription(
        `Votre annonce **« ${draft.title} »** a été expédiée avec succès dans **${successList.length} salon(s)** !\n` +
        (embeds.length > 1 ? `📄 *Message volumineux transmis intégralement en ${embeds.length} parties sans coupure.*\n\n` : '\n') +
        `**Salons touchés :**\n${successList.join(', ')}\n\n` +
        (errorList.length > 0 ? `⚠️ **Échecs d'envoi (${errorList.length}) :**\n${errorList.join('\n')}\n\n` : '') +
        `*Le studio est prêt pour votre prochaine annonce.*`
      )
      .setFooter({ text: 'AVA Agency • Diffusion terminée' })
      .setTimestamp();

    await interaction.editReply({
      content: null,
      embeds: [reportEmbed],
      components: []
    });
  }
}

module.exports = {
  CHANNEL_PUB_ID,
  setupPubPanelChannel,
  handlePubMessageDrop,
  handlePubInteraction,
  buildAnnouncementEmbeds,
  splitContentIntoChunks
};

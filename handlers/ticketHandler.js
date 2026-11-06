const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  PermissionFlagsBits 
} = require('discord.js');

// ─── Configuration des Rôles & Pôles ─────────────────────────────
const CONFIG = {
  adminRoles: [
    '1438301065471721636', // Fondateur
    '1555271559512461423', // Boss
  ],
  roleNonVerifie: '1557494396717498459', // Non vérifié
  allManagerRoles: [
    '1443170697135394897', // Manager Twitter
    '1438301874389516390', // Manager Chatter
    '1502702586929746143', // Manager jailbreak
    '1555216669738279082', // Manager insta mobile
    '1566668909862588498', // Manajer FB
    '1566669590518308864', // Manajer Threads
  ],
  poles: {
    chatter: {
      id: 'chatter',
      name: 'Chatter',
      emoji: '💬',
      managerRoleId: '1438301874389516390', // Manager Chatter
      managerName: 'Manager Chatter',
      color: 0x3498db,
      roles: [
        { id: '1443497241036722307', name: 'Chatter Fr', label: 'Chatter FR', emoji: '🇫🇷', style: ButtonStyle.Primary },
        { id: '1555270941775241266', name: 'Chatter US', label: 'Chatter US', emoji: '🇺🇸', style: ButtonStyle.Secondary },
      ]
    },
    twitter: {
      id: 'twitter',
      name: 'VA Twitter',
      emoji: '🐦',
      managerRoleId: '1443170697135394897', // Manager Twitter
      managerName: 'Manager Twitter',
      color: 0x1da1f2,
      roles: [
        { id: '1438303324670791801', name: 'VA twitter FR', label: 'VA Twitter FR', emoji: '🇫🇷', style: ButtonStyle.Primary },
        { id: '1555271355421823016', name: 'VA twitter US', label: 'VA Twitter US', emoji: '🇺🇸', style: ButtonStyle.Secondary },
      ]
    },
    instamobile: {
      id: 'instamobile',
      name: 'VA Insta Mobile',
      emoji: '📱',
      managerRoleId: '1555216669738279082', // Manager insta mobile
      managerName: 'Manager Insta Mobile',
      color: 0xe1306c,
      roles: [
        { id: '1527608676981018675', name: 'Insta mobile FR', label: 'Insta Mobile FR', emoji: '🇫🇷', style: ButtonStyle.Primary },
        { id: '1555271217865564280', name: 'Insta mobile US', label: 'Insta Mobile US', emoji: '🇺🇸', style: ButtonStyle.Secondary },
      ]
    },
    jailbreak: {
      id: 'jailbreak',
      name: 'VA Jailbreak',
      emoji: '⚡',
      managerRoleId: '1502702586929746143', // Manager jailbreak
      managerName: 'Manager Jailbreak',
      color: 0xf1c40f,
      roles: [
        { id: '1502702700540858610', name: 'jailbreak FR', label: 'Jailbreak FR', emoji: '🇫🇷', style: ButtonStyle.Primary },
        { id: '1555270249509556344', name: 'jailbreak US', label: 'Jailbreak US', emoji: '🇺🇸', style: ButtonStyle.Secondary },
      ]
    },
    facebook: {
      id: 'facebook',
      name: 'VA Facebook',
      emoji: '📘',
      managerRoleId: '1566668909862588498', // Manajer FB
      managerName: 'Manager Facebook',
      color: 0x4267b2,
      roles: [
        { id: '1566669243808751678', name: 'VA FB fr', label: 'VA Facebook FR', emoji: '🇫🇷', style: ButtonStyle.Primary },
        { id: '1566669360188358726', name: 'VA FB us', label: 'VA Facebook US', emoji: '🇺🇸', style: ButtonStyle.Secondary },
      ]
    },
    threads: {
      id: 'threads',
      name: 'VA Threads',
      emoji: '🧵',
      managerRoleId: '1566669590518308864', // Manajer Threads
      managerName: 'Manager Threads',
      color: 0x2ecc71,
      roles: [
        { id: '1566669700400816129', name: 'Va threads fr', label: 'VA Threads FR', emoji: '🇫🇷', style: ButtonStyle.Primary },
        { id: '1566669826947162223', name: 'Va threads us', label: 'VA Threads US', emoji: '🇺🇸', style: ButtonStyle.Secondary },
      ]
    }
  }
};

// Helper vérification staff
function isStaff(member) {
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.Administrator) ||
    CONFIG.adminRoles.some(r => member.roles.cache.has(r)) ||
    CONFIG.allManagerRoles.some(r => member.roles.cache.has(r));
}

// Verrou anti-doublon par salon
const welcomeLocks = new Set();

// ─── 1. Envoi du panneau d'accueil dans le ticket ────────────────
async function sendTicketWelcome(channel, candidateId = 'any') {
  try {
    if (welcomeLocks.has(channel.id)) return;
    welcomeLocks.add(channel.id);
    setTimeout(() => welcomeLocks.delete(channel.id), 10000);

    // Supprimer tout ancien panneau d'orientation en doublon s'il existe déjà
    const existingMsgs = await channel.messages.fetch({ limit: 10 }).catch(() => null);
    if (existingMsgs) {
      const oldWelcomeMsgs = existingMsgs.filter(m => 
        m.author.id === channel.client.user.id && 
        m.embeds.some(e => e.title && e.title.includes('Orientation Recrutement'))
      );
      for (const oldMsg of oldWelcomeMsgs.values()) {
        await oldMsg.delete().catch(() => null);
      }
    }
    const embed = new EmbedBuilder()
      .setTitle('🎯 Bienvenue chez AVA Agency — Orientation Recrutement')
      .setDescription(
        candidateId && candidateId !== 'any' 
          ? `Bonjour <@${candidateId}> ! Bienvenue dans votre salon d'onboarding.\n\nPour vous orienter directement vers le bon responsable, **veuillez indiquer votre profil ci-dessous :**`
          : `Bonjour et bienvenue dans votre salon d'onboarding AVA Agency !\n\nPour vous orienter directement vers le bon responsable, **veuillez indiquer votre profil ci-dessous :**`
      )
      .setColor(0x5865f2)
      .addFields(
        { name: '💎 Profil VA (Virtual Assistant)', value: 'Gestion de comptes & diffusion de contenu (Twitter, Insta, Jailbreak, Facebook, Threads)', inline: true },
        { name: '💬 Profil Chatter', value: 'Messagerie, conversion et discussion directe avec les abonnés', inline: true }
      )
      .setFooter({ text: 'AVA Agency • Système de Recrutement Automatisé' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_type_va:${candidateId}`)
        .setLabel('Je suis un VA')
        .setEmoji('💎')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`ticket_type_chatter:${candidateId}`)
        .setLabel('Je suis un Chatter')
        .setEmoji('💬')
        .setStyle(ButtonStyle.Primary)
    );

    return await channel.send({
      content: candidateId && candidateId !== 'any' ? `👋 <@${candidateId}>` : null,
      embeds: [embed],
      components: [row]
    });
  } catch (err) {
    console.error('❌ Erreur sendTicketWelcome :', err);
  }
}

// ─── 2. Rendre le ticket strictement privé au pôle choisi ────────
async function isolateTicket(channel, candidateId, targetManagerRoleId) {
  try {
    const guild = channel.guild;
    const botMember = await guild.members.fetch(channel.client.user.id).catch(() => null);

    // Permissions de base à garantir
    const overwrites = [
      // @everyone exclu
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel]
      }
    ];

    // Candidat
    if (candidateId && candidateId !== 'any') {
      overwrites.push({
        id: candidateId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory
        ]
      });
    }

    // Fondateur & Boss
    for (const adminRoleId of CONFIG.adminRoles) {
      overwrites.push({
        id: adminRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory
        ]
      });
    }

    // Le Bot AVA Agent
    if (botMember) {
      overwrites.push({
        id: botMember.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory
        ]
      });
    }

    // Le Manager du pôle sélectionné
    if (targetManagerRoleId) {
      overwrites.push({
        id: targetManagerRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory
        ]
      });
    }

    // Tous les AUTRES managers sont exclus
    for (const mgrId of CONFIG.allManagerRoles) {
      if (mgrId !== targetManagerRoleId) {
        overwrites.push({
          id: mgrId,
          deny: [PermissionFlagsBits.ViewChannel]
        });
      }
    }

    // Appliquer les permissions de manière sécurisée
    await channel.permissionOverwrites.set(overwrites, 'Isolation privée du ticket recrutement AVA');
    console.log(`🔒 Ticket #${channel.name} rendu privé pour le manager ${targetManagerRoleId}`);
  } catch (err) {
    console.error('❌ Erreur isolateTicket :', err);
  }
}

// ─── 3. Création du panneau d'attribution pour le manager ─────────
function buildManagerPanel(poleKey, candidateId, assignedRoleName = null) {
  const pole = CONFIG.poles[poleKey];
  if (!pole) return null;

  const embed = new EmbedBuilder()
    .setTitle(`${pole.emoji} Panneau Manager — Pôle ${pole.name}`)
    .setDescription(
      `**Candidat :** <@${candidateId}>\n**Responsable :** <@&${pole.managerRoleId}>\n\n` +
      (assignedRoleName 
        ? `✅ **Statut :** Rôle **${assignedRoleName}** attribué avec succès !`
        : `⚡ **Action requise :** Menez l'entretien avec le candidat. Une fois validé, **attribuez-lui directement son rôle ci-dessous en un clic :**`)
    )
    .setColor(assignedRoleName ? 0x2ecc71 : pole.color)
    .setFooter({ text: 'Ticket privé • Visible uniquement par le Candidat, le Manager du pôle et la Direction' })
    .setTimestamp();

  const roleButtons = pole.roles.map(r => {
    const isAssigned = assignedRoleName === r.name;
    return new ButtonBuilder()
      .setCustomId(`ticket_assign:${candidateId}:${r.id}:${poleKey}`)
      .setLabel(isAssigned ? `Attribué (${r.name})` : r.label)
      .setEmoji(isAssigned ? '✅' : r.emoji)
      .setStyle(isAssigned ? ButtonStyle.Success : r.style)
      .setDisabled(Boolean(assignedRoleName));
  });

  const resetBtn = new ButtonBuilder()
    .setCustomId(`ticket_reset:${candidateId}`)
    .setLabel('Réorienter')
    .setEmoji('🔄')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder().addComponents(...roleButtons, resetBtn);

  return { embed, row };
}

// ─── 3b. Offre et Créneaux pour le poste de Chatter ─────────────
function buildChatterOfferEmbed(candidateId) {
  return new EmbedBuilder()
    .setTitle('📋 OFFRE DE RECRUTEMENT — POSTE DE CHATTER')
    .setColor(CONFIG.poles.chatter.color || 0x3498db)
    .setDescription(
      `Bonjour <@${candidateId}> !\n` +
      `Voici l'ensemble des conditions et notre offre pour rejoindre l'équipe de **Chatter** chez AVA Agency :\n\n` +
      `⏰ **Créneaux de Shift disponibles (Heure de Paris / UTC+1)**\n` +
      `Vous pouvez choisir parmi les 4 shifts suivants :\n\n` +
      `• **Shift 1 :** 08h00 – 14h00\n` +
      `• **Shift 2 :** 14h00 – 20h00\n` +
      `• **Shift 3 :** 20h00 – 02h00\n` +
      `• **Shift 4 :** 02h00 – 08h00\n\n` +
      `💰 **Rémunération & Commission évolutive**\n` +
      `Votre commission de base démarre à 10% sur toutes vos ventes et peut augmenter selon vos performances hebdomadaires :\n\n` +
      `• **Niveau Base :** 10% de commission sur vos ventes.\n` +
      `• **Niveau Performance (à partir de 500 € / semaine) :** Passage direct à 12% de commission.\n` +
      `• **Niveau Top Chatter (à partir de 1 000 € / semaine) :** Passage direct à 15% de commission.\n\n` +
      `💳 **Modalités de Paiement**\n` +
      `• **Fréquence :** Tous les 15 jours (toutes les 2 semaines).\n` +
      `• **Mode de paiement :** Crypto – USDT (Réseau TRC-20).\n\n` +
      `👉 *Indiquez votre shift souhaité ci-dessous en cliquant sur l'un des boutons ou par message dans ce salon.*`
    )
    .setFooter({ text: 'AVA Agency • Recrutement Chatter • Heure de Paris (UTC+1)' })
    .setTimestamp();
}

function buildChatterShiftButtons(candidateId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_chatter_shift:${candidateId}:1`)
      .setLabel('Shift 1 (08h-14h)')
      .setEmoji('🌅')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`ticket_chatter_shift:${candidateId}:2`)
      .setLabel('Shift 2 (14h-20h)')
      .setEmoji('☀️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`ticket_chatter_shift:${candidateId}:3`)
      .setLabel('Shift 3 (20h-02h)')
      .setEmoji('🌙')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`ticket_chatter_shift:${candidateId}:4`)
      .setLabel('Shift 4 (02h-08h)')
      .setEmoji('🌌')
      .setStyle(ButtonStyle.Primary)
  );
}

// ─── 3c. Offre et Rémunération pour les Assistants Virtuels (VA) ──
function buildVaOfferEmbed(candidateId, pole = null) {
  const poleName = pole ? pole.name : 'Assistants Virtuels (VA)';
  const color = pole ? pole.color : 0xe67e22;

  return new EmbedBuilder()
    .setTitle(`💼 CONDITIONS & RÉMUNÉRATION — ${poleName.toUpperCase()}`)
    .setColor(color)
    .setDescription(
      `Bonjour <@${candidateId}> !\n` +
      `Voici l'ensemble des conditions et le barème de rémunération officiel pour les **${poleName}** chez AVA Agency :\n\n` +
      `💼 **1. ASSISTANTS VIRTUELS (VA)**\n\n` +
      `💵 **Tarif de base :**\n` +
      `• **1$** pour **3 subs éligibles**.\n\n` +
      `🎯 **Objectif minimum de paiement :**\n` +
      `• **30 subs valides** requis pour débloquer un virement (cycle de règlement **toutes les 2 semaines**).\n\n` +
      `🔄 **Conservation des points :**\n` +
      `• Si le seuil des 30 subs n'est pas atteint à la fin des 2 semaines, **vos points ne sont jamais perdus** et restent cumulés pour la session suivante.\n\n` +
      `🏆 **Prime d'excellence :**\n` +
      `• Bonus de **+10$** dès **500 subs valides** atteints dans le mois.\n\n` +
      `🌍 **Pays éligibles :**\n` +
      `• Subs issus de zones qualifiées (**France, Europe, USA**, etc.).\n\n` +
      `👉 *Un manager va prendre en charge votre ticket d'ici peu pour échanger avec vous et finaliser votre intégration.*`
    )
    .setFooter({ text: 'AVA Agency • Rémunération Officielle VA' })
    .setTimestamp();
}

// ─── 4. Gestionnaire d'interactions (Boutons) ─────────────────────
async function handleTicketButton(interaction, client) {
  const id = interaction.customId;
  const parts = id.split(':');
  const action = parts[0];
  let candidateId = parts[1] || 'any';

  // Si candidateId n'est pas spécifié, la personne qui clique est considérée comme le candidat
  if (candidateId === 'any') {
    candidateId = interaction.user.id;
  }

  // Renommage automatique de sécurité au nom du candidat si le salon est encore générique (ticket-0001...)
  try {
    if (interaction.channel && candidateId && candidateId !== 'any') {
      const { renameTicketToCandidate } = require('../services/ticketRenamer');
      renameTicketToCandidate(interaction.channel, candidateId, interaction.guild).catch(() => {});
    }
  } catch (e) {}

  // ── Cas 1 : Clic sur "Je suis un Chatter" ──────────────────────
  if (action === 'ticket_type_chatter') {
    // Vérification que c'est le candidat ou le staff
    if (interaction.user.id !== candidateId && !isStaff(interaction.member)) {
      return interaction.reply({ content: '⛔ Ce choix est réservé au candidat.', ephemeral: true });
    }

    await interaction.deferUpdate();

    // Isoler le ticket pour le Manager Chatter
    await isolateTicket(interaction.channel, candidateId, CONFIG.poles.chatter.managerRoleId);

    // Mettre à jour le message d'accueil
    const confirmationEmbed = new EmbedBuilder()
      .setTitle('💬 Pôle sélectionné : Chatter')
      .setDescription(`Le candidat <@${candidateId}> postule en tant que **Chatter**.\n\n🔒 Le ticket a été rendu **100% privé** : seuls le candidat, le Manager Chatter et la Direction ont désormais accès à ce salon.`)
      .setColor(CONFIG.poles.chatter.color);

    await interaction.editReply({
      embeds: [confirmationEmbed],
      components: []
    });

    // Envoyer directement l'offre au candidat
    const offerEmbed = buildChatterOfferEmbed(candidateId);
    const shiftRow = buildChatterShiftButtons(candidateId);

    await interaction.channel.send({
      content: `👋 <@${candidateId}> Voici l'offre officielle pour le poste de **Chatter** :`,
      embeds: [offerEmbed],
      components: [shiftRow]
    });

    // Ping du manager + envoi du panneau manager
    const { embed: mgrEmbed, row: mgrRow } = buildManagerPanel('chatter', candidateId);
    return await interaction.channel.send({
      content: `🔔 Notification : <@&${CONFIG.poles.chatter.managerRoleId}> <@&${CONFIG.adminRoles[0]}> — Nouveau candidat **Chatter** !`,
      embeds: [mgrEmbed],
      components: [mgrRow]
    });
  }

  // ── Cas 1b : Clic sur un bouton de choix de Shift par le candidat ──
  if (action === 'ticket_chatter_shift') {
    const shiftNum = parts[2];
    const shiftHours = {
      '1': '08h00 – 14h00',
      '2': '14h00 – 20h00',
      '3': '20h00 – 02h00',
      '4': '02h00 – 08h00'
    }[shiftNum] || '';

    if (interaction.user.id !== candidateId && !isStaff(interaction.member)) {
      return interaction.reply({ content: '⛔ Ce choix est réservé au candidat.', ephemeral: true });
    }

    return await interaction.reply({
      content: `✅ <@${candidateId}> a indiqué sa préférence pour le **Shift ${shiftNum} (${shiftHours})** !\nUn Manager Chatter va échanger avec vous pour finaliser votre intégration.`
    });
  }

  // ── Cas 2 : Clic sur "Je suis un VA" ───────────────────────────
  if (action === 'ticket_type_va') {
    if (interaction.user.id !== candidateId && !isStaff(interaction.member)) {
      return interaction.reply({ content: '⛔ Ce choix est réservé au candidat.', ephemeral: true });
    }

    const embedVA = new EmbedBuilder()
      .setTitle('💎 Sélection de votre spécialité VA')
      .setDescription(
        `Bonjour <@${candidateId}> !\n\n` +
        `💼 **Barème de Rémunération AVA Agency :**\n` +
        `• **Tarif de base :** 1$ pour 3 subs éligibles.\n` +
        `• **Objectif minimum :** 30 subs valides requis pour débloquer un virement (toutes les 2 semaines).\n` +
        `• **Conservation des points :** Vos points ne sont jamais perdus et restent cumulés pour la session suivante.\n` +
        `• **Prime d'excellence :** Bonus de +10$ dès 500 subs valides atteints dans le mois.\n` +
        `• **Pays éligibles :** Subs issus de zones qualifiées (France, Europe, USA, etc.).\n\n` +
        `👉 Veuillez choisir ci-dessous le **pôle pour lequel vous postulez :**`
      )
      .setColor(0xe67e22)
      .addFields(
        { name: '🐦 VA Twitter', value: 'Publication & engagement Twitter / X', inline: true },
        { name: '📱 VA Insta Mobile', value: 'Gestion comptes Instagram sur mobile', inline: true },
        { name: '⚡ VA Jailbreak', value: 'Gestion automatisée / Jailbreak', inline: true },
        { name: '📘 VA Facebook', value: 'Diffusion & groupes Facebook', inline: true },
        { name: '🧵 VA Threads', value: 'Animation de comptes Threads', inline: true }
      );

    const rowVA = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_va_pole:${candidateId}:twitter`)
        .setLabel('VA Twitter')
        .setEmoji('🐦')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`ticket_va_pole:${candidateId}:instamobile`)
        .setLabel('VA Insta Mobile')
        .setEmoji('📱')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`ticket_va_pole:${candidateId}:jailbreak`)
        .setLabel('VA Jailbreak')
        .setEmoji('⚡')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`ticket_va_pole:${candidateId}:facebook`)
        .setLabel('VA Facebook')
        .setEmoji('📘')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`ticket_va_pole:${candidateId}:threads`)
        .setLabel('VA Threads')
        .setEmoji('🧵')
        .setStyle(ButtonStyle.Primary)
    );

    const rowBack = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_reset:${candidateId}`)
        .setLabel('Retour au choix principal')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary)
    );

    return await interaction.update({
      embeds: [embedVA],
      components: [rowVA, rowBack]
    });
  }

  // ── Cas 3 : Choix d'un pôle VA spécifique ──────────────────────
  if (action === 'ticket_va_pole') {
    const poleKey = parts[2];
    const pole = CONFIG.poles[poleKey];

    if (!pole) {
      return interaction.reply({ content: '❌ Pôle introuvable.', ephemeral: true });
    }

    if (interaction.user.id !== candidateId && !isStaff(interaction.member)) {
      return interaction.reply({ content: '⛔ Ce choix est réservé au candidat.', ephemeral: true });
    }

    await interaction.deferUpdate();

    // Isoler le ticket pour le Manager du pôle VA sélectionné
    await isolateTicket(interaction.channel, candidateId, pole.managerRoleId);

    // Confirmation visuelle pour le candidat
    const confirmationEmbed = new EmbedBuilder()
      .setTitle(`${pole.emoji} Pôle sélectionné : ${pole.name}`)
      .setDescription(`Le candidat <@${candidateId}> a choisi le pôle **${pole.name}**.\n\n🔒 Le ticket a été rendu **100% privé** : seuls le candidat, le **${pole.managerName}** et la Direction ont désormais accès à ce salon.`)
      .setColor(pole.color);

    await interaction.editReply({
      embeds: [confirmationEmbed],
      components: []
    });

    // Envoyer directement l'offre de rémunération au candidat
    const vaOfferEmbed = buildVaOfferEmbed(candidateId, pole);
    await interaction.channel.send({
      content: `👋 <@${candidateId}> Voici les conditions et la rémunération officielle pour le poste **${pole.name}** :`,
      embeds: [vaOfferEmbed]
    });

    // Ping du manager de pôle + envoi du panneau d'attribution
    const { embed: mgrEmbed, row: mgrRow } = buildManagerPanel(poleKey, candidateId);
    return await interaction.channel.send({
      content: `🔔 Notification : <@&${pole.managerRoleId}> <@&${CONFIG.adminRoles[0]}> — Nouveau candidat **${pole.name}** !`,
      embeds: [mgrEmbed],
      components: [mgrRow]
    });
  }

  // ── Cas 4 : Attribution directe d'un rôle par le manager ───────
  if (action === 'ticket_assign') {
    const targetRoleId = parts[2];
    const poleKey = parts[3];
    const pole = CONFIG.poles[poleKey];

    // Vérifier les permissions du cliqueur : doit être le manager du pôle ou Admin/Boss
    const member = interaction.member;
    const isManagerOfPole = pole && member.roles.cache.has(pole.managerRoleId);
    const isAdmin = isStaff(member);

    if (!isManagerOfPole && !isAdmin) {
      return interaction.reply({
        content: `⛔ **Accès refusé :** Seul le responsable <@&${pole?.managerRoleId || ''}> ou la Direction peut attribuer ce rôle.`,
        ephemeral: true
      });
    }

    await interaction.deferReply();

    try {
      const guild = interaction.guild;
      const targetMember = await guild.members.fetch(candidateId).catch(() => null);
      if (!targetMember) {
        return interaction.editReply({ content: `❌ Impossible de trouver le membre <@${candidateId}> sur le serveur.` });
      }

      const roleToAdd = guild.roles.cache.get(targetRoleId);
      if (!roleToAdd) {
        return interaction.editReply({ content: `❌ Le rôle demandé (${targetRoleId}) est introuvable sur le serveur.` });
      }

      // Attribuer le rôle
      await targetMember.roles.add(roleToAdd);

      // Retirer le rôle 'Non vérifié' si présent
      if (targetMember.roles.cache.has(CONFIG.roleNonVerifie)) {
        await targetMember.roles.remove(CONFIG.roleNonVerifie).catch(() => null);
      }

      // Mettre à jour le panneau manager dans le message actuel
      const { embed: updatedEmbed, row: updatedRow } = buildManagerPanel(poleKey, candidateId, roleToAdd.name);
      await interaction.message.edit({
        embeds: [updatedEmbed],
        components: [updatedRow]
      }).catch(() => null);

      // Annonce publique de validation dans le ticket
      const successEmbed = new EmbedBuilder()
        .setTitle('🎉 Rôle Attribué avec Succès !')
        .setDescription(
          `Félicitations <@${candidateId}> !\n\n` +
          `Le rôle **${roleToAdd.name}** vous a été attribué par <@${interaction.user.id}>.\n` +
          `Vous avez désormais accès à l'espace de travail officiel de votre pôle sur le serveur.`
        )
        .setColor(0x2ecc71)
        .setTimestamp();

      return await interaction.editReply({ embeds: [successEmbed] });

    } catch (err) {
      console.error('❌ Erreur attribution rôle ticket :', err);

      if (err.code === 50013) {
        return interaction.editReply({
          content: `⚠️ **Erreur de hiérarchie Discord (Code 50013) :**\n` +
            `Le bot AVA Agent n'a pas pu donner le rôle **<@&${targetRoleId}>** car le rôle du bot (\`AVA Agent\`) est placé trop bas dans la liste des rôles Discord.\n\n` +
            `👉 **Action Fondateur requise :** Rendez-vous dans *Paramètres du serveur > Rôles*, et glissez le rôle **AVA Agent** tout en haut (juste en dessous de *Fondateur*).`
        });
      }

      return interaction.editReply({ content: `❌ Une erreur est survenue lors de l'attribution du rôle : ${err.message}` });
    }
  }

  // ── Cas 5 : Réorientation / Réinitialisation du ticket ───────────
  if (action === 'ticket_reset') {
    if (!isStaff(interaction.member) && interaction.user.id !== candidateId) {
      return interaction.reply({ content: '⛔ Vous ne pouvez pas réinitialiser ce panneau.', ephemeral: true });
    }

    await interaction.deferUpdate();
    return await sendTicketWelcome(interaction.channel, candidateId);
  }
}

module.exports = {
  CONFIG,
  sendTicketWelcome,
  isolateTicket,
  handleTicketButton
};

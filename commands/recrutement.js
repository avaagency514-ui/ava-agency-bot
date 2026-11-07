const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

const VA_RECRUITMENT_TEMPLATES = [
  {
    id: 'insta',
    title: '📢 RECRUTEMENT – INSTAGRAM (VA)',
    roleName: 'VA Instagram',
    emoji: '📱',
    text: `📢 RECRUTEMENT – INSTAGRAM !

Tu souhaites travailler à distance directement depuis ton smartphone ? Nous recherchons de nouveaux profils pour développer notre équipe spécialisée dans la gestion et le développement de comptes Instagram !

🎯 TRAFIC STRICTEMENT FRANÇAIS (FR 🇫🇷) :
Marché 100% France uniquement.

📩 Contact : @rcruting_bot 📩 

💰 RÉMUNÉRATION & MODALITÉS :
- Rémunération au sub (au nombre d'abonnés français qualifiés générés) 🎯
- Jusqu'à 350 USDT selon tes performances
- Paiement toutes les 2 semaines 📆
- Règlement sécurisé en Crypto USDT 💵
- Bonus et primes de résultats 🤑
- Possibilités d'évolution rapide

📱 MATÉRIEL :
- iPhone et Android acceptés
- Jailbreak = un plus, mais pas obligatoire
- Connexion Internet stable

🔥 PROFIL RECHERCHÉ :
- Débutants acceptés
- Bonne disponibilité
- Sérieux et régularité
- Envie d'apprendre et de progresser

🎓 ACCOMPAGNEMENT :
- Formation complète
- Stratégies Instagram performantes 📈
- Suivi personnalisé par des Managers
- Calls et accompagnement régulier

Nous recherchons des personnes motivées, prêtes à s'investir et à évoluer avec nous sur le long terme.

📩 Intéressé(e) ? Envoie un DM à @rcruting_bot avec une petite présentation de toi ! 📩`
  },
  {
    id: 'facebook',
    title: '📢 RECRUTEMENT — VA FACEBOOK / RÉSEAUX SOCIAUX',
    roleName: 'VA Facebook',
    emoji: '📘',
    text: `📢 RECRUTEMENT — VA FACEBOOK / RÉSEAUX SOCIAUX

Tu publies nos vidéos sur une page créée avec ton propre compte. Aucune expérience requise : formation complète assurée sur Discord.

💰 RÉMUNÉRATION AU SUB :
Plus tu génères de subs (abonnés qualifiés), plus tu gagnes. Possibilité de dépasser 500 USDT par session de 2 semaines, sans aucun plafond.

📆 PAIEMENT & MODALITÉS :
- Paiement garanti toutes les 2 semaines (tous les 14 jours).
- Paiement par Crypto USDT (TRC-20 / Solana).
- Rémunération 100% basée sur les subs générés.

⚠️ CRITÈRES DE QUALITÉ & TRAFIC :
Trafic STRICTEMENT FRANCE 🇫🇷 : seuls les abonnés français comptent. Tracking transparent et vérifiable en direct.

📱 MATÉRIEL :
Smartphone + 4G/5G suffisent. Vidéos, formation et lien personnel fournis par l'agence.

✅ Recherche de profils sérieux, motivés et réguliers.

✉️ Contacte @rcruting_bot en message privé pour postuler !`
  },
  {
    id: 'jailbreak',
    title: '🔓 RECRUTEMENT VA — IPHONE JAILBREAKÉ 🔓',
    roleName: 'VA Insta Jailbreak',
    emoji: '⚡',
    text: `🔓 RECRUTEMENT VA — IPHONE JAILBREAKÉ 🔓

💸 JUSQU'À 300 USDT / SESSION DE 2 SEMAINES

💰 Rémunération au sub (nombre d'abonnements qualifiés)
💵 Payé toutes les 2 semaines en Crypto USDT
✅ iPhone jailbreaké obligatoire
🇫🇷 Trafic STRICTEMENT FRANCE 🇫🇷 (Marché français uniquement)
⏰ 1 à 2h par jour seulement
📈 Outils automatisés et accompagnement fournis

🔥 Les places partent très vite ! Contacte @rcruting_bot en DM pour rejoindre l'équipe.`
  },
  {
    id: 'twitter',
    title: '📍 RECRUTEMENT VA TWITTER / X (MARCHÉ FR 🇫🇷)',
    roleName: 'VA Twitter',
    emoji: '🐦',
    text: `📍 RECRUTEMENT VA TWITTER / X (UNIQUEMENT 🇲🇬 🇧🇯 🇨🇲)

Nous recrutons des personnes motivées pour gérer des comptes Twitter / X : création de comptes, publication de contenu, interactions et chatting.

🎯 Cible : Trafic STRICTEMENT FRANCE 🇫🇷

💰 RÉMUNÉRATION AU NOMBRE D'ABONNEMENTS (SUBS) :
• Rémunération basée sur le nombre de subs français générés
• Paiement toutes les 2 semaines
• Règlement en Crypto USDT
• Tracking clair, fiable et transparent
• Très bonne rémunération pour les profils performants

📈 OPPORTUNITÉS D’ÉVOLUTION :
• Plus de responsabilités et primes d'excellence
• Meilleures conditions de rémunération au mérite
• Possibilité d’évoluer au sein de l'agence

🎯 PROFIL RECHERCHÉ :
• Ouvert à tous (débutants motivés acceptés)
• À l’aise avec Twitter / X et la communication écrite
• Sérieux, motivé et régulier
• Formation complète fournie

📩 Intéressé(e) ? Envoie un DM à @rcruting_bot avec ta présentation ! (Marché FR 🇫🇷)`
  },
  {
    id: 'xthreads',
    title: '🚀 RECRUTEMENT — VA X (TWITTER) & THREADS 🚀',
    roleName: 'VA Twitter & Threads',
    emoji: '🧵',
    text: `🚀 RECRUTEMENT — VA X (TWITTER) & THREADS 🚀

Je cherche des profils expérimentés pour gérer et scaler du trafic via X (Twitter) + Threads. 📱&📱

🎯 Trafic STRICTEMENT FRANCE 🇫🇷 (audience 100% française).

⚡️ Pourquoi nous rejoindre :
– Stratégie déjà prête + process clair et rodé
– Contenu + angles optimisés fournis
– Environnement orienté performance (on scale ce qui marche)
– Possibilité d’évolution + missions supplémentaires

---
💼 Mission :
– Analyser les meilleurs posts (X + Threads)
– Programmer les contenus sur 7 jours
– Optimiser le reach & l’engagement
– Analyser les résultats + reporting

⌛️ Temps de travail :
– ~4h30 / semaine
– 1 jour fixe / semaine (tu choisis ton créneau)

---
💵 Rémunération & Paiement :
– Rémunération au sub (selon le volume d'abonnés et de trafic converti)
– Paiement garanti toutes les 2 semaines
– Règlement en Crypto USDT
– Évolution possible + cumul avec d’autres missions au sein de l'agence

---
⚠️ Profil recherché :
– Expérience réelle sur les réseaux sociaux
– À l’aise avec X / Threads (growth, contenu, hooks)
– Autonome, rapide, orienté résultats
– Ordinateur obligatoire 💻

⭐ On cherche des profils solides qui veulent performer et évoluer. Pas de débutants.

---
📩 Pour postuler :
DM @rcruting_bot pour postuler ! 📈`
  },
  {
    id: 'chatter',
    title: '💬 RECRUTEMENT — CHATTER EXPÉRIMENTÉ(E)',
    roleName: 'Chatter Expérimenté(e)',
    emoji: '💬',
    text: `🔥 RECRUTEMENT CHATTER EXPÉRIMENTÉ(E) — REJOINS NOTRE AGENCE !

Tu maîtrises l'art de la discussion, de l'engagement et de la conversion ? Notre agence recrute des chatters motivés et talentueux pour dynamiser ses comptes.

🎯 Cible : Trafic STRICTEMENT FRANCE 🇫🇷 (conversations en français).

💰 RÉMUNÉRATION & AVANTAGES :
• Rémunération au pourcentage selon tes performances
• Jusqu'à 15% de commission + primes de résultats 🤑
• Paiement toutes les 2 semaines (tous les 14 jours) 📆
• Règlement sécurisé en Crypto USDT 💵
• Possibilités d'évolution rapide au sein de l'agence

💼 PROFIL RECHERCHÉ :
• Expérience requise en tant que chatter (OFM / réseaux sociaux)
• Excellente aisance relationnelle et orthographe française irréprochable
• Sérieux, autonome, rigoureux et disponible
• Ordinateur et/ou smartphone avec connexion stable

🎓 ACCOMPAGNEMENT :
• Process rodés et organisation d'équipe claire
• Suivi personnalisé par les Managers

📩 Pour postuler :
DM @rcruting_bot avec une courte présentation de ton parcours ! 📈`
  }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('recrutement')
    .setDescription('Gestion et diffusion des 6 annonces de recrutement officielles (VA & Chatter)')
    .addSubcommand(sub =>
      sub.setName('random')
        .setDescription('Choisir et diffuser aléatoirement une annonce parmi les 6 postes')
        .addChannelOption(opt =>
          opt.setName('salon')
            .setDescription('Salon où publier l\'annonce (laisser vide pour afficher ici)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
        .addBooleanOption(opt =>
          opt.setName('secret')
            .setDescription('Afficher en aperçu privé (visible uniquement par vous)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('send')
        .setDescription('Publier une annonce de recrutement spécifique')
        .addStringOption(opt =>
          opt.setName('type')
            .setDescription('Le pôle de recrutement')
            .setRequired(true)
            .addChoices(
              { name: '📱 VA Instagram', value: 'insta' },
              { name: '📘 VA Facebook', value: 'facebook' },
              { name: '⚡ VA Insta Jailbreak', value: 'jailbreak' },
              { name: '🐦 VA Twitter / X', value: 'twitter' },
              { name: '🧵 VA Twitter & Threads', value: 'xthreads' },
              { name: '💬 Chatter Expérimenté(e)', value: 'chatter' }
            )
        )
        .addChannelOption(opt =>
          opt.setName('salon')
            .setDescription('Salon où publier l\'annonce')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
        .addBooleanOption(opt =>
          opt.setName('secret')
            .setDescription('Afficher en aperçu privé (visible uniquement par vous)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('Consulter la liste des 6 annonces de recrutement officielles prêtes à l\'emploi')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ─── 1. SOUS-COMMANDE: LIST ──────────────────────────────────
    if (sub === 'list') {
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('📋 Modèles de Recrutement AVA Agency — 6 Postes (VA & Chatter)')
        .setDescription(
          `Voici les **6 annonces officielles de recrutement**, harmonisées selon vos directives :\n\n` +
          `• **Postes :** 5 filières VA + 1 filière Chatter.\n` +
          `• **Période :** Toutes les 2 semaines (tous les 14 jours).\n` +
          `• **Mode de paiement :** Crypto USDT.\n` +
          `• **Trafic ciblé :** STRICTEMENT FRANCE 🇫🇷 (100% marché français).\n` +
          `• **Contact :** @rcruting_bot.\n\n` +
          `Vous pouvez utiliser \`/recrutement random\` pour diffuser une annonce au hasard parmi les 6 ou \`/recrutement send\` pour en choisir une.`
        )
        .setFooter({ text: 'AVA Agency • Recrutement VA & Chatter' })
        .setTimestamp();

      for (const t of VA_RECRUITMENT_TEMPLATES) {
        embed.addFields({
          name: `${t.emoji} ${t.roleName}`,
          value: t.text.slice(0, 350) + '...\n*(texte complet prêt pour diffusion)*'
        });
      }

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ─── 2. SOUS-COMMANDE: RANDOM OU SEND ────────────────────────
    let chosenTemplate = null;

    if (sub === 'random') {
      const randomIndex = Math.floor(Math.random() * VA_RECRUITMENT_TEMPLATES.length);
      chosenTemplate = VA_RECRUITMENT_TEMPLATES[randomIndex];
    } else if (sub === 'send') {
      const type = interaction.options.getString('type');
      chosenTemplate = VA_RECRUITMENT_TEMPLATES.find(t => t.id === type) || VA_RECRUITMENT_TEMPLATES[0];
    }

    const targetChannel = interaction.options.getChannel('salon');
    const isSecret = interaction.options.getBoolean('secret') || false;

    // Si on publie explicitement dans un autre salon
    if (targetChannel && targetChannel.id !== interaction.channelId) {
      await targetChannel.send({ content: chosenTemplate.text });
      return interaction.reply({
        content: `✅ Annonce de recrutement **${chosenTemplate.roleName}** publiée avec succès dans <#${targetChannel.id}> !`,
        ephemeral: true
      });
    }

    // Sinon affichage dans le salon courant (public ou privé selon 'secret')
    return interaction.reply({ content: chosenTemplate.text, ephemeral: isSecret });
  },

  VA_RECRUITMENT_TEMPLATES
};

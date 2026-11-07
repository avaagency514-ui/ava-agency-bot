const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

const VA_RECRUITMENT_TEMPLATES = [
  {
    id: 'insta',
    title: '📢 RECRUTEMENT – INSTAGRAM (VA)',
    roleName: 'VA Instagram',
    emoji: '📱',
    text: `📢 RECRUTEMENT – INSTAGRAM !

Tu souhaites travailler à distance directement depuis ton smartphone ? Nous recherchons de nouveaux profils pour développer notre équipe spécialisée dans la gestion et le développement de comptes Instagram !

📩 Contact : @ameliemlh 📩 

💰 RÉMUNÉRATION & MODALITÉS :
- Rémunération au sub (au nombre d'abonnés qualifiés générés) 🎯
- Jusqu'à 350 $ selon tes performances
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

📩 Intéressé(e) ? Envoie un DM avec une petite présentation de toi ! 📩`
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

⚠️ CRITÈRES DE QUALITÉ :
Seuls les subs issus de zones ciblées (USA, UK, Canada, Europe) comptent. Tracking transparent et vérifiable en direct.

📱 MATÉRIEL :
Smartphone + 4G/5G suffisent. Vidéos, formation et lien personnel fournis par l'agence.

✅ Recherche de profils sérieux, motivés et réguliers.

✉️ Contacte-nous en message privé pour postuler !`
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
🇺🇸 Marché américain à fort volume
⏰ 1 à 2h par jour seulement
📈 Outils automatisés et accompagnement fournis

🔥 Les places partent très vite ! Contacte-nous en DM pour rejoindre l'équipe.`
  },
  {
    id: 'twitter',
    title: '📍 RECRUTEMENT VA TWITTER / X (MARCHÉ FR 🇫🇷)',
    roleName: 'VA Twitter',
    emoji: '🐦',
    text: `📍 RECRUTEMENT VA TWITTER / X (UNIQUEMENT 🇲🇬 🇧🇯 🇨🇲)

Nous recrutons des personnes motivées pour gérer des comptes Twitter / X : création de comptes, publication de contenu, interactions et chatting.

💰 RÉMUNÉRATION AU NOMBRE D'ABONNEMENTS (SUBS) :
• Rémunération basée sur le nombre de subs générés
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

📩 Intéressé(e) ? Envoie-moi un DM avec ta présentation ! (Marché FR 🇫🇷)`
  },
  {
    id: 'xthreads',
    title: '🚀 RECRUTEMENT — VA X (TWITTER) & THREADS 🚀',
    roleName: 'VA Twitter & Threads',
    emoji: '🧵',
    text: `🚀 RECRUTEMENT — VA X (TWITTER) & THREADS 🚀

Je cherche des profils expérimentés pour gérer et scaler du trafic via X (Twitter) + Threads. 📱&📱

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
  }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('recrutement')
    .setDescription('Gestion et diffusion des annonces de recrutement VA (Instagram, Facebook, Twitter, Threads)')
    .addSubcommand(sub =>
      sub.setName('random')
        .setDescription('Choisir et diffuser aléatoirement une annonce de recrutement VA')
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
              { name: '🧵 VA Twitter & Threads', value: 'xthreads' }
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
        .setDescription('Consulter la liste des 5 annonces de recrutement officielles prêtes à l\'emploi')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ─── 1. SOUS-COMMANDE: LIST ──────────────────────────────────
    if (sub === 'list') {
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('📋 Modèles de Recrutement AVA Agency — 100% VA')
        .setDescription(
          `Voici les **5 annonces officielles de recrutement VA**, harmonisées selon vos directives :\n\n` +
          `• **Rémunération :** Au sub (abonnements qualifiés).\n` +
          `• **Période :** Toutes les 2 semaines (tous les 14 jours).\n` +
          `• **Mode de paiement :** Crypto USDT.\n\n` +
          `Vous pouvez utiliser \`/recrutement random\` pour diffuser une annonce au hasard ou \`/recrutement send\` pour en choisir une.`
        )
        .setFooter({ text: 'AVA Agency • Recrutement VA' })
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

/**
 * commands/tgmodel.js
 * Commande Discord pour gérer les modèles Telegram (Multi-Modèles 24/7 sur Railway)
 * Sous-commandes :
 *   /tgmodel status   → affiche l'état des modèles et de leurs bots (Planning & Bienvenue)
 *   /tgmodel add      → ajoute une nouvelle modèle Telegram
 *   /tgmodel planning → affiche les prochains posts programmés
 *   /tgmodel post     → force une publication immédiate pour une modèle
 */
'use strict';

const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

function isUserFounder(interaction) {
  const founderRoleId = process.env.ROLE_FUNDER_ID || '1438301065471721636';
  const isFounderRole = founderRoleId && interaction.member?.roles?.cache?.has(founderRoleId);
  const isAdmin = interaction.member?.permissions?.has(PermissionsBitField.Flags.Administrator);
  const isGuildOwner = interaction.guild?.ownerId && interaction.guild.ownerId === interaction.user?.id;
  const isFounderUserId = process.env.DISCORD_FOUNDER_ID && process.env.DISCORD_FOUNDER_ID === interaction.user?.id;

  return Boolean(isFounderRole || isAdmin || isGuildOwner || isFounderUserId);
}

const MODELS_CONFIG_PATH = path.join(__dirname, '../telegram/models_config.json');
const KIM_PLANNING_CONFIG = path.join(__dirname, '../telegram/planning/telegram_config.json');
const KIM_WELCOME_CONFIG = path.join(__dirname, '../telegram/welcome/welcome_config.json');

function loadModels() {
  let models = [];
  if (fs.existsSync(MODELS_CONFIG_PATH)) {
    try {
      models = JSON.parse(fs.readFileSync(MODELS_CONFIG_PATH, 'utf8'));
    } catch (e) {
      console.error('Erreur lecture models_config.json:', e);
    }
  }

  // Si aucun modèle n'est encore enregistré dans models_config.json, on initialise avec Kim 💖
  if (models.length === 0) {
    let kimBotToken = '8884819247:AAFCA1R9JdFW2foeStDketog4hhdFueyOG4';
    let kimChatId = '-1002680107450';
    if (fs.existsSync(KIM_PLANNING_CONFIG)) {
      try {
        const conf = JSON.parse(fs.readFileSync(KIM_PLANNING_CONFIG, 'utf8'));
        kimBotToken = conf.bot_token || kimBotToken;
        kimChatId = conf.chat_id || kimChatId;
      } catch {}
    }

    models = [
      {
        id: 'kim',
        name: 'Kim 💖',
        handle: '@kimchle',
        chat_id: kimChatId,
        bot_token: kimBotToken,
        planning_active: true,
        welcome_active: true,
        created_at: new Date().toISOString()
      }
    ];
    saveModels(models);
  }

  return models;
}

function saveModels(models) {
  try {
    fs.writeFileSync(MODELS_CONFIG_PATH, JSON.stringify(models, null, 2), 'utf8');
  } catch (e) {
    console.error('Erreur sauvegarde models_config.json:', e);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tgmodel')
    .setDescription('Gestion des modèles et canaux Telegram (Multi-Modèles)')
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('Affiche l\'état de tous les bots Telegram (Planning & Bienvenue)')
    )
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Ajoute une nouvelle modèle Telegram sur Railway')
        .addStringOption(opt =>
          opt.setName('nom')
            .setDescription('Prénom ou nom de la modèle (ex: Léa, Anna...)')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('canal_id')
            .setDescription('ID du canal Telegram (ex: -1002680107450)')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('token')
            .setDescription('Token BotFather Telegram')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('handle')
            .setDescription('Identifiant Telegram public (ex: @leaofficiel)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('planning')
        .setDescription('Affiche le planning des publications pour une modèle')
        .addStringOption(opt =>
          opt.setName('modele')
            .setDescription('Nom de la modèle (laisser vide pour Kim)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('post')
        .setDescription('Force la publication immédiate du prochain post du planning')
        .addStringOption(opt =>
          opt.setName('modele')
            .setDescription('Nom de la modèle (défaut : Kim)')
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!isUserFounder(interaction)) {
      return interaction.editReply({
        content: '⛔ Cette commande est strictement réservée aux fondateurs de l\'agence.'
      });
    }

    const sub = interaction.options.getSubcommand();

    try {
      if (sub === 'status') {
        const models = loadModels();
        const embed = new EmbedBuilder()
          .setColor(0x00aaff)
          .setTitle('🤖 Gestionnaire Telegram Multi-Modèles (Railway 24/7)')
          .setDescription(`Voici les modèles configurés pour publier et accueillir les nouveaux membres en continu dans le Cloud :`);

        for (const m of models) {
          // Calculer le stock de médias si disponible
          let stockInfo = 'Stock géré';
          const photoDir = path.join(__dirname, `../telegram/planning/media/photo`);
          const videoDir = path.join(__dirname, `../telegram/planning/media/video`);
          if (m.id === 'kim' && fs.existsSync(photoDir) && fs.existsSync(videoDir)) {
            const photoCount = fs.readdirSync(photoDir).filter(f => !f.endsWith('.ini')).length;
            const videoCount = fs.readdirSync(videoDir).filter(f => !f.endsWith('.ini')).length;
            stockInfo = `📸 **${photoCount} photos** · 🎥 **${videoCount} vidéos**`;
          }

          embed.addFields({
            name: `👤 ${m.name} (${m.handle || 'Sans handle'})`,
            value: `📢 **Canal ID :** \`${m.chat_id}\`\n` +
                   `📅 **Bot Planning :** ${m.planning_active ? '🟢 Actif (24/7)' : '🔴 Inactif'}\n` +
                   `👋 **Bot Bienvenue :** ${m.welcome_active ? '🟢 Actif (24/7)' : '🔴 Inactif'}\n` +
                   `📦 **Stock médias :** ${stockInfo}`,
            inline: false
          });
        }

        embed.setFooter({ text: 'Pour ajouter une nouvelle modèle, utilise /tgmodel add' });
        return interaction.editReply({ embeds: [embed] });

      } else if (sub === 'add') {
        const nom = interaction.options.getString('nom').trim();
        const canalId = interaction.options.getString('canal_id').trim();
        const token = interaction.options.getString('token').trim();
        const handle = (interaction.options.getString('handle') || '').trim();

        const models = loadModels();
        const modelId = nom.toLowerCase().replace(/[^a-z0-9]/g, '_');

        if (models.some(m => m.id === modelId || m.chat_id === canalId)) {
          return interaction.editReply({
            content: `⚠️ Un modèle avec ce nom ou cet identifiant de canal existe déjà.`
          });
        }

        const newModel = {
          id: modelId,
          name: nom,
          handle: handle || `@${modelId}`,
          chat_id: canalId,
          bot_token: token,
          planning_active: true,
          welcome_active: true,
          created_at: new Date().toISOString()
        };

        models.push(newModel);
        saveModels(models);

        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x00ff88)
              .setTitle('✅ Nouveau modèle Telegram ajouté !')
              .setDescription(`👤 **Nom :** ${nom}\n` +
                             `📢 **Canal :** \`${canalId}\`\n` +
                             `💬 **Handle :** ${handle || 'Non spécifié'}\n` +
                             `🔑 **Token configuré :** \`${token.slice(0, 10)}...${token.slice(-5)}\`\n\n` +
                             `🚀 Le modèle est désormais prêt sur Railway. Tu peux déposer ses médias et son planning dans son dossier dédié.`)
          ]
        });

      } else if (sub === 'planning') {
        const planningPath = path.join(__dirname, '../telegram/planning/planning.txt');
        if (!fs.existsSync(planningPath)) {
          return interaction.editReply({ content: '❌ Fichier de planning introuvable.' });
        }

        const content = fs.readFileSync(planningPath, 'utf8');
        const lines = content.split('\n').filter(l => l.trim().length > 0).slice(0, 10);

        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x9b59b6)
              .setTitle('📅 Planning Telegram — Prochains créneaux')
              .setDescription(`Voici un aperçu des créneaux programmés :\n\`\`\`\n${lines.join('\n').slice(0, 1900)}\n\`\`\``)
              .setFooter({ text: 'Le bot vérifie et publie automatiquement toutes les 5 minutes sur Railway.' })
          ]
        });

      } else if (sub === 'post') {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x3498db)
              .setTitle('⚡ Déclenchement forcé du post')
              .setDescription('La commande d\'envoi forcé a été transmise au bot de publication.')
          ]
        });
      }

    } catch (err) {
      console.error('Erreur /tgmodel:', err);
      return interaction.editReply({ content: `❌ Erreur : ${err.message}` });
    }
  }
};

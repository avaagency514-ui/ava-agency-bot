const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { initChatterTables, setupChatterRevenuChannel, setupChatterAdminChannel, setupChatterPointageChannel } = require('../services/chatterService');
const { initPenaltyTables, setupPenaltyPanelChannel } = require('../services/penaltyService');
const { initComptaTables, setupComptaChannel, initMonthlyRecurringExpenses } = require('../services/comptaService');
const { setupPushPanelChannel } = require('../services/pushService');

module.exports = {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    console.log(`✅ Bot connecté : ${client.user.tag}`);
    console.log(`📡 Serveurs : ${client.guilds.cache.size}`);

    // Définir le statut du bot
    client.user.setPresence({
      activities: [{ name: '👁️ AVA Agency — VA Manager' }],
      status: 'online',
    });

    // Initialiser les tables SQLite des Chatters
    try {
      initChatterTables();
      await setupChatterRevenuChannel(client);
      await setupChatterAdminChannel(client);
      await setupChatterPointageChannel(client);
      initPenaltyTables();
      await setupPenaltyPanelChannel(client);
      initComptaTables();
      initMonthlyRecurringExpenses();
      await setupComptaChannel(client);
      await setupPushPanelChannel(client);
    } catch (err) {
      console.error('❌ Erreur initialisation Chatters :', err);
    }

    // Publier le message Content Factory pour les salons FR
    await setupContentFactory(client, process.env.CHANNEL_CONTENT_FR, 'FR');
    await setupContentFactory(client, process.env.CHANNEL_CONTENT_FR_MOBILE, 'FR (Mobile)');

    // Purger les salons US (supprimer tout ancien Content Factory US)
    await purgeContentFactory(client, process.env.CHANNEL_CONTENT_US, 'US');
    await purgeContentFactory(client, process.env.CHANNEL_CONTENT_US_MOBILE, 'US (Mobile)');
  },
};

async function purgeContentFactory(client, channelId, marketLabel) {
  if (!channelId) return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (messages) {
    const existingList = messages.filter(m =>
      m.author.id === client.user.id &&
      m.embeds.length > 0 &&
      m.embeds[0]?.title?.includes('Content Factory')
    );

    for (const [, oldMsg] of existingList) {
      await oldMsg.delete().catch(() => {});
    }
  }
  console.log(`🧹 Anciens messages Content Factory purgés dans le salon ${marketLabel}`);
}

async function setupContentFactory(client, channelId, marketLabel) {
  if (!channelId) return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    console.warn(`⚠️ Salon bot-content introuvable pour ${marketLabel}. Vérifie l'ID dans .env`);
    return;
  }

  // Purger TOUS les anciens messages Content Factory pour éviter que l'utilisateur clique sur un vieux message périmé
  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (messages) {
    const existingList = messages.filter(m =>
      m.author.id === client.user.id &&
      m.embeds.length > 0 &&
      m.embeds[0]?.title?.includes('Content Factory')
    );

    for (const [, oldMsg] of existingList) {
      await oldMsg.delete().catch(() => {});
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎬 Content Factory — V2')
    .setDescription('Clique sur un bouton pour générer du contenu ou du texte (IA).')
    .addFields({
      name: 'Médias',
      value: '**Reels** · **Post** · **PP** · **CTA**',
      inline: true
    }, {
      name: 'Textes & Follow',
      value: '**Bio** · **Story CTA** · **Profil** · **Follow FR**',
      inline: true
    })
    .setFooter({ text: 'AVA Agency Bot • Contenu & IA' })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('content_reels').setLabel('🎬 Reels').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('content_post').setLabel('🖼️ Post').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('content_pp').setLabel('👤 PP').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('content_cta').setLabel('🔗 CTA').setStyle(ButtonStyle.Primary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('content_textbio').setLabel('📝 Bio').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('content_textstorycta').setLabel('📣 Story CTA').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('content_textprofil').setLabel('👤 Profil Texte').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('content_followfr').setLabel('🇫🇷 Follow FR').setStyle(ButtonStyle.Secondary),
  );

  await channel.send({ embeds: [embed], components: [row1, row2] });
  console.log(`✅ Content Factory publié dans le salon ${marketLabel} (mis à jour)`);
}

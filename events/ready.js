const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

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

    // Publier le message Content Factory si les salons existent
    await setupContentFactory(client, process.env.CHANNEL_CONTENT_FR, 'FR');
    await setupContentFactory(client, process.env.CHANNEL_CONTENT_US, 'US');
  },
};

async function setupContentFactory(client, channelId, marketLabel) {
  if (!channelId) return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    console.warn(`⚠️ Salon bot-content introuvable pour ${marketLabel}. Vérifie l'ID dans .env`);
    return;
  }

  // Vérifier si le message Content Factory existe déjà
  const messages = await channel.messages.fetch({ limit: 10 });
  const existing = messages.find(m =>
    m.author.id === client.user.id &&
    m.embeds.length > 0 &&
    m.embeds[0]?.title?.includes('Content Factory')
  );

  if (existing) {
    await existing.delete().catch(() => {});
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎬 Content Factory — V2')
    .setDescription('Clique sur un bouton pour générer du contenu ou du texte (IA).')
    .addFields({
      name: 'Médias',
      value: '**Reels** · **Banger** · **Post** · **PP** · **CTA**',
      inline: true
    }, {
      name: 'Textes Uniques (Gemini)',
      value: '**Bio** · **Story CTA** · **Profil**',
      inline: true
    })
    .setFooter({ text: 'AVA Agency Bot • Contenu & IA' })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('content_reels').setLabel('🎬 Reels').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('content_banger').setLabel('🔥 Banger').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('content_post').setLabel('🖼️ Post').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('content_pp').setLabel('👤 PP').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('content_cta').setLabel('🔗 CTA').setStyle(ButtonStyle.Primary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('content_sms').setLabel('📱 SMS').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('content_textbio').setLabel('📝 Bio').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('content_textstorycta').setLabel('📣 Story CTA').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('content_textprofil').setLabel('👤 Profil Texte').setStyle(ButtonStyle.Secondary),
  );

  await channel.send({ embeds: [embed], components: [row1, row2] });
  console.log(`✅ Content Factory publié dans le salon ${marketLabel} (mis à jour)`);
}

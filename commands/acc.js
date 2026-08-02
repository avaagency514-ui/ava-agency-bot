const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { vaQueries } = require('../database/db');
const { getAvailableProfiles } = require('../services/drive');

// Cache temporaire pour stocker les sélections avant validation
const accSelections = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('acc')
    .setDescription('Ajouter un compte Instagram au VA de ce salon'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const va = vaQueries.getByChannel.get(interaction.channelId);

    if (!va) {
      return interaction.editReply({
        content: '❌ Aucun VA trouvé pour ce salon. Utilise `/va` pour en créer un.',
      });
    }

    const sessionId = `${interaction.user.id}_${Date.now()}`;
    
    // Valeurs par défaut
    const defaultDate = new Date().toISOString().split('T')[0];
    accSelections.set(sessionId, {
      va_id: va.id,
      profile_id: 'Non sélectionné',
      os: 'Non précisé',
      registration_date: defaultDate
    });

    const embed = new EmbedBuilder()
      .setTitle(`➕ Ajouter un compte — ${va.username}`)
      .setDescription(`**Profile ID:** Non sélectionné\n**Enregistré:** ${defaultDate}\n**OS:** Non précisé\n\n*Ajustez les paramètres ci-dessous puis cliquez sur le bouton pour renseigner les identifiants et créer le compte.*`)
      .setColor('#2b2d31');

    // Récupérer dynamiquement les IDs depuis le Drive
    const profiles = await getAvailableProfiles();
    const idOptions = profiles.length > 0 
      ? profiles.map(p => ({ label: p, value: p }))
      : [{ label: 'ID 1', value: 'ID 1' }]; // Fallback si le drive est vide ou erreur

    // S'assurer qu'on ne dépasse pas 25 options (limite Discord)
    const limitedIdOptions = idOptions.slice(0, 25);

    const rowId = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`sel_acc_id_${sessionId}`)
        .setPlaceholder('Sélectionner Profile ID')
        .addOptions(limitedIdOptions)
    );

    const rowOs = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`sel_acc_os_${sessionId}`)
        .setPlaceholder('Sélectionner OS')
        .addOptions([
          { label: 'iOS', value: 'iOS' },
          { label: 'Android', value: 'Android' },
          { label: 'LDPlayer', value: 'LDPlayer' },
          { label: 'Non précisé', value: 'Non précisé' }
        ])
    );

    const rowDate = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`sel_acc_date_${sessionId}`)
        .setPlaceholder('Date d\'enregistrement')
        .addOptions([
          { label: `Aujourd'hui - ${defaultDate}`, value: defaultDate },
          { label: 'Hier', value: new Date(Date.now() - 86400000).toISOString().split('T')[0] }
        ])
    );

    const rowBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_acc_create_${sessionId}`)
        .setLabel('Renseigner & Créer')
        .setStyle(ButtonStyle.Success)
    );

    await interaction.editReply({
      embeds: [embed],
      components: [rowId, rowDate, rowOs, rowBtn]
    });
  },
  
  // Exporter le cache pour y accéder dans interactionCreate
  accSelections
};

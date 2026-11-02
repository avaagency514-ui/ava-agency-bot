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
      : [{ label: 'ID 1', value: 'ID 1' }];

    const selectionObj = {
      va_id: va.id,
      profile_id: 'Non sélectionné',
      os: 'Non précisé',
      registration_date: defaultDate,
      page: 0,
      allProfiles: idOptions
    };
    accSelections.set(sessionId, selectionObj);

    const components = buildAccComponents(sessionId, selectionObj);

    await interaction.editReply({
      embeds: [embed],
      components: components
    });
  },
  
  // Exporter le cache et le builder pour interactionCreate
  accSelections,
  buildAccComponents
};

function buildAccComponents(sessionId, selection) {
  const allProfiles = selection.allProfiles || [];
  const totalPages = Math.ceil(allProfiles.length / 25) || 1;
  const page = selection.page || 0;
  const currentPageOptions = allProfiles.slice(page * 25, (page + 1) * 25);

  const startLabel = currentPageOptions[0]?.label || 'ID 1';
  const endLabel = currentPageOptions[currentPageOptions.length - 1]?.label || 'ID 1';
  const placeholder = totalPages > 1 
    ? `Sélectionner Profile ID (${startLabel} à ${endLabel})`
    : 'Sélectionner Profile ID';

  const rowId = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`sel_acc_id_${sessionId}`)
      .setPlaceholder(placeholder)
      .addOptions(currentPageOptions)
  );

  const components = [rowId];

  // Si plus d'une page, on ajoute la barre de pagination
  if (totalPages > 1) {
    const rowPage = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_acc_page_prev_${sessionId}`)
        .setLabel('◀ Précédent')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`btn_acc_page_indicator_${sessionId}`)
        .setLabel(`Page ${page + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`btn_acc_page_next_${sessionId}`)
        .setLabel('Suivant ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1)
    );
    components.push(rowPage);
  }

  const rowOs = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`sel_acc_os_${sessionId}`)
      .setPlaceholder(`Sélectionner OS (Actuel: ${selection.os || 'Non précisé'})`)
      .addOptions([
        { label: 'iOS', value: 'iOS' },
        { label: 'Android', value: 'Android' },
        { label: 'LDPlayer', value: 'LDPlayer' },
        { label: 'Non précisé', value: 'Non précisé' }
      ])
  );
  components.push(rowOs);

  const rowDate = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`sel_acc_date_${sessionId}`)
      .setPlaceholder(`Date (Actuel: ${selection.registration_date})`)
      .addOptions([
        { label: `Aujourd'hui - ${selection.registration_date}`, value: selection.registration_date },
        { label: 'Hier', value: new Date(Date.now() - 86400000).toISOString().split('T')[0] }
      ])
  );
  components.push(rowDate);

  const rowBtn = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_acc_create_${sessionId}`)
      .setLabel('Renseigner & Créer')
      .setStyle(ButtonStyle.Success)
  );
  components.push(rowBtn);

  return components;
}

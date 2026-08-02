const { Events } = require('discord.js');
const { vaQueries, igQueries } = require('../database/db');
const { handleContentFactory } = require('../handlers/contentFactory');

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction, client) {
    // ─── Commandes Slash ────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction, client);
      } catch (err) {
        console.error(`❌ Erreur commande /${interaction.commandName} :`, err);
        const msg = { content: '❌ Une erreur est survenue.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(msg);
        } else {
          await interaction.reply(msg);
        }
      }
      return;
    }

    // ─── Sélecteurs (Menus) ──────────────────────────────────────
    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;
      
      if (id.startsWith('sel_acc_')) {
        const { accSelections } = require('../commands/acc');
        const parts = id.split('_');
        const type = parts[2]; // id, os, date
        const sessionId = parts.slice(3).join('_');
        
        const selection = accSelections.get(sessionId);
        if (!selection) return interaction.reply({ content: 'Session expirée. Veuillez refaire la commande `/acc`.', ephemeral: true });

        if (type === 'id') selection.profile_id = interaction.values[0];
        if (type === 'os') selection.os = interaction.values[0];
        if (type === 'date') selection.registration_date = interaction.values[0];

        // Mettre à jour le message
        const { EmbedBuilder } = require('discord.js');
        const oldEmbed = interaction.message.embeds[0];
        const embed = new EmbedBuilder()
          .setTitle(oldEmbed.title)
          .setDescription(`**Profile ID:** ${selection.profile_id}\n**Enregistré:** ${selection.registration_date}\n**OS:** ${selection.os}\n\n*Ajustez les paramètres ci-dessous puis cliquez sur le bouton pour renseigner les identifiants et créer le compte.*`)
          .setColor('#2b2d31');
          
        return interaction.update({ embeds: [embed] });
      }

      // Content Factory qty request
      if (id.startsWith('req_')) {
        const { handleContentSelect } = require('../handlers/contentFactory');
        return handleContentSelect(interaction);
      }

      // Content Factory Founder ID Select
      if (id.startsWith('founder_select_')) {
        const { handleFounderSelect } = require('../handlers/contentFactory');
        return handleFounderSelect(interaction);
      }
    }
    if (interaction.isButton()) {
      const id = interaction.customId;

      // Content Factory
      if (id.startsWith('content_')) {
        return handleContentFactory(interaction, client);
      }

      // Kick confirmé
      if (id.startsWith('kick_confirm_')) {
        const vaId = parseInt(id.replace('kick_confirm_', ''));
        return handleKickConfirm(interaction, client, vaId);
      }

      // Kick annulé
      if (id === 'kick_cancel') {
        return interaction.update({ content: '❌ Kick annulé.', embeds: [], components: [] });
      }

      // Ban compte IG
      if (id.startsWith('ban_compte_')) {
        const compteId = parseInt(id.replace('ban_compte_', ''));
        return handleBanCompte(interaction, compteId);
      }

      // Ban tout le VA
      if (id.startsWith('ban_va_')) {
        const vaId = parseInt(id.replace('ban_va_', ''));
        return handleBanVa(interaction, vaId);
      }

      // Ban annulé
      if (id === 'ban_cancel') {
        return interaction.update({ content: '❌ Bannissement annulé.', embeds: [], components: [] });
      }

      // Edit VA
      if (id.startsWith('va_edit_')) {
        const vaId = parseInt(id.replace('va_edit_', ''));
        return handleVaEdit(interaction, vaId);
      }

      // Pause VA
      if (id.startsWith('va_pause_')) {
        const vaId = parseInt(id.replace('va_pause_', ''));
        return handleVaPause(interaction, vaId);
      }

      // Show IG Creds
      if (id.startsWith('ig_creds_')) {
        const compteId = parseInt(id.replace('ig_creds_', ''));
        const compte = igQueries.getById.get(compteId);
        if (!compte) return interaction.reply({ content: '❌ Compte introuvable.', ephemeral: true });
        
        return interaction.reply({
          content: `🔐 **Identifiants @${compte.username_ig}**\n\n**Mot de passe:** \`${compte.password || 'Non défini'}\`\n**2FA:** \`${compte.two_fa || 'Non défini'}\``,
          ephemeral: true
        });
      }

      // Btn Acc Create (Ouvre le modal final)
      if (id.startsWith('btn_acc_create_')) {
        const sessionId = id.replace('btn_acc_create_', '');
        const { accSelections } = require('../commands/acc');
        const selection = accSelections.get(sessionId);
        if (!selection) return interaction.reply({ content: 'Session expirée.', ephemeral: true });

        const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
        const modal = new ModalBuilder()
          .setCustomId(`modal_acc_final_${sessionId}`)
          .setTitle('🔑 Identifiants du compte');

        const usernameInput = new TextInputBuilder().setCustomId('username_ig').setLabel('Username Instagram').setStyle(TextInputStyle.Short).setRequired(true);
        const passwordInput = new TextInputBuilder().setCustomId('password').setLabel('Mot de passe').setStyle(TextInputStyle.Short).setRequired(false);
        const twofaInput = new TextInputBuilder().setCustomId('two_fa').setLabel('Clé 2FA').setStyle(TextInputStyle.Short).setRequired(false);
        const deeplinkInput = new TextInputBuilder().setCustomId('deeplink').setLabel('Deeplink myfeed.fans').setStyle(TextInputStyle.Short).setRequired(false);

        modal.addComponents(
          new ActionRowBuilder().addComponents(usernameInput),
          new ActionRowBuilder().addComponents(passwordInput),
          new ActionRowBuilder().addComponents(twofaInput),
          new ActionRowBuilder().addComponents(deeplinkInput)
        );

        return interaction.showModal(modal);
      }

      // SMSPool Get Number
      if (id === 'smspool_get_number') {
        const { handleSmspoolGetNumber } = require('../handlers/smspool');
        return handleSmspoolGetNumber(interaction);
      }

      // SMSPool Check Code
      if (id.startsWith('smspool_check_')) {
        const orderId = id.replace('smspool_check_', '');
        const { handleSmspoolCheck } = require('../handlers/smspool');
        return handleSmspoolCheck(interaction, orderId);
      }

      // SMSPool Cancel Order
      if (id.startsWith('smspool_cancel_')) {
        const orderId = id.replace('smspool_cancel_', '');
        const { handleSmspoolCancel } = require('../handlers/smspool');
        return handleSmspoolCancel(interaction, orderId);
      }
    }

    // ─── Modals ─────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      const id = interaction.customId;

      // Créer un VA
      if (id === 'modal_va_create') {
        return handleVaCreate(interaction);
      }

      if (id.startsWith('modal_acc_final_')) {
        const sessionId = id.replace('modal_acc_final_', '');
        return handleAccFinalCreate(interaction, sessionId);
      }

      // Éditer un VA
      if (id.startsWith('modal_va_edit_')) {
        const vaId = parseInt(id.replace('modal_va_edit_', ''));
        return handleVaUpdate(interaction, vaId);
      }
    }
  },
};

// ─── Handlers ────────────────────────────────────────────────

async function handleKickConfirm(interaction, client, vaId) {
  await interaction.deferUpdate();
  const va = vaQueries.getById.get(vaId);
  if (!va) return interaction.editReply({ content: '❌ VA introuvable.', embeds: [], components: [] });

  const comptes = igQueries.getByVa.all(vaId);
  const totalClics = comptes.reduce((sum, c) => sum + c.clics, 0);

  try {
    // Kick le membre si discord_id connu
    if (va.discord_id) {
      const guild = interaction.guild;
      const member = await guild.members.fetch(va.discord_id).catch(() => null);
      if (member) await member.kick(`/kick par ${interaction.user.tag}`).catch(() => {});
    }

    // Supprimer les comptes IG si 0 clic
    if (totalClics === 0) {
      for (const c of comptes) igQueries.delete.run(c.id);
    }

    // Supprimer de la DB
    vaQueries.delete.run(vaId);

    // Supprimer le salon (après un délai pour que le message soit visible)
    const channel = interaction.channel;
    await interaction.editReply({ content: `✅ **${va.username}** a été kické. Salon supprimé dans 5 secondes...`, embeds: [], components: [] });

    setTimeout(async () => {
      await channel.delete(`Kick de ${va.username}`).catch(() => {});
    }, 5000);

  } catch (err) {
    console.error('Erreur kick:', err);
    await interaction.editReply({ content: `❌ Erreur lors du kick : ${err.message}`, embeds: [], components: [] });
  }
}

async function handleBanCompte(interaction, compteId) {
  const { EmbedBuilder } = require('discord.js');
  igQueries.ban.run(compteId);
  const compte = igQueries.getById.get(compteId);

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle('🔴 Compte banni')
    .setDescription(`Le compte \`${compte?.username_ig || compteId}\` a été mis en ban.`)
    .setTimestamp();

  await interaction.update({ embeds: [embed], components: [] });

  // Supprimer de Google Sheets
  if (compte && compte.username_ig) {
    const { removeAccountFromSheet } = require('../services/sheets');
    await removeAccountFromSheet(compte.username_ig);
  }
}

async function handleBanVa(interaction, vaId) {
  const { EmbedBuilder } = require('discord.js');
  vaQueries.updateStatut.run('banni', vaId);
  const va = vaQueries.getById.get(vaId);
  const comptes = igQueries.getByVa.all(vaId);
  for (const c of comptes) igQueries.ban.run(c.id);

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle('🚫 VA banni')
    .setDescription(`**${va?.username || vaId}** et tous ses comptes ont été mis en ban.`)
    .setTimestamp();

  await interaction.update({ embeds: [embed], components: [] });

  // Supprimer de Google Sheets tous les comptes de ce VA
  const { removeAccountFromSheet } = require('../services/sheets');
  for (const c of comptes) {
    if (c.username_ig) await removeAccountFromSheet(c.username_ig);
  }
}

async function handleVaCreate(interaction) {
  const { EmbedBuilder } = require('discord.js');
  const username = interaction.fields.getTextInputValue('va_username');
  const discordId = interaction.fields.getTextInputValue('va_discord_id') || null;

  try {
    vaQueries.create.run({
      discord_id: discordId,
      username,
      channel_id: interaction.channelId,
      statut: 'actif',
    });

    const embed = new EmbedBuilder()
      .setColor(0x00ff88)
      .setTitle('✅ VA créé')
      .setDescription(`Le VA **${username}** a été associé à ce salon.`)
      .addFields(
        { name: 'Username', value: username, inline: true },
        { name: 'Statut', value: '🟢 Actif', inline: true },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    await interaction.reply({ content: `❌ Erreur : ${err.message}`, ephemeral: true });
  }
}

async function handleAccFinalCreate(interaction, sessionId) {
  const { EmbedBuilder } = require('discord.js');
  const { accSelections } = require('../commands/acc');
  const selection = accSelections.get(sessionId);
  if (!selection) return interaction.reply({ content: 'Session expirée.', ephemeral: true });

  const usernameIg = interaction.fields.getTextInputValue('username_ig');
  const password = interaction.fields.getTextInputValue('password') || null;
  const twofa = interaction.fields.getTextInputValue('two_fa') || null;
  const deeplink = interaction.fields.getTextInputValue('deeplink') || null;

  try {
    igQueries.create.run({ 
      va_id: selection.va_id, 
      username_ig: usernameIg, 
      deeplink: deeplink,
      profile_id: selection.profile_id,
      os: selection.os,
      password: password,
      two_fa: twofa,
      registration_date: selection.registration_date
    });
    
    const va = vaQueries.getById.get(selection.va_id);
    accSelections.delete(sessionId); // clean cache

    // Sauvegarder dans Google Sheets
    const { appendAccountToSheet } = require('../services/sheets');
    const today = new Date().toLocaleDateString('fr-FR');
    await appendAccountToSheet([
      va.username,          // VA
      usernameIg,           // Username IG
      selection.profile_id, // Profile ID
      selection.os,         // OS
      today,                // Date
      password || '',       // Mot de passe
      twofa || '',          // 2FA
      deeplink || ''        // Deeplink
    ]);

    // Remplacer le message initial
    const embed = new EmbedBuilder()
      .setColor(0xe1306c)
      .setTitle('✅ Compte Instagram ajouté')
      .setDescription(`Le compte **${usernameIg}** a bien été enregistré.`)
      .setTimestamp();

    await interaction.update({ embeds: [embed], components: [], content: null });
  } catch (err) {
    await interaction.reply({ content: `❌ Erreur : ${err.message}`, ephemeral: true });
  }
}

async function handleVaEdit(interaction, vaId) {
  const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
  const va = vaQueries.getById.get(vaId);
  if (!va) return interaction.reply({ content: '❌ VA introuvable.', ephemeral: true });

  const modal = new ModalBuilder()
    .setCustomId(`modal_va_edit_${vaId}`)
    .setTitle(`✏️ Modifier le VA — ${va.username}`);

  const usernameInput = new TextInputBuilder()
    .setCustomId('va_username')
    .setLabel('Username')
    .setStyle(TextInputStyle.Short)
    .setValue(va.username)
    .setRequired(true);

  const discordIdInput = new TextInputBuilder()
    .setCustomId('va_discord_id')
    .setLabel('Discord ID du VA (optionnel)')
    .setStyle(TextInputStyle.Short)
    .setValue(va.discord_id ? String(va.discord_id) : '')
    .setRequired(false);

  const notesInput = new TextInputBuilder()
    .setCustomId('va_notes')
    .setLabel('Notes')
    .setStyle(TextInputStyle.Paragraph)
    .setValue(va.notes || '')
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(usernameInput),
    new ActionRowBuilder().addComponents(discordIdInput),
    new ActionRowBuilder().addComponents(notesInput),
  );

  await interaction.showModal(modal);
}

async function handleVaUpdate(interaction, vaId) {
  const va = vaQueries.getById.get(vaId);
  const username = interaction.fields.getTextInputValue('va_username');
  const discordId = interaction.fields.getTextInputValue('va_discord_id') || null;
  const notes = interaction.fields.getTextInputValue('va_notes');

  vaQueries.update.run({ ...va, username, discord_id: discordId, notes });
  await interaction.reply({ content: `✅ VA **${username}** mis à jour. (Discord ID: ${discordId || 'Non défini'})`, ephemeral: true });
}

async function handleVaPause(interaction, vaId) {
  const va = vaQueries.getById.get(vaId);
  const newStatut = va?.statut === 'pause' ? 'actif' : 'pause';
  vaQueries.updateStatut.run(newStatut, vaId);
  const emoji = newStatut === 'pause' ? '⏸️' : '🟢';
  await interaction.update({ content: `${emoji} Statut changé : **${newStatut}**`, embeds: [], components: [] });
}

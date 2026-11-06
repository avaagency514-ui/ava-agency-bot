const { Events } = require('discord.js');
const { vaQueries, igQueries } = require('../database/db');
const { handleContentFactory } = require('../handlers/contentFactory');
const { handleChatterButton, handleChatterSelect, handleChatterModal } = require('../handlers/chatterHandler');
const { handlePenaltyButton, handlePenaltySelect, handlePenaltyModal } = require('../handlers/penaltyHandler');
const { handleComptaButton, handleComptaSelect, handleComptaModal } = require('../handlers/comptaHandler');
const { handlePushButton, handlePushModal } = require('../handlers/pushHandler');

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction, client) {
    try {
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

    // ─── AVA Broadcast Studio (#pub) ────────────────────────────
    if (interaction.customId && interaction.customId.startsWith('pub_')) {
      const { handlePubInteraction } = require('../services/pubService');
      return handlePubInteraction(interaction, client);
    }

    // ─── Sélecteurs (Menus) ──────────────────────────────────────
    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;
      
      if (id.startsWith('chatter_')) {
        return handleChatterSelect(interaction, client);
      }

      if (id.startsWith('compta_')) {
        return handleComptaSelect(interaction, client);
      }

      if (id.startsWith('penalty_')) {
        return handlePenaltySelect(interaction, client);
      }

      if (id.startsWith('sel_acc_')) {
        const { accSelections, buildAccComponents } = require('../commands/acc');
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
          
        const components = buildAccComponents ? buildAccComponents(sessionId, selection) : interaction.message.components;
        return interaction.update({ embeds: [embed], components });
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

      // Content Factory Twitter qty request
      if (id.startsWith('tw_req_')) {
        const { handleTwitterContentSelect } = require('../handlers/twitterContentFactory');
        return handleTwitterContentSelect(interaction);
      }

      // Content Factory Twitter Profile ID Select
      if (id.startsWith('tw_founder_select_')) {
        const { handleTwitterFounderSelect } = require('../handlers/twitterContentFactory');
        return handleTwitterFounderSelect(interaction);
      }
    }
    if (interaction.isButton()) {
      const id = interaction.customId;

      // Push Telegram Mass DM
      if (id.startsWith('push_')) {
        return handlePushButton(interaction, client);
      }

      // Ticket onboarding & role assignment
      if (id.startsWith('ticket_')) {
        const { handleTicketButton } = require('../handlers/ticketHandler');
        return handleTicketButton(interaction, client);
      }

      // Chatter interactions
      if (id.startsWith('chatter_')) {
        return handleChatterButton(interaction, client);
      }

      // Penalty interactions
      if (id.startsWith('penalty_')) {
        return handlePenaltyButton(interaction, client);
      }

      // Compta interactions
      if (id.startsWith('compta_')) {
        return handleComptaButton(interaction, client);
      }

      // Pagination /acc Profile IDs
      if (id.startsWith('btn_acc_page_')) {
        const parts = id.split('_');
        const action = parts[3]; // 'prev' or 'next'
        const sessionId = parts.slice(4).join('_');
        const { accSelections, buildAccComponents } = require('../commands/acc');
        const selection = accSelections.get(sessionId);
        if (!selection) return interaction.reply({ content: 'Session expirée. Veuillez refaire la commande `/acc`.', ephemeral: true });

        const totalPages = Math.ceil((selection.allProfiles?.length || 1) / 25);
        if (action === 'prev' && selection.page > 0) selection.page--;
        if (action === 'next' && selection.page < totalPages - 1) selection.page++;

        const newComponents = buildAccComponents(sessionId, selection);
        return interaction.update({ components: newComponents });
      }

      // Content Factory
      if (id.startsWith('content_')) {
        return handleContentFactory(interaction, client);
      }

      // 🎬 Générer un Reel avec Caption
      if (id === 'cf_reel_generate') {
        const { handleGenerateReel } = require('../handlers/contentFactory');
        return handleGenerateReel(interaction);
      }

      // Content Factory Twitter
      if (id.startsWith('tw_content_')) {
        const { handleTwitterContent } = require('../handlers/twitterContentFactory');
        return handleTwitterContent(interaction);
      }

      // SMSPool Get Number Twitter
      if (id === 'tw_smspool_get_number') {
        const { handleSmspoolGetNumberTwitter } = require('../handlers/smspool');
        return handleSmspoolGetNumberTwitter(interaction);
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

      // Link Telegram
      if (id.startsWith('va_telegram_')) {
        const vaId = parseInt(id.replace('va_telegram_', ''));
        const telegramCodes = require('../services/telegramCodes');
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        telegramCodes.set(code, vaId);
        
        // Expiration au bout de 15 minutes
        setTimeout(() => telegramCodes.delete(code), 15 * 60 * 1000);

        return interaction.reply({
          content: `🔗 **Connexion Telegram**\n\nPour lier ce VA à un compte Telegram, ouvre le bot Telegram et envoie ce message :\n\n\`/connect ${code}\`\n\n*(Ce code expire dans 15 minutes)*`,
          ephemeral: true
        });
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
        const emailInput = new TextInputBuilder().setCustomId('email_numero').setLabel('Mail / Numéro').setStyle(TextInputStyle.Short).setRequired(false);
        const twofaInput = new TextInputBuilder().setCustomId('two_fa').setLabel('Clé 2FA').setStyle(TextInputStyle.Short).setRequired(false);

        modal.addComponents(
          new ActionRowBuilder().addComponents(usernameInput),
          new ActionRowBuilder().addComponents(passwordInput),
          new ActionRowBuilder().addComponents(emailInput),
          new ActionRowBuilder().addComponents(twofaInput)
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

      // Push Telegram Modals
      if (id.startsWith('push_')) {
        return handlePushModal(interaction, client);
      }

      // Chatter Modals
      if (id.startsWith('chatter_')) {
        return handleChatterModal(interaction, client);
      }

      // Penalty Modals
      if (id.startsWith('penalty_')) {
        return handlePenaltyModal(interaction, client);
      }

      // Compta Modals
      if (id.startsWith('compta_')) {
        return handleComptaModal(interaction, client);
      }

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
  } catch (err) {
    console.error('❌ Erreur interaction non capturée :', err);
    const msg = { content: '❌ Une erreur est survenue lors de cette interaction. Veuillez réessayer.', ephemeral: true };
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply(msg);
      } else {
        await interaction.followUp(msg);
      }
    } catch (_) {}
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

  await interaction.deferUpdate(); // Empêche l'erreur de timeout Discord pendant le scan Drive

  const usernameIg = interaction.fields.getTextInputValue('username_ig');
  const password = interaction.fields.getTextInputValue('password') || null;
  const emailNumero = interaction.fields.getTextInputValue('email_numero') || null;
  const twofa = interaction.fields.getTextInputValue('two_fa') || null;

  try {
    igQueries.create.run({ 
      va_id: selection.va_id, 
      username_ig: usernameIg, 
      deeplink: null,
      profile_id: selection.profile_id,
      os: selection.os,
      password: password,
      two_fa: twofa,
      registration_date: selection.registration_date
    });
    
    const va = vaQueries.getById.get(selection.va_id);
    accSelections.delete(sessionId); // clean cache

    // Déterminer le marché d'après le channel ou par défaut
    const isUs = (process.env.CHANNEL_CONTENT_US && va.channel_id === process.env.CHANNEL_CONTENT_US) || (process.env.CHANNEL_CONTENT_US_MOBILE && va.channel_id === process.env.CHANNEL_CONTENT_US_MOBILE);
    const marche = isUs ? "US" : "FR";
    
    // Nettoyer le pseudo (enlève les points, tirets, etc.) pour le lien
    const cleanUsername = usernameIg.replace(/[^a-zA-Z0-9]/g, '');
    const lienInsta = `https://linky.fans/${cleanUsername}`;

    // Récupérer les liens Drive
    const { fetchProfileLinks } = require('../services/drive');
    const links = await fetchProfileLinks(selection.profile_id);

    // Sauvegarder dans Google Sheets (Format A à O)
    const { appendAccountToSheet } = require('../services/sheets');
    await appendAccountToSheet([
      marche,               // A: Marché
      "Pause",              // B: Statut (par défaut Pause)
      usernameIg,           // C: Nom d'utilisateur
      password || '',       // D: Mot de passe
      emailNumero || '',    // E: Mail/Numero
      twofa || '',          // F: 2FA
      '',                   // G: Api buffer
      selection.profile_id, // H: ID Dossier
      links.driveUrl,       // I: Lien Drive
      lienInsta,            // J: Lien Insta
      (emailNumero && emailNumero.includes('@')) ? emailNumero : '', // K: Mohmal
      password || '',       // L: MP
      va ? va.username : 'Fondateur' // M: Nom VA
    ]);

    // Remplacer le message initial
    const embed = new EmbedBuilder()
      .setColor(0xe1306c)
      .setTitle('✅ Compte Instagram ajouté')
      .setDescription(`Le compte **${usernameIg}** a bien été enregistré.\n\n🔗 **Lien Insta :** ${lienInsta}\n📁 **Dossier Drive :** [Ouvrir le dossier](${links.driveUrl || 'Non trouvé'})`)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed], components: [], content: null });
  } catch (err) {
    await interaction.followUp({ content: `❌ Erreur : ${err.message}`, ephemeral: true });
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

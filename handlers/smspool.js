const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getTemporaryNumber, checkSMS, cancelSMS } = require('../services/smspool');

async function handleSmspoolGetNumber(interaction) {
  await interaction.deferUpdate();

  // Try to get a number for Instagram (service '73') in US (country '1') or UK (country '2')
  // We'll try US first.
  const result = await getTemporaryNumber('457', '1');

  if (!result.success || result.data.success === 0) {
    const errorMsg = result.data ? result.data.message : result.error;
    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('❌ Erreur SMSPool')
      .setDescription(`Impossible d'obtenir un numéro : \`${errorMsg}\`\n\n*Il n'y a probablement plus de stock disponible pour Instagram aux USA. Réessaye plus tard.*`)
      .setTimestamp();
    
    return interaction.editReply({ embeds: [embed], components: [] });
  }

  const { phonenumber, order_id } = result.data;

  const embed = new EmbedBuilder()
    .setColor(0x00ff88)
    .setTitle('📱 Numéro Instagram prêt !')
    .setDescription(`Voici ton numéro temporaire. Rentre-le sur Instagram pour recevoir le code.\n\n📞 **Numéro :** \`+1${phonenumber}\``)
    .setFooter({ text: `Order ID: ${order_id}` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`smspool_check_${order_id}`)
      .setLabel('🔄 Vérifier les SMS (Code)')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`smspool_cancel_${order_id}`)
      .setLabel('🛑 Refund (Annuler)')
      .setStyle(ButtonStyle.Danger)
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
}

async function handleSmspoolCheck(interaction, orderId) {
  await interaction.deferReply({ ephemeral: true });

  const result = await checkSMS(orderId);

  if (!result.success) {
    return interaction.editReply({ content: `❌ Erreur API : ${result.error}` });
  }

  // smspool API returns { status: 1 (pending), 3 (completed), sms: "Code is 123456" }
  const status = parseInt(result.data.status);

  if (status === 1) {
    return interaction.editReply({ content: `⏳ En attente du SMS... Le code n'est pas encore arrivé. Réessaye dans quelques secondes.` });
  } else if (status === 3) {
    const code = result.data.sms;
    const embed = new EmbedBuilder()
      .setColor(0x00ff88)
      .setTitle('💬 SMS Reçu !')
      .setDescription(`**Message :**\n\`${code}\``);
    return interaction.editReply({ embeds: [embed] });
  } else {
    return interaction.editReply({ content: `❌ Statut inconnu ou numéro expiré.` });
  }
}

async function handleSmspoolCancel(interaction, orderId) {
  await interaction.deferReply({ ephemeral: true });

  const result = await cancelSMS(orderId);

  if (!result.success) {
    return interaction.editReply({ content: `❌ Erreur API : ${result.error}` });
  }

  // smspool API returns { success: 1 } for success
  if (result.data.success === 1) {
    return interaction.editReply({ content: `✅ Commande annulée avec succès. L'argent a été remboursé sur le solde SMSPool.` });
  } else {
    return interaction.editReply({ content: `❌ Impossible d'annuler cette commande. Message: ${result.data.message || 'Erreur inconnue'}` });
  }
}

module.exports = { handleSmspoolGetNumber, handleSmspoolCheck, handleSmspoolCancel };

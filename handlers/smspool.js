const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getTemporaryNumber, checkSMS, cancelSMS } = require('../services/smspool');

const activePollings = {};

async function handleSmspoolGetNumber(interaction) {
  await interaction.deferUpdate();

  const result = await getTemporaryNumber('457', '1');

  if (!result.success || result.data.success === 0) {
    const errorMsg = result.data ? result.data.message : result.error;
    const embed = new EmbedBuilder()
      .setColor(0xff9900)
      .setTitle('⚠️ SMSPool Temporairement Saturé')
      .setDescription(`Impossible d'obtenir un numéro : **${errorMsg}**\n\n*Les lignes SMSPool pour Instagram (USA) sont très sollicitées en ce moment. Clique sur le bouton ci-dessous pour réessayer.*`)
      .setTimestamp();
    
    const retryRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('smspool_get_number')
        .setLabel('🔄 Réessayer maintenant')
        .setStyle(ButtonStyle.Primary)
    );

    return interaction.editReply({ embeds: [embed], components: [retryRow] });
  }

  const { phonenumber, order_id } = result.data;

  const embed = new EmbedBuilder()
    .setColor(0x00ff88)
    .setTitle('📱 Numéro Instagram prêt !')
    .setDescription(`Voici ton numéro temporaire. Rentre-le sur Instagram pour recevoir le code.\n\n📞 **Numéro :** \`+1${phonenumber}\`\n\n*(Je vérifie l'arrivée du SMS automatiquement toutes les 5 secondes...)*`)
    .setFooter({ text: `Order ID: ${order_id}` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`smspool_cancel_${order_id}`)
      .setLabel('🛑 Refund (Annuler)')
      .setStyle(ButtonStyle.Danger)
  );

  await interaction.editReply({ embeds: [embed], components: [row] });

  let attempts = 0;
  const pollInterval = setInterval(async () => {
    attempts++;
    try {
      const checkRes = await checkSMS(order_id);
      if (checkRes.success) {
         const status = parseInt(checkRes.data.status);
         if (status === 3) {
           clearInterval(pollInterval);
           delete activePollings[order_id];
           
           const successEmbed = new EmbedBuilder()
             .setColor(0x00ff88)
             .setTitle('💬 SMS Reçu !')
             .setDescription(`**Numéro :** \`+1${phonenumber}\`\n**Message :**\n\`${checkRes.data.sms}\``);
             
           await interaction.followUp({ content: `<@${interaction.user.id}> ton code est là !`, embeds: [successEmbed] });
         } else if (status === 6) { // Canceled/Refunded
           clearInterval(pollInterval);
           delete activePollings[order_id];
         }
      }
    } catch (err) {}

    if (attempts >= 120) { // 10 minutes
      clearInterval(pollInterval);
      delete activePollings[order_id];
      await interaction.followUp({ content: `<@${interaction.user.id}> ❌ **Délai expiré** (10 minutes) pour le numéro \`+1${phonenumber}\`. Arrêt de la vérification automatique.`, ephemeral: true }).catch(()=>{});
    }
  }, 5000);

  activePollings[order_id] = pollInterval;
}

async function handleSmspoolGetNumberTwitter(interaction) {
  await interaction.deferUpdate();

  // Service 948 = Twitter / X, Country 1 = USA
  const result = await getTemporaryNumber('948', '1');

  if (!result.success || result.data.success === 0) {
    const errorMsg = result.data ? result.data.message : result.error;
    const embed = new EmbedBuilder()
      .setColor(0xff9900)
      .setTitle('⚠️ SMSPool Temporairement Saturé')
      .setDescription(`Impossible d'obtenir un numéro Twitter : **${errorMsg}**\n\n*Les lignes SMSPool pour Twitter / X (USA) sont très sollicitées en ce moment. Clique sur le bouton ci-dessous pour réessayer.*`)
      .setTimestamp();
    
    const retryRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('tw_smspool_get_number')
        .setLabel('🔄 Réessayer maintenant')
        .setStyle(ButtonStyle.Primary)
    );

    return interaction.editReply({ embeds: [embed], components: [retryRow] });
  }

  const { phonenumber, order_id } = result.data;

  const embed = new EmbedBuilder()
    .setColor(0x1da1f2)
    .setTitle('📱 Numéro Twitter / X prêt !')
    .setDescription(`Voici ton numéro temporaire. Rentre-le sur Twitter / X pour recevoir le code.\n\n📞 **Numéro :** \`+1${phonenumber}\`\n\n*(Je vérifie l'arrivée du SMS automatiquement toutes les 5 secondes...)*`)
    .setFooter({ text: `Order ID: ${order_id}` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`smspool_cancel_${order_id}`)
      .setLabel('🛑 Refund (Annuler)')
      .setStyle(ButtonStyle.Danger)
  );

  await interaction.editReply({ embeds: [embed], components: [row] });

  let attempts = 0;
  const pollInterval = setInterval(async () => {
    attempts++;
    try {
      const checkRes = await checkSMS(order_id);
      if (checkRes.success) {
         const status = parseInt(checkRes.data.status);
         if (status === 3) {
           clearInterval(pollInterval);
           delete activePollings[order_id];
           
           const successEmbed = new EmbedBuilder()
             .setColor(0x1da1f2)
             .setTitle('💬 SMS Twitter / X Reçu !')
             .setDescription(`**Numéro :** \`+1${phonenumber}\`\n**Message :**\n\`${checkRes.data.sms}\``);
             
           await interaction.followUp({ content: `<@${interaction.user.id}> ton code Twitter / X est là !`, embeds: [successEmbed] });
         } else if (status === 6) { // Canceled/Refunded
           clearInterval(pollInterval);
           delete activePollings[order_id];
         }
      }
    } catch (err) {}

    if (attempts >= 120) { // 10 minutes
      clearInterval(pollInterval);
      delete activePollings[order_id];
      await interaction.followUp({ content: `<@${interaction.user.id}> ❌ **Délai expiré** (10 minutes) pour le numéro Twitter \`+1${phonenumber}\`. Arrêt de la vérification automatique.`, ephemeral: true }).catch(()=>{});
    }
  }, 5000);

  activePollings[order_id] = pollInterval;
}

async function handleSmspoolCheck(interaction, orderId) {
  // Legacy function just in case
  await interaction.deferReply({ ephemeral: true });

  const result = await checkSMS(orderId);

  if (!result.success) {
    return interaction.editReply({ content: `❌ Erreur API : ${result.error}` });
  }

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

  if (activePollings[orderId]) {
    clearInterval(activePollings[orderId]);
    delete activePollings[orderId];
  }

  const result = await cancelSMS(orderId);

  if (!result.success) {
    // Si SMSPool demande d'attendre (ex: "please try again in 53 seconds")
    const match = result.error && result.error.match(/try again in (\d+)\s*seconds?/i);
    if (match) {
      const waitSeconds = parseInt(match[1], 10);
      await interaction.editReply({ 
        content: `⏳ **Remboursement programmé !**\nL'API SMSPool exige un délai de sécurité de **${waitSeconds}s** avant de pouvoir annuler.\n\nLe bot va **automatiquement annuler et rembourser** la commande dans ${waitSeconds} secondes, tu n'as rien d'autre à faire !` 
      });

      // Lancement automatique du remboursement après écoulement du délai (+ 2s de marge)
      setTimeout(async () => {
        try {
          const autoResult = await cancelSMS(orderId);
          if (autoResult.success && autoResult.data && autoResult.data.success === 1) {
            await interaction.followUp({
              content: `<@${interaction.user.id}> ✅ **Remboursement validé !**\nLa commande SMSPool \`${orderId}\` a été annulée et les crédits ont été remboursés sur votre solde.`,
              ephemeral: true
            }).catch(() => {});
          } else {
            // Deuxième tentative de sécurité 5s plus tard
            setTimeout(async () => {
              const retry2 = await cancelSMS(orderId);
              if (retry2.success && retry2.data && retry2.data.success === 1) {
                await interaction.followUp({
                  content: `<@${interaction.user.id}> ✅ **Remboursement validé !**\nLa commande SMSPool \`${orderId}\` a été annulée et remboursée avec succès.`,
                  ephemeral: true
                }).catch(() => {});
              }
            }, 5000);
          }
        } catch (e) {
          console.error('Erreur auto-cancel SMSPool:', e);
        }
      }, (waitSeconds + 2) * 1000);

      return;
    }

    return interaction.editReply({ content: `❌ Erreur API : ${result.error}` });
  }

  if (result.data.success === 1) {
    return interaction.editReply({ content: `✅ Commande annulée avec succès. L'argent a été remboursé sur le solde SMSPool.` });
  } else {
    return interaction.editReply({ content: `❌ Impossible d'annuler cette commande. Message: ${result.data.message || 'Erreur inconnue'}` });
  }
}

module.exports = { handleSmspoolGetNumber, handleSmspoolGetNumberTwitter, handleSmspoolCheck, handleSmspoolCancel };

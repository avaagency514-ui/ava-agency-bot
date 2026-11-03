const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const https = require('https');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('db-sync')
    .setDescription('Gestion et sauvegarde de la base de données agency.db')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('backup')
        .setDescription('Télécharger une copie de sauvegarde de agency.db')
    )
    .addSubcommand(sub =>
      sub.setName('restore')
        .setDescription('Restaurer agency.db depuis un fichier .db')
        .addAttachmentOption(opt =>
          opt.setName('fichier')
            .setDescription('Le fichier agency.db à restaurer')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const dataDir = path.join(__dirname, '../data');
    const dbPath = path.join(dataDir, 'agency.db');

    if (sub === 'backup') {
      if (!fs.existsSync(dbPath)) {
        return interaction.reply({ content: '❌ Fichier agency.db introuvable.', ephemeral: true });
      }
      const attachment = new AttachmentBuilder(dbPath, { name: `agency_backup_${new Date().toISOString().slice(0, 10)}.db` });
      return interaction.reply({
        content: '📦 **Sauvegarde de la base de données :**',
        files: [attachment],
        ephemeral: true
      });
    }

    if (sub === 'restore') {
      const file = interaction.options.getAttachment('fichier');
      if (!file.name.endsWith('.db') && !file.name.endsWith('.sqlite')) {
        return interaction.reply({ content: '❌ Veuillez envoyer un fichier valide (.db ou .sqlite).', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      try {
        const fileStream = fs.createWriteStream(dbPath);
        https.get(file.url, response => {
          response.pipe(fileStream);
          fileStream.on('finish', async () => {
            fileStream.close();
            await interaction.editReply({
              content: '✅ **Base de données restaurée avec succès !** Le bot va redémarrer pour appliquer les changements.'
            });
            setTimeout(() => process.exit(0), 2000);
          });
        }).on('error', async err => {
          await interaction.editReply({ content: `❌ Erreur téléchargement : ${err.message}` });
        });
      } catch (err) {
        await interaction.editReply({ content: `❌ Erreur restauration : ${err.message}` });
      }
    }
  }
};

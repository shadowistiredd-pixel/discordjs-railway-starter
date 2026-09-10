'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
} = require('discord.js');

const config   = require('./config');
const { isStaff } = require('./report');

function buildRecruitPanelEmbed() {
  return new EmbedBuilder()
    .setTitle('Nek:// Nekoma Recruitment Panel')
    .setColor(Colors.Green)
    .setDescription(
      'Recruited someone into the Nekoma?\n' +
      'Click **New Recruit** below to log them.\n\n' +
      'Your progress will be saved if you close the form early ' +
      'just click the button again to pick up where you left off.'
    )
    .setFooter({ text: config.FOOTER_TEXT, iconURL: config.FOOTER_ICON });
}

function buildRecruitPanelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('recruit_new')
      .setLabel('New Recruit 📋')
      .setStyle(ButtonStyle.Success)
  );
}

async function handleRecruitPanelCommand(interaction) {
  if (!isStaff(interaction.member)) {
    await interaction.reply({ content: 'Staff only.', ephemeral: true });
    return;
  }

  await interaction.reply({
    embeds: [buildRecruitPanelEmbed()],
    components: [buildRecruitPanelRow()],
  });
}

module.exports = { handleRecruitPanelCommand };

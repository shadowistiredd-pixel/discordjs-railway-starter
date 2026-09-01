'use strict';

const { EmbedBuilder } = require('discord.js');
const { FOOTER_TEXT, FOOTER_ICON } = require('./config');

/**
 * Builds the standard report embed used for the live report,
 * the "closed" state, and the log-channel copy.
 */
function buildReportEmbed({
  title,
  color,
  callerName,
  robloxValue,
  linkValue,
  seenValue,
  enemiesValue,
  notesValue,
  proofUrl = null,
  avatarUrl = null,
}) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setFooter({ text: FOOTER_TEXT, iconURL: FOOTER_ICON })
    .addFields(
      { name: 'CALLER', value: callerName, inline: false },
      { name: 'JOIN OFF', value: robloxValue, inline: false },
      { name: 'PROFILE LINK', value: linkValue || 'N/A', inline: false },
      { name: 'LAST SEEN', value: seenValue || 'N/A', inline: false },
      { name: 'OPPONENTS', value: enemiesValue, inline: false },
      { name: 'REGION', value: notesValue || 'No additional notes', inline: false }
    );

  if (avatarUrl) {
    embed.setThumbnail(avatarUrl);
  }

  if (proofUrl) {
    embed.setImage(proofUrl);
  }

  return embed;
}

module.exports = { buildReportEmbed };

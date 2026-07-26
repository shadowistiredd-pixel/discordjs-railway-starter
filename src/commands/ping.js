const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder().setName("ping").setDescription("Get the bot's latency"),
  execute: async (interaction, client) => {
    await interaction.reply(`Pong \`${Math.round(client.ws.ping)}ms\` 🏓`);
  },
};

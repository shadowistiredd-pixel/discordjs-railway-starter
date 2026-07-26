const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder().setName("hello").setDescription("Say hello"),
  execute: async (interaction) => {
    await interaction.reply("Choo choo! 🚅");
  },
};

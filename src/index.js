'use strict';

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  MessageFlags,
} = require('discord.js');

const config = require('./config');
const state  = require('./state');
const { handleReportCommand, handleModalSubmit, handleReportButton } = require('./report');
const { buildLeaderboardAttachment }             = require('./leaderboard');
const {
  handleStaffPanelCommand,
  handleStaffButton,
  handleStaffModal,
} = require('./staffpanel');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const commands = [
  new SlashCommandBuilder()
    .setName('report')
    .setDescription(config.BRAND_NAME)
    .toJSON(),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the top 3 users by report credits')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('staffpanel')
    .setDescription('Staff: end the active report, or manage the credits board')
    .toJSON(),
];

async function registerCommands() {
  const rest     = new REST({ version: '10' }).setToken(config.TOKEN);
  const clientId = config.CLIENT_ID || client.application.id;

  if (config.GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(clientId, config.GUILD_ID), {
      body: commands,
    });
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
  }
}

// Check once at startup, then hourly — resets the whole credits board the
// first time the bot sees a new calendar month (UTC).
function startMonthlyResetChecker() {
  state.resetIfNewMonth();
  setInterval(() => state.resetIfNewMonth(), 60 * 60 * 1000);
}

client.once('ready', async () => {
  await state.connect();
  try {
    await registerCommands();
  } catch (err) {
    console.error('[ERROR] Failed to register slash commands:', err);
  }
  startMonthlyResetChecker();
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'report') {
        await handleReportCommand(interaction);
        return;
      }

      if (interaction.commandName === 'leaderboard') {
        await interaction.deferReply();
        const attachment = await buildLeaderboardAttachment(interaction.guild);
        await interaction.editReply({ files: [attachment] });
        return;
      }

      if (interaction.commandName === 'staffpanel') {
        await handleStaffPanelCommand(interaction);
        return;
      }
    }

    if (interaction.isModalSubmit()) {
      if (await handleStaffModal(interaction)) return;
      await handleModalSubmit(interaction);
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith('staff_')) {
        await handleStaffButton(interaction);
        return;
      }
      if (await handleReportButton(interaction)) return;
    }
  } catch (err) {
    console.error('[ERROR] Unhandled interaction error:', err);
    const payload = {
      content: 'Something went wrong handling that — please try again.',
      flags: MessageFlags.Ephemeral,
    };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

client.login(config.TOKEN);

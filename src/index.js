const fs = require("node:fs");
const path = require("node:path");
const {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
} = require("discord.js");

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error(
    "DISCORD_TOKEN is not set. Add it as a service variable in Railway: " +
      "Discord Developer Portal -> your application -> Bot -> Reset Token."
  );
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// Load every command file next to this one, so the working directory does not matter.
const commandsDir = path.join(__dirname, "commands");
const payload = [];
for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith(".js"))) {
  const command = require(path.join(commandsDir, file));
  if (!command?.data || typeof command.execute !== "function") {
    console.warn(`Skipping ${file}: it must export { data, execute }.`);
    continue;
  }
  client.commands.set(command.data.name, command);
  payload.push(command.data.toJSON());
}

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  try {
    const rest = new REST({ version: "10" }).setToken(token);
    await rest.put(Routes.applicationCommands(c.user.id), { body: payload });
    console.log(`Registered ${payload.length} slash command(s): ${payload.map((p) => "/" + p.name).join(", ")}`);
    console.log("Global commands can take a few minutes to appear in Discord.");
  } catch (error) {
    console.error("Failed to register slash commands:", error.message);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, client);
  } catch (error) {
    console.error(`Command /${interaction.commandName} failed:`, error);
    const reply = { content: "Something went wrong running that command.", ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(reply);
    else await interaction.reply(reply);
  }
});

client.login(token).catch((error) => {
  if (error?.code === "TokenInvalid" || /token/i.test(error?.message ?? "")) {
    console.error(
      "Discord rejected the token. Copy it again from the Developer Portal and update DISCORD_TOKEN."
    );
  } else {
    console.error("Login failed:", error);
  }
  process.exit(1);
});

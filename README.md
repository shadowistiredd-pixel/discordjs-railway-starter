# Discord bot starter for Railway (discord.js)

A minimal slash-command bot on discord.js v14 that installs cleanly: the lockfile
matches `package.json`, so a frozen install succeeds instead of aborting the build.

## Why this exists

The long-standing discord.js starter on Railway ships a `yarn.lock` that has drifted
out of sync with its `package.json`. Railway's builder installs with
`--frozen-lockfile`, which refuses to resolve the difference:

```
warning discord.js@13.17.1: Version 13 is no longer supported.
error Your lockfile needs to be updated, but yarn was run with `--frozen-lockfile`.
Build Failed: process "yarn install --frozen-lockfile" did not complete successfully: exit code: 1
```

Every deploy dies during install — the bot code never runs.

Here `package-lock.json` is generated from the exact dependency set and committed, so
`npm ci` reproduces the same tree every time and the build is deterministic.

The code is also ported to **discord.js v14** (the incumbent is on v13, which upstream
marks as no longer supported): `GatewayIntentBits`, `Events`, `isChatInputCommand()`,
and `REST` imported from `discord.js` itself rather than the separate
`@discordjs/rest` and `discord-api-types` packages.

## Setup

1. Create an application at the [Discord Developer Portal](https://discord.com/developers/applications).
2. Under **Bot**, reset the token and set it as `DISCORD_TOKEN` in Railway.
3. Under **OAuth2 → URL Generator**, select scopes `bot` and `applications.commands`,
   then open the generated URL to invite the bot.

Slash commands are registered globally on startup and can take a few minutes to
appear in Discord.

## Commands

| Command | Does |
|---------|------|
| `/ping` | Replies with the gateway latency |
| `/hello` | Replies with a greeting |

## Adding a command

Drop a file in `src/commands/` exporting `data` and `execute`:

```js
const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder().setName("name").setDescription("What it does"),
  execute: async (interaction, client) => {
    await interaction.reply("Hey!");
  },
};
```

Commands are loaded relative to `__dirname`, so the working directory does not matter.

## Run locally

```bash
npm ci
DISCORD_TOKEN=your-token npm start
```

## Configuration

| Variable | Required | Purpose |
|----------|----------|---------|
| `DISCORD_TOKEN` | yes | Bot token from the Developer Portal |

## License

MIT

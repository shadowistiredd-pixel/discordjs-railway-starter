'use strict';

require('dotenv').config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} environment variable is not set.\n` +
        `Add it to your .env file (see .env.example).`
    );
  }
  return value;
}

module.exports = {
  TOKEN: requireEnv('DISCORD_BOT_TOKEN'),
  CLIENT_ID: process.env.DISCORD_CLIENT_ID || null,
  GUILD_ID: process.env.DISCORD_GUILD_ID || null,

  BRAND_NAME: 'Nek:// Nekoma Report System',

  FOOTER_TEXT: 'Nek:// Nekoma Report System',
  FOOTER_ICON:
    'https://cdn.discordapp.com/icons/1521901612396974110/' +
    '23565ee27659813e2cdd014b22b933e4.webp?size=1024',

  GANK_ROLE_ID: process.env.GANK_ROLE_ID || '1521972811856613557',
  STAFF_ROLE_ID: process.env.STAFF_ROLE_ID || null,

  POS_CHECK_COOLDOWN_MS: 30 * 60 * 1000, // 30 minutes

  // Roblox avatar-headshot thumbnail fetched for the embed
  ROBLOX_AVATAR_SIZE: '420x420',
};

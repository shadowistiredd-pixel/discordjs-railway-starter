'use strict';

const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
} = require('discord.js');

const config = require('./config');
const state  = require('./state');
const { buildReportEmbed } = require('./embeds');

const MODAL_ID = 'nek_report_modal';

// ---------------------------------------------------------------------------
// Roblox avatar-headshot lookup (username -> userId -> thumbnail URL)
// ---------------------------------------------------------------------------
async function fetchRobloxAvatarHeadshot(username) {
  try {
    const lookupRes = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
    });
    if (!lookupRes.ok) return null;
    const lookupData = await lookupRes.json();
    const userId = lookupData?.data?.[0]?.id;
    if (!userId) return null;

    const thumbRes = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}` +
        `&size=${config.ROBLOX_AVATAR_SIZE}&format=Png&isCircular=false`
    );
    if (!thumbRes.ok) return null;
    const thumbData = await thumbRes.json();
    return thumbData?.data?.[0]?.imageUrl || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// /report  ->  opens the modal (unless the caller already has one open)
// ---------------------------------------------------------------------------
async function handleReportCommand(interaction) {
  const callerId = interaction.user.id;

  if (state.isBlocked(callerId)) {
    await interaction.reply({
      content: '🚫 You have been blocked from making gank reports.',
      ephemeral: true,
    });
    return;
  }

  if (state.userActiveReport.has(callerId)) {
    await interaction.reply({
      content:
        'You already have an open **gank** report. ' +
        'Please end it before starting a new one.',
      ephemeral: true,
    });
    return;
  }

  const modal = new ModalBuilder().setCustomId(MODAL_ID).setTitle(config.BRAND_NAME);

  const roblox = new TextInputBuilder()
    .setCustomId('roblox')
    .setLabel('Roblox Username')
    .setPlaceholder('ex: desiredworvzy')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(200);

  const link = new TextInputBuilder()
    .setCustomId('link')
    .setLabel('Roblox Profile Link')
    .setPlaceholder('ex: https://www.roblox.com/users/..../profile')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(200);

  const seen = new TextInputBuilder()
    .setCustomId('seen')
    .setLabel('Last seen at')
    .setPlaceholder('Cafeteria, Rooftops. Basketball court')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  const enemies = new TextInputBuilder()
    .setCustomId('enemies')
    .setLabel('Enemies')
    .setPlaceholder('List enemies, each on a new line')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  const notes = new TextInputBuilder()
    .setCustomId('notes')
    .setLabel('Server Region / Allies')
    .setPlaceholder('Miami, Chicago, Texas, NY / VioletIsTiredd, Etc')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(roblox),
    new ActionRowBuilder().addComponents(link),
    new ActionRowBuilder().addComponents(seen),
    new ActionRowBuilder().addComponents(enemies),
    new ActionRowBuilder().addComponents(notes)
  );

  await interaction.showModal(modal);
}

// ---------------------------------------------------------------------------
// Modal submit -> validate, claim locks, post the live report + buttons
// ---------------------------------------------------------------------------
async function handleModalSubmit(interaction) {
  if (interaction.customId !== MODAL_ID) return;

  const callerId = interaction.user.id;

  if (state.isBlocked(callerId)) {
    await interaction.reply({
      content: '🚫 You have been blocked from making gank reports.',
      ephemeral: true,
    });
    return;
  }

  if (state.userActiveReport.has(callerId)) {
    await interaction.reply({
      content:
        'You already have an open **gank** report. ' +
        'Please end it before starting a new one.',
      ephemeral: true,
    });
    return;
  }

  if (state.reportActive) {
    await interaction.reply({
      content:
        'There is already an ongoing gank ping. ' +
        'Please wait until it ends before starting a new one.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  const robloxValue  = interaction.fields.getTextInputValue('roblox');
  const linkValue    = interaction.fields.getTextInputValue('link');
  const seenValue    = interaction.fields.getTextInputValue('seen');
  const enemiesValue = interaction.fields.getTextInputValue('enemies');
  const notesValue   = interaction.fields.getTextInputValue('notes');
  const callerName   = `<@${callerId}>`;

  const avatarUrl = await fetchRobloxAvatarHeadshot(robloxValue);

  // Claim locks
  state.userActiveReport.add(callerId);
  state.reportActive  = true;
  state.reportOwnerId = callerId;

  const embed = buildReportEmbed({
    title: config.BRAND_NAME,
    color: Colors.Purple,
    callerName,
    robloxValue,
    linkValue,
    seenValue,
    enemiesValue,
    notesValue,
    avatarUrl,
  });

  const endButton = new ButtonBuilder()
    .setCustomId('end_report')
    .setLabel('End Report')
    .setStyle(ButtonStyle.Danger);

  const clockInButton = new ButtonBuilder()
    .setCustomId('clock_in')
    .setLabel('Clock In ✅')
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder().addComponents(endButton, clockInButton);

  const reportMessage = await interaction.editReply({ embeds: [embed], components: [row] });

  const roleId = config.GANK_ROLE_ID;

  await interaction.followUp({
    content: `<@&${roleId}>`,
    allowedMentions: { roles: [roleId] },
  });

  // Everything needed to close this report, or clock into it, from
  // anywhere (global button routing, or the staff panel) lives here so
  // every path shares one flow. No per-message collector — those die if
  // the process ever restarts, which is what causes buttons to silently
  // stop responding ("application did not respond") after the bot has
  // been running a while and gets redeployed/restarted.
  state.activeReportCtx = {
    reportMessage,
    callerId,
    callerName,
    robloxValue,
    linkValue,
    seenValue,
    enemiesValue,
    notesValue,
    avatarUrl,
    roleId,
    row,
    endButton,
    clockInButton,
    clockedIn: new Set(),
  };
}

// ---------------------------------------------------------------------------
// Global button handler for End Report / Clock In. Called from index.js for
// every button interaction (not routed through a per-message collector, so
// it keeps working across bot restarts — it only depends on state, not on
// an in-memory object created back when the report was opened).
// ---------------------------------------------------------------------------
async function handleReportButton(interaction) {
  const { customId } = interaction;
  if (customId !== 'clock_in' && customId !== 'end_report') return false;

  const ctx = state.activeReportCtx;

  // No active report at all, or this button belongs to a different/stale
  // message (e.g. an old closed report still visible in scrollback).
  if (!ctx || ctx.reportMessage.id !== interaction.message.id) {
    await interaction.reply({
      content: 'This report is no longer active.',
      ephemeral: true,
    });
    return true;
  }

  if (customId === 'clock_in') {
    const userId = interaction.user.id;

    if (ctx.clockedIn.has(userId)) {
      await interaction.reply({
        content: '⚠️ You have already clocked in for this report.',
        ephemeral: true,
      });
      return true;
    }

    ctx.clockedIn.add(userId);
    await interaction.reply({
      content: `✅ <@${userId}> clocked in! (**${ctx.clockedIn.size}** clocked in so far)`,
      allowedMentions: { users: [] },
    });
    return true;
  }

  // end_report
  if (interaction.user.id !== ctx.callerId && !isStaff(interaction.member)) {
    await interaction.reply({
      content: 'You are not authorized to end this report.',
      ephemeral: true,
    });
    return true;
  }

  ctx.endButton.setDisabled(true);
  ctx.clockInButton.setDisabled(true);
  await interaction.update({ components: [ctx.row] });

  await closeReport(ctx);
  return true;
}

/** Staff = has the configured staff role, or Manage Server permission. */
function isStaff(member) {
  if (!member) return false;
  if (config.STAFF_ROLE_ID && member.roles?.cache?.has(config.STAFF_ROLE_ID)) return true;
  return member.permissions?.has?.('ManageGuild') ?? false;
}

// ---------------------------------------------------------------------------
// Finalise a report: edit the embed, award credits, release locks.
// Shared by the normal End Report button and the staff panel.
// ---------------------------------------------------------------------------
async function closeReport(ctx) {
  const {
    callerId,
    callerName,
    robloxValue,
    linkValue,
    seenValue,
    enemiesValue,
    notesValue,
    avatarUrl,
    reportMessage,
    row,
    endButton,
    clockInButton,
    clockedIn,
  } = ctx;

  // Award +1 report credit to the caller and everyone who clocked in
  const recipients = new Set([...clockedIn, callerId]);
  for (const uid of recipients) {
    state.addCredit(uid);
  }

  const creditLines = [...recipients]
    .map((uid) => `<@${uid}>: **${state.reportCredits.get(uid)}** total`)
    .join('\n');

  const endedEmbed = buildReportEmbed({
    title: `${config.BRAND_NAME} — Closed`,
    color: Colors.Red,
    callerName,
    robloxValue,
    linkValue,
    seenValue,
    enemiesValue,
    notesValue,
    avatarUrl,
  });

  endButton.setDisabled(true);
  clockInButton.setDisabled(true);
  await reportMessage.edit({ embeds: [endedEmbed], components: [row] }).catch(() => {});

  await reportMessage.channel
    .send({
      content: `📋 Report closed. Credits awarded:\n${creditLines}`,
      allowedMentions: { users: [] },
    })
    .catch(() => {});

  // Release locks
  state.userActiveReport.delete(callerId);
  if (state.reportOwnerId === callerId) {
    state.reportActive  = false;
    state.reportOwnerId = null;
  }
  state.activeReportCtx = null;
}

module.exports = {
  handleReportCommand,
  handleModalSubmit,
  handleReportButton,
  closeReport,
  isStaff,
  MODAL_ID,
};

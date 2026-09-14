'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Colors,
  AttachmentBuilder,
} = require('discord.js');

const config = require('./config');
const state  = require('./state');
const { isOwner } = require('./report');

const SETTINGS_MODAL_ID       = 'owner_settings_modal';
const GRANT_STAFF_MODAL_ID    = 'owner_grant_staff_modal';
const REVOKE_STAFF_MODAL_ID   = 'owner_revoke_staff_modal';
const SET_CREDITS_MODAL_ID    = 'owner_set_credits_modal';

const startedAt = Date.now();

// ---------------------------------------------------------------------------
// Panel embed + rows
// ---------------------------------------------------------------------------
function buildOwnerPanelEmbed() {
  const uptimeMs = Date.now() - startedAt;
  const uptimeStr = formatDuration(uptimeMs);

  const reportsOn    = state.getFeatureFlag('reportsEnabled');
  const recruitingOn = state.getFeatureFlag('recruitingEnabled');

  return new EmbedBuilder()
    .setTitle(`${config.BRAND_NAME} — Owner Panel`)
    .setColor(Colors.Gold)
    .addFields(
      {
        name: 'Status',
        value:
          `Uptime: **${uptimeStr}**\n` +
          `Reports: ${reportsOn ? '🟢 enabled' : '🔴 disabled'}\n` +
          `Recruiting: ${recruitingOn ? '🟢 enabled' : '🔴 disabled'}\n` +
          `Active report: ${state.activeReportCtx ? `<@${state.activeReportCtx.callerId}>` : 'none'}\n` +
          `Last credit reset (UTC month): **${state.lastResetMonth}**`,
      },
      {
        name: 'Config overrides',
        value:
          `Gank role: <@&${state.getSetting('gankRoleId', config.GANK_ROLE_ID)}>\n` +
          `Recruit forum: <#${state.getSetting('recruitForumId', config.RECRUIT_FORUM_ID)}>`,
      },
      {
        name: 'Staff',
        value: `**${state.staffUserIds.size}** individually-granted staff member(s), on top of the staff role.`,
      }
    )
    .setFooter({ text: config.FOOTER_TEXT, iconURL: config.FOOTER_ICON });
}

function buildOwnerPanelRows() {
  const reportsOn    = state.getFeatureFlag('reportsEnabled');
  const recruitingOn = state.getFeatureFlag('recruitingEnabled');

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('owner_toggle_reports')
      .setLabel(reportsOn ? 'Disable Reports' : 'Enable Reports')
      .setStyle(reportsOn ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('owner_toggle_recruiting')
      .setLabel(recruitingOn ? 'Disable Recruiting' : 'Enable Recruiting')
      .setStyle(recruitingOn ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('owner_edit_settings')
      .setLabel('Edit Role/Channel IDs')
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('owner_grant_staff')
      .setLabel('Grant Staff')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('owner_revoke_staff')
      .setLabel('Revoke Staff')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('owner_set_credits')
      .setLabel('Set User Credits')
      .setStyle(ButtonStyle.Secondary)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('owner_export_data')
      .setLabel('Export Data')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('owner_view_audit_log')
      .setLabel('View Audit Log')
      .setStyle(ButtonStyle.Secondary)
  );

  return [row1, row2, row3];
}

async function handleOwnerPanelCommand(interaction) {
  if (!isOwner(interaction.member)) {
    await interaction.reply({ content: 'Owner only.', ephemeral: true });
    return;
  }

  await interaction.reply({ embeds: [buildOwnerPanelEmbed()], components: buildOwnerPanelRows() });
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
async function handleOwnerButton(interaction) {
  const { customId } = interaction;
  if (!customId.startsWith('owner_')) return false;

  if (!isOwner(interaction.member)) {
    await interaction.reply({ content: 'Owner only.', ephemeral: true });
    return true;
  }

  if (customId === 'owner_toggle_reports') {
    const next = !state.getFeatureFlag('reportsEnabled');
    await state.setFeatureFlag('reportsEnabled', next);
    await state.logOwnerAction(interaction.user.id, 'toggle_reports', `set to ${next}`);
    await refreshPanel(interaction);
    return true;
  }

  if (customId === 'owner_toggle_recruiting') {
    const next = !state.getFeatureFlag('recruitingEnabled');
    await state.setFeatureFlag('recruitingEnabled', next);
    await state.logOwnerAction(interaction.user.id, 'toggle_recruiting', `set to ${next}`);
    await refreshPanel(interaction);
    return true;
  }

  if (customId === 'owner_edit_settings') {
    const modal = new ModalBuilder().setCustomId(SETTINGS_MODAL_ID).setTitle('Edit Role/Channel IDs');

    const gankRoleInput = new TextInputBuilder()
      .setCustomId('gank_role_id')
      .setLabel('Gank role ID (leave blank to keep)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue(String(state.getSetting('gankRoleId', config.GANK_ROLE_ID) || ''));

    const recruitForumInput = new TextInputBuilder()
      .setCustomId('recruit_forum_id')
      .setLabel('Recruit forum channel ID (leave blank)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue(String(state.getSetting('recruitForumId', config.RECRUIT_FORUM_ID) || ''));

    modal.addComponents(
      new ActionRowBuilder().addComponents(gankRoleInput),
      new ActionRowBuilder().addComponents(recruitForumInput)
    );

    await interaction.showModal(modal);
    return true;
  }

  if (customId === 'owner_grant_staff') {
    await interaction.showModal(userIdModal(GRANT_STAFF_MODAL_ID, 'Grant Staff'));
    return true;
  }

  if (customId === 'owner_revoke_staff') {
    await interaction.showModal(userIdModal(REVOKE_STAFF_MODAL_ID, 'Revoke Staff'));
    return true;
  }

  if (customId === 'owner_set_credits') {
    const amountRow = new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('amount')
        .setLabel('New total report credits')
        .setPlaceholder('0')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    );
    await interaction.showModal(userIdModal(SET_CREDITS_MODAL_ID, 'Set User Credits', [amountRow]));
    return true;
  }

  if (customId === 'owner_export_data') {
    const data = state.exportCreditsData();
    const buffer = Buffer.from(JSON.stringify(data, null, 2), 'utf-8');
    const attachment = new AttachmentBuilder(buffer, { name: 'nekoma-export.json' });
    await state.logOwnerAction(interaction.user.id, 'export_data', '');
    await interaction.reply({
      content: '📦 Data export attached.',
      files: [attachment],
      ephemeral: true,
    });
    return true;
  }

  if (customId === 'owner_view_audit_log') {
    const entries = state.getRecentAuditLog(15);
    const lines = entries.length
      ? entries.map((e) => {
          const ts = new Date(e.timestamp).toISOString().replace('T', ' ').slice(0, 19);
          return `\`${ts}\` <@${e.actorId}> **${e.action}**${e.detail ? ` — ${e.detail}` : ''}`;
        })
      : ['No owner actions logged yet.'];

    const embed = new EmbedBuilder()
      .setTitle('Owner Audit Log — last 15 actions')
      .setColor(Colors.Gold)
      .setDescription(lines.join('\n'))
      .setFooter({ text: config.FOOTER_TEXT, iconURL: config.FOOTER_ICON });

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------
async function handleOwnerModal(interaction) {
  const { customId } = interaction;
  const ownedModalIds = [
    SETTINGS_MODAL_ID,
    GRANT_STAFF_MODAL_ID,
    REVOKE_STAFF_MODAL_ID,
    SET_CREDITS_MODAL_ID,
  ];
  if (!ownedModalIds.includes(customId)) return false;

  if (!isOwner(interaction.member)) {
    await interaction.reply({ content: 'Owner only.', ephemeral: true });
    return true;
  }

  if (customId === SETTINGS_MODAL_ID) {
    const gankRoleId     = interaction.fields.getTextInputValue('gank_role_id').trim();
    const recruitForumId = interaction.fields.getTextInputValue('recruit_forum_id').trim();

    const changes = [];
    if (gankRoleId && /^\d{15,25}$/.test(gankRoleId)) {
      await state.setSetting('gankRoleId', gankRoleId);
      changes.push(`gank role → <@&${gankRoleId}>`);
    }
    if (recruitForumId && /^\d{15,25}$/.test(recruitForumId)) {
      await state.setSetting('recruitForumId', recruitForumId);
      changes.push(`recruit forum → <#${recruitForumId}>`);
    }

    if (changes.length === 0) {
      await interaction.reply({ content: 'No valid IDs were provided — nothing changed.', ephemeral: true });
      return true;
    }

    await state.logOwnerAction(interaction.user.id, 'edit_settings', changes.join('; '));
    await interaction.reply({ content: `✅ Updated: ${changes.join(', ')}`, ephemeral: true });
    return true;
  }

  const userId = parseUserId(interaction.fields.getTextInputValue('user_id'));
  if (!userId) {
    await interaction.reply({
      content: "That doesn't look like a valid user ID or mention.",
      ephemeral: true,
    });
    return true;
  }

  if (customId === GRANT_STAFF_MODAL_ID) {
    const wasNew = await state.grantStaff(userId);
    await state.logOwnerAction(interaction.user.id, 'grant_staff', `target ${userId}, new: ${wasNew}`);
    await interaction.reply({
      content: wasNew
        ? `✅ <@${userId}> was granted staff access.`
        : `<@${userId}> already has granted staff access.`,
      ephemeral: true,
    });
    return true;
  }

  if (customId === REVOKE_STAFF_MODAL_ID) {
    const wasGranted = await state.revokeStaff(userId);
    await state.logOwnerAction(interaction.user.id, 'revoke_staff', `target ${userId}, was granted: ${wasGranted}`);
    await interaction.reply({
      content: wasGranted
        ? `✅ Revoked <@${userId}>'s granted staff access.`
        : `<@${userId}> did not have individually-granted staff access.`,
      ephemeral: true,
    });
    return true;
  }

  // SET_CREDITS_MODAL_ID
  const rawAmount = interaction.fields.getTextInputValue('amount').trim();
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount) || amount < 0 || !Number.isInteger(amount)) {
    await interaction.reply({
      content: 'Amount must be a whole number of 0 or more.',
      ephemeral: true,
    });
    return true;
  }

  const before = state.reportCredits.get(userId) || 0;
  const after = await state.setCredits(userId, amount);
  await state.logOwnerAction(interaction.user.id, 'set_credits', `target ${userId}, ${before} -> ${after}`);
  await interaction.reply({
    content: `✅ Set <@${userId}>'s report credits: **${before}** → **${after}**.`,
    ephemeral: true,
  });
  return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Re-render the panel message in place after a state change. */
async function refreshPanel(interaction) {
  await interaction
    .update({ embeds: [buildOwnerPanelEmbed()], components: buildOwnerPanelRows() })
    .catch(() => {});
}

/** Pull a clean numeric user ID out of a raw "123456" or "<@123456>" string. */
function parseUserId(raw) {
  const userId = raw.trim().replace(/[<@!>]/g, '');
  return /^\d{15,25}$/.test(userId) ? userId : null;
}

function userIdModal(customId, title, extraFields = []) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
  const userInput = new TextInputBuilder()
    .setCustomId('user_id')
    .setLabel('User ID or @mention')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(userInput), ...extraFields);
  return modal;
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const days    = Math.floor(totalSeconds / 86400);
  const hours   = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

module.exports = {
  handleOwnerPanelCommand,
  handleOwnerButton,
  handleOwnerModal,
};

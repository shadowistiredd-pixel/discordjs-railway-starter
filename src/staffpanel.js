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
} = require('discord.js');

const config = require('./config');
const state  = require('./state');
const { closeReport, isStaff } = require('./report');

const DEDUCT_MODAL_ID  = 'staff_deduct_modal';
const BLOCK_MODAL_ID   = 'staff_block_modal';
const UNBLOCK_MODAL_ID = 'staff_unblock_modal';

function buildPanelEmbed() {
  const active = state.activeReportCtx;
  return new EmbedBuilder()
    .setTitle(`${config.BRAND_NAME} — Staff Panel`)
    .setColor(Colors.Blurple)
    .setDescription(
      active
        ? `🟢 Active report by <@${active.callerId}> (Roblox: **${active.robloxValue}**)`
        : '⚪ No report is currently active.'
    )
    .addFields(
      {
        name: 'Credits board',
        value: `**${state.reportCredits.size}** user(s) tracked. Resets monthly.`,
      },
      {
        name: 'Blocked users',
        value: `**${state.blockedUsers.size}** user(s) currently blocked from reporting.`,
      }
    )
    .setFooter({ text: config.FOOTER_TEXT, iconURL: config.FOOTER_ICON });
}

function buildPanelRows() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('staff_end_report')
      .setLabel('End Active Report')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!state.activeReportCtx),
    new ButtonBuilder()
      .setCustomId('staff_deduct_user')
      .setLabel('Deduct Credits (user)')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('staff_reset_all')
      .setLabel('Reset Entire Board')
      .setStyle(ButtonStyle.Danger)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('staff_block_user')
      .setLabel('Block User')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('staff_unblock_user')
      .setLabel('Unblock User')
      .setStyle(ButtonStyle.Success)
  );

  return [row1, row2];
}

async function handleStaffPanelCommand(interaction) {
  if (!isStaff(interaction.member)) {
    await interaction.reply({ content: 'Staff only.', ephemeral: true });
    return;
  }

  await interaction.reply({ embeds: [buildPanelEmbed()], components: buildPanelRows() });
}

/** Re-render the panel message in place, e.g. after a state change. */
async function refreshPanel(interaction) {
  await interaction
    .update({ embeds: [buildPanelEmbed()], components: buildPanelRows() })
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

async function handleStaffButton(interaction) {
  const { customId } = interaction;
  if (!customId.startsWith('staff_')) return false;

  if (!isStaff(interaction.member)) {
    await interaction.reply({ content: 'Staff only.', ephemeral: true });
    return true;
  }

  if (customId === 'staff_end_report') {
    const active = state.activeReportCtx;
    if (!active) {
      await interaction.reply({ content: 'There is no active report to end.', ephemeral: true });
      return true;
    }
    await closeReport(active);
    await interaction.reply({ content: '✅ Report ended by staff.', ephemeral: true });
    return true;
  }

  if (customId === 'staff_deduct_user') {
    const amountRow = new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('amount')
        .setLabel('Points to deduct')
        .setPlaceholder('1')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    );
    await interaction.showModal(userIdModal(DEDUCT_MODAL_ID, 'Deduct Credits', [amountRow]));
    return true;
  }

  if (customId === 'staff_block_user') {
    await interaction.showModal(userIdModal(BLOCK_MODAL_ID, 'Block User'));
    return true;
  }

  if (customId === 'staff_unblock_user') {
    await interaction.showModal(userIdModal(UNBLOCK_MODAL_ID, 'Unblock User'));
    return true;
  }

  if (customId === 'staff_reset_all') {
    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('staff_reset_all_confirm')
        .setLabel('Confirm: wipe entire board')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('staff_reset_all_cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );
    await interaction.reply({
      content: `⚠️ This will reset **${state.reportCredits.size}** user(s) to 0 credits. Are you sure?`,
      components: [confirmRow],
      ephemeral: true,
    });
    return true;
  }

  if (customId === 'staff_reset_all_confirm') {
    const count = state.resetAllCredits();
    await interaction.update({
      content: `✅ Board reset — cleared **${count}** user(s).`,
      components: [],
    });
    return true;
  }

  if (customId === 'staff_reset_all_cancel') {
    await interaction.update({ content: 'Cancelled — no changes made.', components: [] });
    return true;
  }

  return false;
}

async function handleStaffModal(interaction) {
  const { customId } = interaction;
  if (![DEDUCT_MODAL_ID, BLOCK_MODAL_ID, UNBLOCK_MODAL_ID].includes(customId)) return false;

  if (!isStaff(interaction.member)) {
    await interaction.reply({ content: 'Staff only.', ephemeral: true });
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

  if (customId === DEDUCT_MODAL_ID) {
    const rawAmount = interaction.fields.getTextInputValue('amount').trim();
    const amount = Number(rawAmount);

    if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
      await interaction.reply({
        content: 'Amount must be a whole number greater than 0.',
        ephemeral: true,
      });
      return true;
    }

    const before = state.reportCredits.get(userId) || 0;
    const after = state.deductCredits(userId, amount);
    await interaction.reply({
      content: `✅ Deducted **${before - after}** credit(s) from <@${userId}> (**${before}** → **${after}**).`,
      ephemeral: true,
    });
    return true;
  }

  if (customId === BLOCK_MODAL_ID) {
    const wasNew = state.blockUser(userId);
    await interaction.reply({
      content: wasNew
        ? `🚫 <@${userId}> is now blocked from making gank reports.`
        : `<@${userId}> was already blocked.`,
      ephemeral: true,
    });
    return true;
  }

  // UNBLOCK_MODAL_ID
  const wasBlocked = state.unblockUser(userId);
  await interaction.reply({
    content: wasBlocked
      ? `✅ <@${userId}> can make gank reports again.`
      : `<@${userId}> wasn't blocked.`,
    ephemeral: true,
  });
  return true;
}

module.exports = { handleStaffPanelCommand, handleStaffButton, handleStaffModal, refreshPanel };

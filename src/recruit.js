'use strict';

const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Colors,
} = require('discord.js');

const config = require('./config');
const state  = require('./state');

const MODAL_ID        = 'nek_recruit_modal';
const CLOSE_BUTTON_ID = 'recruit_close';

// ---------------------------------------------------------------------------
// Roblox avatar-headshot lookup
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
// Build the recruit modal, pre-filled from draft if one exists
// ---------------------------------------------------------------------------
function buildRecruitModal(draft = {}) {
  const modal = new ModalBuilder()
    .setCustomId(MODAL_ID)
    .setTitle('New Recruit — Nekoma');

  const recruiterInput = new TextInputBuilder()
    .setCustomId('recruiter')
    .setLabel('Your Name (Recruiter)')
    .setPlaceholder('ex: VioletIsTiredd')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100);
  if (draft.recruiter) recruiterInput.setValue(draft.recruiter);

  const discordInput = new TextInputBuilder()
    .setCustomId('discord')
    .setLabel('Recruit Discord @mention or ID')
    .setPlaceholder('ex: @username or 123456789012345678')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100);
  if (draft.discord) discordInput.setValue(draft.discord);

  const robloxInput = new TextInputBuilder()
    .setCustomId('roblox')
    .setLabel('Recruit Roblox Username')
    .setPlaceholder('ex: desiredworvzy')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(200);
  if (draft.roblox) robloxInput.setValue(draft.roblox);

  modal.addComponents(
    new ActionRowBuilder().addComponents(recruiterInput),
    new ActionRowBuilder().addComponents(discordInput),
    new ActionRowBuilder().addComponents(robloxInput),
  );

  return modal;
}

// ---------------------------------------------------------------------------
// "New Recruit" button click — load draft, show modal
// ---------------------------------------------------------------------------
async function handleRecruitButton(interaction) {
  const { customId } = interaction;

  if (customId === 'recruit_new') {
    const draft = state.recruitDrafts.get(interaction.user.id) || {};
    await interaction.showModal(buildRecruitModal(draft));
    return true;
  }

  if (customId === CLOSE_BUTTON_ID) {
    await handleCloseButton(interaction);
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Modal submit
// ---------------------------------------------------------------------------
async function handleRecruitModal(interaction) {
  if (interaction.customId !== MODAL_ID) return false;

  const callerId  = interaction.user.id;
  const recruiter = interaction.fields.getTextInputValue('recruiter').trim();
  const discord   = interaction.fields.getTextInputValue('discord').trim();
  const roblox    = interaction.fields.getTextInputValue('roblox').trim();

  // Save draft — cleared on success below
  state.recruitDrafts.set(callerId, { recruiter, discord, roblox });

  await interaction.deferReply({ ephemeral: true });

  const avatarUrl = await fetchRobloxAvatarHeadshot(roblox);

  // Fetch the forum channel
  let forumChannel;
  try {
    forumChannel = await interaction.client.channels.fetch(config.RECRUIT_FORUM_ID);
  } catch {
    await interaction.editReply({
      content: '❌ Could not find the recruit forum channel. Contact an admin.',
    });
    return true;
  }

  if (!forumChannel || forumChannel.type !== 15 /* ChannelType.GuildForum */) {
    await interaction.editReply({
      content: '❌ The configured recruit channel is not a Forum channel.',
    });
    return true;
  }

  const embed = buildRecruitEmbed({ recruiter, callerId, discord, roblox, avatarUrl });

  const closeButton = new ButtonBuilder()
    .setCustomId(CLOSE_BUTTON_ID)
    .setLabel('Close Thread')
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(closeButton);

  // ── Check if this recruiter already has an open thread ──────────────────
  const existingThreadId = state.getRecruiterThread(callerId);
  let thread = null;

  if (existingThreadId) {
    try {
      thread = await interaction.client.channels.fetch(existingThreadId);

      // If the thread was manually deleted or archived+locked, treat it as gone
      if (!thread || thread.archived) {
        thread = null;
        await state.clearRecruiterThread(callerId);
      }
    } catch {
      // Channel fetch failed (deleted) — start fresh
      thread = null;
      await state.clearRecruiterThread(callerId);
    }
  }

  if (thread) {
    // Post a new recruit entry inside the existing thread
    try {
      await thread.send({ embeds: [embed], components: [row] });
    } catch (err) {
      console.error('[RECRUIT] Failed to post in existing thread:', err);
      await interaction.editReply({
        content: '❌ Failed to post in your existing recruit thread. It may have been deleted or locked.',
      });
      return true;
    }
  } else {
    // Create a new thread and persist the mapping
    try {
      thread = await forumChannel.threads.create({
        name: `📋 Recruits — ${recruiter}`,
        message: { embeds: [embed], components: [row] },
      });
      await state.setRecruiterThread(callerId, thread.id);
    } catch (err) {
      console.error('[RECRUIT] Failed to create forum thread:', err);
      await interaction.editReply({
        content: '❌ Failed to create your recruit thread. Make sure I have permission to post in that channel.',
      });
      return true;
    }
  }

  // Award recruit credit
  await state.addRecruitCredit(callerId);
  const total = state.recruitCredits.get(callerId) || 0;

  // Clear the draft on success
  state.recruitDrafts.delete(callerId);

  const isNew = !existingThreadId || !thread;
  await interaction.editReply({
    content:
      `✅ Recruit logged! ${isNew ? 'New thread created.' : 'Added to your existing recruit thread.'}\n` +
      `You now have **${total}** recruit credit${total !== 1 ? 's' : ''}.`,
  });

  return true;
}

// ---------------------------------------------------------------------------
// Close Thread button — only the recruiter who owns the thread can close it.
// Locks + archives the thread and clears the persisted mapping so a new
// thread is created on the recruiter's next submission.
// ---------------------------------------------------------------------------
async function handleCloseButton(interaction) {
  const threadId = interaction.channel?.id;

  // Look up which recruiter owns this thread
  let ownerId = null;
  for (const [userId, tid] of state.recruiterThreads.entries()) {
    if (tid === threadId) { ownerId = userId; break; }
  }

  if (!ownerId) {
    await interaction.reply({
      content: 'This thread is already closed or was not recognised.',
      ephemeral: true,
    });
    return;
  }

  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: '❌ Only the recruiter who owns this thread can close it.',
      ephemeral: true,
    });
    return;
  }

  // Disable the button on the message that was clicked
  const disabledButton = new ButtonBuilder()
    .setCustomId(CLOSE_BUTTON_ID)
    .setLabel('Closed')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  await interaction.update({ components: [new ActionRowBuilder().addComponents(disabledButton)] }).catch(() => {});

  // Lock + archive the thread
  try {
    await interaction.channel.setLocked(true);
    await interaction.channel.setArchived(true);
  } catch (err) {
    console.error('[RECRUIT] Failed to lock/archive thread:', err);
  }

  // Clear the mapping — next recruit from this user will get a fresh thread
  await state.clearRecruiterThread(ownerId);
}

// ---------------------------------------------------------------------------
// Embed builder
// ---------------------------------------------------------------------------
function buildRecruitEmbed({ recruiter, callerId, discord, roblox, avatarUrl }) {
  const embed = new EmbedBuilder()
    .setTitle('Nek:// Nekoma — New Recruit')
    .setColor(Colors.Green)
    .setFooter({ text: config.FOOTER_TEXT, iconURL: config.FOOTER_ICON })
    .addFields(
      { name: 'RECRUITER', value: `${recruiter} (<@${callerId}>)`, inline: false },
      { name: 'RECRUIT DISCORD', value: discord, inline: false },
      { name: 'RECRUIT ROBLOX', value: roblox, inline: false },
    );

  if (avatarUrl) embed.setThumbnail(avatarUrl);

  return embed;
}

module.exports = {
  handleRecruitButton,
  handleRecruitModal,
  MODAL_ID,
};

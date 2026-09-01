'use strict';

const { createCanvas, loadImage } = require('canvas');
const { AttachmentBuilder }       = require('discord.js');
const state = require('./state');

// ── Layout constants ──────────────────────────────────────────────────────────
const W          = 700;
const H          = 340;
const PADDING    = 36;
const ROW_H      = 72;
const AVATAR_R   = 28;   // radius of the circular avatar
const START_Y    = 120;  // y of the first row centre

const RANK_COLORS  = ['#FFD700', '#C0C0C0', '#CD7F32']; // gold / silver / bronze
const RANK_LABELS  = ['🥇', '🥈', '🥉'];
const BG_COLOR     = '#1e1f22';
const CARD_COLOR   = '#2b2d31';
const TEXT_PRIMARY = '#ffffff';
const TEXT_MUTED   = '#b5bac1';
const ACCENT       = '#9b59b6'; // purple, matches the report embed colour

/**
 * Fetch a user's Discord avatar as an Image object (canvas).
 * Returns null on failure — we'll draw a coloured circle instead.
 */
async function fetchAvatarImage(user) {
  try {
    const url = user.displayAvatarURL({ extension: 'png', size: 64, forceStatic: true });
    return await loadImage(url);
  } catch {
    return null;
  }
}

/**
 * Draw a clipped circular avatar (or a fallback circle) on `ctx`.
 */
function drawAvatar(ctx, img, cx, cy, radius, fallbackColor) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  if (img) {
    ctx.drawImage(img, cx - radius, cy - radius, radius * 2, radius * 2);
  } else {
    ctx.fillStyle = fallbackColor;
    ctx.fill();
  }

  ctx.restore();

  // Coloured ring
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
  ctx.strokeStyle = fallbackColor;
  ctx.lineWidth   = 2.5;
  ctx.stroke();
  ctx.restore();
}

/**
 * Build the leaderboard canvas and return a Discord AttachmentBuilder.
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<AttachmentBuilder>}
 */
async function buildLeaderboardAttachment(guild) {
  const top = state.getTopCredits(3);

  // Resolve Discord users for each entry
  const entries = await Promise.all(
    top.map(async ({ userId, credits }) => {
      let user  = null;
      let tag   = 'Unknown User';
      let img   = null;

      try {
        user = await guild.client.users.fetch(userId);
        tag  = user.displayName || user.username;
        img  = await fetchAvatarImage(user);
      } catch { /* user may have left the server */ }

      return { userId, credits, tag, img };
    })
  );

  // ── Canvas setup ──────────────────────────────────────────────────────────
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // Background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, W, H);

  // Top accent bar
  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, 0, W, 5);

  // Title
  ctx.fillStyle = TEXT_PRIMARY;
  ctx.font      = 'bold 28px Sans';
  ctx.textAlign = 'center';
  ctx.fillText('📋  Report Leaderboard', W / 2, 56);

  ctx.fillStyle = TEXT_MUTED;
  ctx.font      = '15px Sans';
  ctx.fillText('Top 3 callers by lifetime report credits', W / 2, 82);

  // ── Rows ──────────────────────────────────────────────────────────────────
  if (entries.length === 0) {
    ctx.fillStyle = TEXT_MUTED;
    ctx.font      = '18px Sans';
    ctx.textAlign = 'center';
    ctx.fillText('No reports on record yet.', W / 2, START_Y + ROW_H);
  }

  entries.forEach(({ tag, credits, img }, i) => {
    const rowY  = START_Y + i * (ROW_H + 12);
    const rankC = RANK_COLORS[i];

    // Card background
    const cardX = PADDING;
    const cardW = W - PADDING * 2;
    ctx.fillStyle = CARD_COLOR;
    roundRect(ctx, cardX, rowY, cardW, ROW_H, 10);
    ctx.fill();

    // Left rank stripe
    ctx.fillStyle = rankC;
    roundRectLeft(ctx, cardX, rowY, 6, ROW_H, 10);
    ctx.fill();

    const cx = cardX + 44;         // avatar centre x
    const cy = rowY + ROW_H / 2;   // avatar centre y

    // Avatar
    drawAvatar(ctx, img, cx, cy, AVATAR_R, rankC);

    // Rank emoji
    ctx.font      = '22px Sans';
    ctx.textAlign = 'left';
    ctx.fillStyle = rankC;
    ctx.fillText(RANK_LABELS[i], cardX + 80, cy + 8);

    // Username
    ctx.font      = 'bold 18px Sans';
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.fillText(truncate(tag, 22), cardX + 116, cy - 6);

    // Credits
    ctx.font      = '14px Sans';
    ctx.fillStyle = TEXT_MUTED;
    ctx.fillText(`${credits} report credit${credits !== 1 ? 's' : ''}`, cardX + 116, cy + 14);

    // Credit number (right side)
    ctx.font      = 'bold 28px Sans';
    ctx.fillStyle = rankC;
    ctx.textAlign = 'right';
    ctx.fillText(String(credits), cardX + cardW - 20, cy + 10);
  });

  // Footer
  ctx.fillStyle = TEXT_MUTED;
  ctx.font      = '12px Sans';
  ctx.textAlign = 'center';
  ctx.fillText('Nek:// Nekoma Report System', W / 2, H - 12);

  const buffer = canvas.toBuffer('image/png');
  return new AttachmentBuilder(buffer, { name: 'leaderboard.png' });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

/** Full rounded rectangle (all corners). */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Left-side only rounded rectangle (for the rank stripe). */
function roundRectLeft(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

module.exports = { buildLeaderboardAttachment };

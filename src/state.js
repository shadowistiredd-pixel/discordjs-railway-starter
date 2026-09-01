'use strict';

const fs   = require('fs');
const path = require('path');

const CREDITS_FILE = path.join(__dirname, 'report_credits.json');
const META_FILE     = path.join(__dirname, 'report_credits_meta.json');
const BLOCKED_FILE  = path.join(__dirname, 'blocked_users.json');

/** Load credits from disk (returns a plain object keyed by userId). */
function loadCredits() {
  try {
    return JSON.parse(fs.readFileSync(CREDITS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

/** Load the "last reset" bookkeeping (which YYYY-MM the board was last cleared for). */
function loadMeta() {
  try {
    return JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  } catch {
    return { lastResetMonth: currentMonthKey() };
  }
}

/** Load blocked user IDs from disk (returns an array). */
function loadBlocked() {
  try {
    return JSON.parse(fs.readFileSync(BLOCKED_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Persist credits to disk synchronously (file is tiny, writes are rare). */
function saveCredits() {
  const obj = Object.fromEntries(module.exports.reportCredits);
  fs.writeFileSync(CREDITS_FILE, JSON.stringify(obj, null, 2), 'utf8');
}

function saveMeta() {
  fs.writeFileSync(
    META_FILE,
    JSON.stringify({ lastResetMonth: module.exports.lastResetMonth }, null, 2),
    'utf8'
  );
}

function saveBlocked() {
  fs.writeFileSync(
    BLOCKED_FILE,
    JSON.stringify([...module.exports.blockedUsers], null, 2),
    'utf8'
  );
}

/**
 * Increment a user's report-credit counter by 1 and persist it.
 * @param {string} userId
 */
function addCredit(userId) {
  const map = module.exports.reportCredits;
  map.set(userId, (map.get(userId) || 0) + 1);
  saveCredits();
}

/**
 * Subtract `amount` credits from a single user (floored at 0) and persist.
 * @param {string} userId
 * @param {number} amount
 * @returns {number} the user's new credit total
 */
function deductCredits(userId, amount) {
  const map = module.exports.reportCredits;
  const next = Math.max(0, (map.get(userId) || 0) - amount);
  if (next === 0) {
    map.delete(userId);
  } else {
    map.set(userId, next);
  }
  saveCredits();
  return next;
}

/**
 * Reset a single user's credits to 0 (removes them from the board).
 * @param {string} userId
 * @returns {boolean} true if the user had an entry to clear
 */
function resetUserCredits(userId) {
  const map = module.exports.reportCredits;
  const had = map.delete(userId);
  if (had) saveCredits();
  return had;
}

/** Wipe every user's credits. Returns how many entries were cleared. */
function resetAllCredits() {
  const map = module.exports.reportCredits;
  const count = map.size;
  map.clear();
  saveCredits();
  return count;
}

/**
 * If the calendar month has rolled over since the last reset, wipe the
 * board and record the new month. Safe to call as often as you like
 * (e.g. on an hourly timer) — it's a no-op within the same month.
 * @returns {boolean} true if a reset happened
 */
function resetIfNewMonth() {
  const nowKey = currentMonthKey();
  if (module.exports.lastResetMonth === nowKey) return false;

  resetAllCredits();
  module.exports.lastResetMonth = nowKey;
  saveMeta();
  return true;
}

/**
 * Return the top-N users sorted by credits descending.
 * @param {number} [n=3]
 * @returns {{ userId: string, credits: number }[]}
 */
function getTopCredits(n = 3) {
  return [...module.exports.reportCredits.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([userId, credits]) => ({ userId, credits }));
}

/**
 * Block a user from opening new reports.
 * @param {string} userId
 * @returns {boolean} false if they were already blocked
 */
function blockUser(userId) {
  const set = module.exports.blockedUsers;
  if (set.has(userId)) return false;
  set.add(userId);
  saveBlocked();
  return true;
}

/**
 * Unblock a user.
 * @param {string} userId
 * @returns {boolean} false if they weren't blocked
 */
function unblockUser(userId) {
  const set = module.exports.blockedUsers;
  if (!set.has(userId)) return false;
  set.delete(userId);
  saveBlocked();
  return true;
}

/** @param {string} userId */
function isBlocked(userId) {
  return module.exports.blockedUsers.has(userId);
}

module.exports = {
  reportActive:   false,
  reportOwnerId:  null,

  /** Set<userId> — users who currently have an open gank report */
  userActiveReport: new Set(),

  /**
   * Everything needed to close the currently-open report from anywhere
   * (the normal End Report button, or the staff panel). Null when no
   * report is open.
   */
  activeReportCtx: null,

  /** Map<userId, number> — lifetime report credits */
  reportCredits: new Map(Object.entries(loadCredits())),

  /** YYYY-MM the board was last cleared for */
  lastResetMonth: loadMeta().lastResetMonth,

  /** Set<userId> — users blocked from opening new reports */
  blockedUsers: new Set(loadBlocked()),

  addCredit,
  deductCredits,
  resetUserCredits,
  resetAllCredits,
  resetIfNewMonth,
  getTopCredits,
  blockUser,
  unblockUser,
  isBlocked,
};

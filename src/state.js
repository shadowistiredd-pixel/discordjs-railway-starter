'use strict';

const { MongoClient } = require('mongodb');

// ─────────────────────────────────────────────────────────────────────────────
//  MongoDB connection
//  Set MONGODB_URI in Railway's Variables tab.
//  Format: mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<dbname>
// ─────────────────────────────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) throw new Error('Missing MONGODB_URI environment variable.');

const mongo  = new MongoClient(MONGODB_URI);
let db       = null;

// Collection references (set after connect)
let colCredits = null;
let colMeta    = null;
let colBlocked = null;

/**
 * Connect to MongoDB and load all persisted state into memory.
 * Call this once before starting the bot (awaited in index.js).
 */
async function connect() {
  await mongo.connect();
  db         = mongo.db('nekoma');
  colCredits = db.collection('credits');
  colMeta    = db.collection('meta');
  colBlocked = db.collection('blocked');

  // Load credits into in-memory map
  const creditDocs = await colCredits.find({}).toArray();
  for (const doc of creditDocs) {
    module.exports.reportCredits.set(doc.userId, doc.credits);
  }

  // Load meta
  const metaDoc = await colMeta.findOne({ _id: 'meta' });
  if (metaDoc) module.exports.lastResetMonth = metaDoc.lastResetMonth;

  // Load blocked users
  const blockedDocs = await colBlocked.find({}).toArray();
  for (const doc of blockedDocs) {
    module.exports.blockedUsers.add(doc.userId);
  }

  console.log('[DB] Connected to MongoDB and state loaded.');
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────
function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function saveCredit(userId, credits) {
  if (credits <= 0) {
    await colCredits.deleteOne({ userId });
  } else {
    await colCredits.updateOne(
      { userId },
      { $set: { userId, credits } },
      { upsert: true }
    );
  }
}

async function saveMeta() {
  await colMeta.updateOne(
    { _id: 'meta' },
    { $set: { lastResetMonth: module.exports.lastResetMonth } },
    { upsert: true }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Public API  (mirrors the original state.js exactly)
// ─────────────────────────────────────────────────────────────────────────────

async function addCredit(userId) {
  const map  = module.exports.reportCredits;
  const next = (map.get(userId) || 0) + 1;
  map.set(userId, next);
  await saveCredit(userId, next);
}

async function deductCredits(userId, amount) {
  const map  = module.exports.reportCredits;
  const next = Math.max(0, (map.get(userId) || 0) - amount);
  if (next === 0) map.delete(userId); else map.set(userId, next);
  await saveCredit(userId, next);
  return next;
}

async function resetUserCredits(userId) {
  const map = module.exports.reportCredits;
  const had = map.delete(userId);
  if (had) await colCredits.deleteOne({ userId });
  return had;
}

async function resetAllCredits() {
  const map   = module.exports.reportCredits;
  const count = map.size;
  map.clear();
  await colCredits.deleteMany({});
  return count;
}

async function resetIfNewMonth() {
  const nowKey = currentMonthKey();
  if (module.exports.lastResetMonth === nowKey) return false;

  await resetAllCredits();
  module.exports.lastResetMonth = nowKey;
  await saveMeta();
  return true;
}

function getTopCredits(n = 3) {
  return [...module.exports.reportCredits.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([userId, credits]) => ({ userId, credits }));
}

async function blockUser(userId) {
  const set = module.exports.blockedUsers;
  if (set.has(userId)) return false;
  set.add(userId);
  await colBlocked.updateOne({ userId }, { $set: { userId } }, { upsert: true });
  return true;
}

async function unblockUser(userId) {
  const set = module.exports.blockedUsers;
  if (!set.has(userId)) return false;
  set.delete(userId);
  await colBlocked.deleteOne({ userId });
  return true;
}

function isBlocked(userId) {
  return module.exports.blockedUsers.has(userId);
}

module.exports = {
  // Runtime-only state (never persisted)
  reportActive:     false,
  reportOwnerId:    null,
  userActiveReport: new Set(),
  activeReportCtx:  null,

  // Persisted state (loaded from MongoDB on connect())
  reportCredits:  new Map(),
  lastResetMonth: currentMonthKey(),
  blockedUsers:   new Set(),

  // DB
  connect,

  // API
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

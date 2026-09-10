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
let colCredits         = null;
let colMeta            = null;
let colBlocked         = null;
let colRecruitCredits  = null;
let colRecruiterThreads = null;

/**
 * Connect to MongoDB and load all persisted state into memory.
 * Call this once before starting the bot (awaited in index.js).
 */
async function connect() {
  await mongo.connect();
  db                   = mongo.db('nekoma');
  colCredits           = db.collection('credits');
  colMeta              = db.collection('meta');
  colBlocked           = db.collection('blocked');
  colRecruitCredits    = db.collection('recruitCredits');
  colRecruiterThreads  = db.collection('recruiterThreads');

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

  // Load recruit credits into in-memory map
  const recruitDocs = await colRecruitCredits.find({}).toArray();
  for (const doc of recruitDocs) {
    module.exports.recruitCredits.set(doc.userId, doc.credits);
  }

  // Load recruiter -> threadId mappings
  const threadDocs = await colRecruiterThreads.find({}).toArray();
  for (const doc of threadDocs) {
    module.exports.recruiterThreads.set(doc.userId, doc.threadId);
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

async function saveRecruitCredit(userId, credits) {
  if (credits <= 0) {
    await colRecruitCredits.deleteOne({ userId });
  } else {
    await colRecruitCredits.updateOne(
      { userId },
      { $set: { userId, credits } },
      { upsert: true }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Public API — Report credits
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

// ─────────────────────────────────────────────────────────────────────────────
//  Public API — Recruit credits
// ─────────────────────────────────────────────────────────────────────────────

async function addRecruitCredit(userId) {
  const map  = module.exports.recruitCredits;
  const next = (map.get(userId) || 0) + 1;
  map.set(userId, next);
  await saveRecruitCredit(userId, next);
}

async function deductRecruitCredits(userId, amount) {
  const map  = module.exports.recruitCredits;
  const next = Math.max(0, (map.get(userId) || 0) - amount);
  if (next === 0) map.delete(userId); else map.set(userId, next);
  await saveRecruitCredit(userId, next);
  return next;
}

async function resetUserRecruitCredits(userId) {
  const map = module.exports.recruitCredits;
  const had = map.delete(userId);
  if (had) await colRecruitCredits.deleteOne({ userId });
  return had;
}

async function resetAllRecruitCredits() {
  const map   = module.exports.recruitCredits;
  const count = map.size;
  map.clear();
  await colRecruitCredits.deleteMany({});
  return count;
}

function getTopRecruitCredits(n = 3) {
  return [...module.exports.recruitCredits.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([userId, credits]) => ({ userId, credits }));
}

// ─────────────────────────────────────────────────────────────────────────────
//  Public API — Recruiter threads (one persistent thread per recruiter)
// ─────────────────────────────────────────────────────────────────────────────

async function setRecruiterThread(userId, threadId) {
  module.exports.recruiterThreads.set(userId, threadId);
  await colRecruiterThreads.updateOne(
    { userId },
    { $set: { userId, threadId } },
    { upsert: true }
  );
}

async function clearRecruiterThread(userId) {
  module.exports.recruiterThreads.delete(userId);
  await colRecruiterThreads.deleteOne({ userId });
}

function getRecruiterThread(userId) {
  return module.exports.recruiterThreads.get(userId) || null;
}

module.exports = {
  // Runtime-only state (never persisted)
  reportActive:     false,
  reportOwnerId:    null,
  userActiveReport: new Set(),
  activeReportCtx:  null,

  // Recruit runtime state (never persisted)
  recruitDrafts:  new Map(),  // userId -> { recruiter, discord, roblox }

  // Persisted state (loaded from MongoDB on connect())
  reportCredits:    new Map(),
  lastResetMonth:   currentMonthKey(),
  blockedUsers:     new Set(),
  recruitCredits:   new Map(),
  recruiterThreads: new Map(), // userId -> threadId

  // DB
  connect,

  // Report API
  addCredit,
  deductCredits,
  resetUserCredits,
  resetAllCredits,
  resetIfNewMonth,
  getTopCredits,
  blockUser,
  unblockUser,
  isBlocked,

  // Recruit credit API
  addRecruitCredit,
  deductRecruitCredits,
  resetUserRecruitCredits,
  resetAllRecruitCredits,
  getTopRecruitCredits,

  // Recruiter thread API
  setRecruiterThread,
  clearRecruiterThread,
  getRecruiterThread,
};

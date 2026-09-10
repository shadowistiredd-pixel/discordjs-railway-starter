// ─────────────────────────────────────────────────────────────────────────────
// ADD TO state.js
// ─────────────────────────────────────────────────────────────────────────────
//
// 1. In connect(), after colBlocked is set, add:
//
//    colRecruitCredits = db.collection('recruitCredits');
//
//    const recruitDocs = await colRecruitCredits.find({}).toArray();
//    for (const doc of recruitDocs) {
//      module.exports.recruitCredits.set(doc.userId, doc.credits);
//    }
//
// ─────────────────────────────────────────────────────────────────────────────
//
// 2. After the existing `let colBlocked = null;` line, add:
//
//    let colRecruitCredits = null;
//
// ─────────────────────────────────────────────────────────────────────────────
//
// 3. Add these helpers after the existing saveCredit / saveMeta helpers:

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
//
// 4. Add these public API functions before module.exports:

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
//
// 5. In module.exports, add these new entries:
//
//   // Recruit state (runtime-only)
//   recruitDrafts:   new Map(),   // userId -> { recruiter, discord, roblox }
//   activeRecruits:  new Map(),   // threadId -> { callerId, recruiter, ... }
//
//   // Recruit credits (persisted)
//   recruitCredits:  new Map(),
//
//   // Recruit API
//   addRecruitCredit,
//   deductRecruitCredits,
//   resetUserRecruitCredits,
//   resetAllRecruitCredits,
//   getTopRecruitCredits,

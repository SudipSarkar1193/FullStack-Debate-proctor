// One-time cleanup for the stale "live"/"pending" debates already sitting in
// debates_data.json from before the server-side expiry fix existed.
//
// Run this ONCE, from the same folder as server.js (and with the server
// stopped, so nothing writes to the file mid-migration):
//
//   node migrate_cleanup.js
//
// It marks:
//   - "live" debates whose (startedAt + totalRounds * 150s) is already in
//     the past -> "completed"
//   - "pending" debates (never joined) older than 1 hour -> "expired"
//
// Anything genuinely in-progress or freshly created is left untouched.

const fs = require("fs");
const path = require("path");

const ROUND_DURATION_SEC = 150;
const PENDING_EXPIRY_MS = 60 * 60 * 1000;
const DATA_FILE = path.join(__dirname, "debates_data.json");

if (!fs.existsSync(DATA_FILE)) {
  console.log(`No ${DATA_FILE} found — nothing to migrate.`);
  process.exit(0);
}

const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
const debates = raw.debates || {};

const now = Date.now();
let completedCount = 0;
let expiredCount = 0;

for (const debate of Object.values(debates)) {
  if (debate.status === "live") {
    const endAtMs = debate.expectedEndAt
      ? new Date(debate.expectedEndAt).getTime()
      : new Date(debate.startedAt).getTime() + (debate.totalRounds || 3) * ROUND_DURATION_SEC * 1000;

    if (now >= endAtMs) {
      debate.status = "completed";
      debate.completedAt = new Date(now).toISOString();
      debate.autoCompletedReason = "migration_cleanup";
      completedCount++;
    }
  } else if (debate.status === "pending" && !debate.debater2?.id) {
    const startedAtMs = new Date(debate.startedAt).getTime();
    if (now - startedAtMs >= PENDING_EXPIRY_MS) {
      debate.status = "expired";
      expiredCount++;
    }
  }
}

fs.writeFileSync(DATA_FILE, JSON.stringify({ debates }, null, 2));

console.log(`Migration complete.`);
console.log(`  Marked completed: ${completedCount}`);
console.log(`  Marked expired:   ${expiredCount}`);
console.log(`  Total debates on file: ${Object.keys(debates).length}`);
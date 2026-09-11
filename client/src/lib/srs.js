// The spaced-repetition rules exactly as server/index.js applies them
// (applyQuizResult, applyQuestionResult, scoredVocabIds and the bucket SQL).
//
// A guest has no account for the server to write to, so the browser runs the
// same rules on its own copy. Change one side and change the other: a guest's
// words must behave the same before and after they are merged into an account.

export const DAY_MS = 24 * 3600 * 1000;

export const BUCKETS = ['due_now', 'due_1', 'due_3', 'due_7', 'due_14', 'mastered'];

export function intervalDaysForLevel(level) {
  if (level < 0) return 0;
  const byLevel = { 0: 1, 1: 3, 2: 7, 3: 14, 4: 30 };
  return Object.prototype.hasOwnProperty.call(byLevel, level) ? byLevel[level] : 30;
}

const iso = (ms) => new Date(ms).toISOString();

const levelOf = (row) => (Number.isInteger(row.repetition_level) ? row.repetition_level : 0);

// correctCount is how many of the word's two quiz questions were right. The
// study page's "Chưa thuộc" / "Đã thuộc" buttons send 0 and 2.
export function applyQuizResult(row, correctCount, now = Date.now()) {
  if (!row) {
    const learned = correctCount === 2;
    const level = learned ? 0 : -1;
    const intervalDays = learned ? intervalDaysForLevel(0) : 0;
    return {
      repetition_level: level,
      interval_days: intervalDays,
      next_review_at: iso(now + intervalDays * DAY_MS),
      last_reviewed_at: iso(now),
      correct_streak: learned ? 1 : 0,
      total_reviews: 1,
      mastered: level >= 4,
      created_at: iso(now)
    };
  }

  const currentLevel = levelOf(row);
  let level = currentLevel;
  let streak = row.correct_streak || 0;

  if (correctCount === 0) {
    level = currentLevel <= 0 ? currentLevel - 1 : -1;
    streak = 0;
  } else if (correctCount === 2) {
    level = currentLevel < 0 ? 0 : Math.min(currentLevel + 1, 4);
    streak += 1;
  }

  const intervalDays = intervalDaysForLevel(level);
  return {
    ...row,
    repetition_level: level,
    interval_days: intervalDays,
    next_review_at: iso(now + intervalDays * DAY_MS),
    last_reviewed_at: iso(now),
    correct_streak: streak,
    total_reviews: (row.total_reviews || 0) + 1,
    mastered: level >= 4
  };
}

// The gentler rule for context questions: a miss steps down one level instead
// of resetting, and a word never studied is left alone (null).
export function applyQuestionResult(row, isCorrect, now = Date.now()) {
  if (!row) return null;

  const currentLevel = levelOf(row);
  const level = isCorrect
    ? (currentLevel < 0 ? 0 : Math.min(currentLevel + 1, 4))
    : Math.min(currentLevel, Math.max(currentLevel - 1, -1));

  const intervalDays = intervalDaysForLevel(level);
  return {
    ...row,
    repetition_level: level,
    interval_days: intervalDays,
    next_review_at: iso(now + intervalDays * DAY_MS),
    last_reviewed_at: iso(now),
    correct_streak: isCorrect ? (row.correct_streak || 0) + 1 : 0,
    total_reviews: (row.total_reviews || 0) + 1,
    mastered: level >= 4
  };
}

export const previousLevel = levelOf;

// Which of a question's words the answer scores: the quoted target, plus the
// word behind the correct option. Links come from a question's `words` list.
export function scoredVocabIds(links, options, answerKey) {
  const correct = String((options || {})[answerKey] || '').trim().toLowerCase();
  const ids = new Set();
  for (const link of links || []) {
    const surface = String(link.surface_form || '').trim().toLowerCase();
    if (link.role === 'target' || (correct && surface === correct)) {
      ids.add(Number(link.vocab_id ?? link.id));
    }
  }
  return [...ids];
}

// Mirrors the CASE-free SUMs in /api/repetition/summary, overlaps included: a
// mastered word coming due within 14 days counts in both its due bucket and
// "mastered", same as on the server.
export function bucketMatches(row, bucket, now = Date.now()) {
  const next = Date.parse(row.next_review_at);
  if (!Number.isFinite(next)) return false;
  const within = (fromDays, toDays) => next > now + fromDays * DAY_MS && next <= now + toDays * DAY_MS;

  switch (bucket) {
    case 'due_now': return next <= now;
    case 'due_1': return within(0, 1);
    case 'due_3': return within(1, 3);
    case 'due_7': return within(3, 7);
    case 'due_14': return within(7, 14);
    case 'mastered': return row.mastered === true && next > now;
    default: return false;
  }
}

export function summarize(rows, now = Date.now()) {
  const summary = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
  for (const row of rows) {
    for (const bucket of BUCKETS) {
      if (bucketMatches(row, bucket, now)) summary[bucket] += 1;
    }
  }
  return summary;
}

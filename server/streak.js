/**
 * Daily streak, recomputed from history on every request.
 *
 * Nothing about the streak is stored. The inputs are rows that already exist
 * for other reasons (question attempts, finished quizzes), so there is no
 * counter to drift, and changing a rule below re-scores the whole history.
 *
 * A day is:
 *   kept     >= 1 SAT hard question answered, or a Study-now quiz finished
 *   goal     >= GOAL hard questions                       (5)
 *   bonus    >= BONUS hard questions, earns one shield    (10)
 *   shielded missed, but a shield was spent so the streak survives
 *   none     missed (or today, not done yet)
 *
 * Shields are capped at MAX_SHIELDS and only spent to protect a running
 * streak. Today never breaks anything: until midnight it is just "not yet".
 */
const GOAL = 5;
const BONUS = 10;
const MAX_SHIELDS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

// 'YYYY-MM-DD' <-> epoch days, in UTC so there is no DST or local-zone drift.
// The strings are already local days in the streak's time zone.
const toDayNumber = (iso) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
const toIso = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);

/**
 * @param {Array<{day: string, hard: number, correct?: number, quiz?: number}>} activity
 * @param {string} today  'YYYY-MM-DD' in the streak's time zone
 * @param {number} windowStart  first day to include in `days` (day number)
 */
function computeStreak(activity, today, { windowStart } = {}) {
  const byDay = new Map();
  for (const a of activity) {
    const n = toDayNumber(a.day);
    const prev = byDay.get(n) || { hard: 0, correct: 0, quiz: 0 };
    byDay.set(n, {
      hard: prev.hard + (a.hard || 0),
      correct: prev.correct + (a.correct || 0),
      quiz: prev.quiz + (a.quiz || 0)
    });
  }

  const todayN = toDayNumber(today);
  const first = byDay.size > 0 ? Math.min(...byDay.keys()) : todayN;

  let current = 0;
  let best = 0;
  let shields = 0;
  const status = new Map();

  for (let d = Math.min(first, todayN); d <= todayN; d += 1) {
    const a = byDay.get(d) || { hard: 0, correct: 0, quiz: 0 };
    if (a.hard > 0 || a.quiz > 0) {
      current += 1;
      if (a.hard >= BONUS) {
        status.set(d, 'bonus');
        shields = Math.min(shields + 1, MAX_SHIELDS);
      } else {
        status.set(d, a.hard >= GOAL ? 'goal' : 'kept');
      }
    } else if (d === todayN) {
      status.set(d, 'none');
    } else if (current > 0 && shields > 0) {
      shields -= 1;
      status.set(d, 'shielded');
    } else {
      current = 0;
      status.set(d, 'none');
    }
    best = Math.max(best, current);
  }

  const start = windowStart ?? todayN - 34;
  const days = [];
  for (let d = start; d <= todayN; d += 1) {
    const a = byDay.get(d) || { hard: 0, correct: 0, quiz: 0 };
    days.push({ date: toIso(d), hard: a.hard, correct: a.correct, quiz: a.quiz, status: status.get(d) || 'none' });
  }

  const t = byDay.get(todayN) || { hard: 0, correct: 0, quiz: 0 };
  return {
    today: { date: today, hard: t.hard, correct: t.correct, quiz: t.quiz, goal: GOAL, bonus: BONUS },
    streak: {
      current,
      best,
      shields,
      max_shields: MAX_SHIELDS,
      kept_today: t.hard > 0 || t.quiz > 0
    },
    days
  };
}

// Monday four weeks before this week's Monday: five heatmap columns that start
// on a Monday, the last one ending today.
function heatmapStart(today) {
  const n = toDayNumber(today);
  const weekday = (new Date(n * DAY_MS).getUTCDay() + 6) % 7; // Monday = 0
  return n - weekday - 28;
}

module.exports = { computeStreak, heatmapStart, toDayNumber, toIso, GOAL, BONUS, MAX_SHIELDS };

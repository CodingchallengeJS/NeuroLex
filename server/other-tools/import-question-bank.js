/**
 * Loads assets/440-wic-question.json into question_sets / questions /
 * question_vocab.
 *
 * The link table is the point: it is what turns "find questions containing a
 * word I have studied" into a join instead of a text scan.
 *
 * Linking is done on BOTH the quoted target word and the four answer options.
 * Measured on this data, target-only links 176 of 440 questions; including the
 * options links 308. That is also right pedagogically - in a "closest in
 * meaning" item the correct answer IS a synonym of the target, so a question
 * whose answer is a word you studied is good practice for that word.
 *
 * Words that resolve to nothing are reported and skipped, never auto-created:
 * most unmatched targets are ordinary mid-frequency words that do not belong in
 * a C1-C2 vocabulary list.
 */
const fs = require('fs');
const path = require('path');
const { createPool } = require('../db');
const { resolveSurface } = require('./lib/lemma');

const pool = createPool();
const DATA_FILE = path.resolve(__dirname, '../assets/440-wic-question.json');
const OVERRIDES_FILE = path.resolve(__dirname, '../assets/lemma-overrides.json');

const SET = {
  slug: 'wic-440',
  title: '440 Vocabulary Questions (word in context)',
  source: 'VietAccepted Center - 440 Vocabulary Questions'
};

// "The word "representative" is closest in meaning to which of following?"
const TARGET_RE = /\b[Tt]he\s+(?:word|phrase|expression)\s+"([^"]+)"/;

// Shorter than this many words counts as an easy question. Must stay in step
// with migrations/007_question_length.sql, which labels rows already in the
// database; this line labels rows as they are imported. See that file for why
// 45 and not something rounder.
const EASY_MAX_WORDS = 45;

// Same definition the migration uses: whitespace-separated tokens of the
// trimmed prompt.
const countWords = (text) => String(text || '').trim().split(/\s+/).filter(Boolean).length;

function loadOverrides() {
  if (!fs.existsSync(OVERRIDES_FILE)) return {};
  const raw = JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf-8'));
  return raw.overrides || {};
}

async function main() {
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error(`Question data not found at ${DATA_FILE}. Run parse-question-bank.js first.`);
  }
  const all = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  const overrides = loadOverrides();

  // A question with no options cannot be answered, and one with no answer key
  // cannot be marked. Importing either would just create broken practice.
  const usable = all.filter(
    (q) => q.options && Object.keys(q.options).length > 0 && q.answer
  );
  const skipped = all.length - usable.length;

  const client = await pool.connect();
  const unmatchedTargets = new Set();
  const stats = { questions: 0, targetLinks: 0, optionLinks: 0, viaExact: 0, viaLemma: 0, viaOverride: 0, easy: 0, hard: 0 };

  try {
    await client.query('BEGIN');

    const setRes = await client.query(
      `INSERT INTO question_sets (slug, title, source)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, source = EXCLUDED.source
       RETURNING id`,
      [SET.slug, SET.title, SET.source]
    );
    const setId = setRes.rows[0].id;

    const vocabRows = (await client.query('SELECT id, LOWER(word) AS w FROM vocabulary')).rows;
    const byWord = new Map(vocabRows.map((r) => [r.w, r.id]));

    for (const q of usable) {
      const targetMatch = q.question.match(TARGET_RE);
      // Trailing spaces survive the source text ("account for "), so trim.
      const target = targetMatch ? targetMatch[1].trim() : null;

      const wordCount = countWords(q.question);

      const qRes = await client.query(
        `INSERT INTO questions (set_id, external_id, prompt, question_type, options, answer_key,
                                word_count, difficulty)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (set_id, external_id) DO UPDATE SET
           prompt = EXCLUDED.prompt,
           question_type = EXCLUDED.question_type,
           options = EXCLUDED.options,
           answer_key = EXCLUDED.answer_key,
           word_count = EXCLUDED.word_count,
           difficulty = EXCLUDED.difficulty
         RETURNING id`,
        [
          setId,
          q.id,
          q.question,
          target ? 'word_in_context' : 'general',
          JSON.stringify(q.options),
          q.answer,
          wordCount,
          wordCount < EASY_MAX_WORDS ? 'easy' : 'hard'
        ]
      );
      stats[wordCount < EASY_MAX_WORDS ? 'easy' : 'hard'] += 1;
      const questionId = qRes.rows[0].id;
      stats.questions += 1;

      // Rebuild this question's links so a re-run cannot leave stale rows
      // behind after the lemma rules improve.
      await client.query('DELETE FROM question_vocab WHERE question_id = $1', [questionId]);

      const link = async (surface, role) => {
        const hit = resolveSurface(surface, byWord, overrides);
        if (!hit) {
          if (role === 'target') unmatchedTargets.add(String(surface).toLowerCase().trim());
          return false;
        }
        await client.query(
          `INSERT INTO question_vocab (question_id, vocab_id, role, surface_form)
           VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [questionId, hit.id, role, String(surface).trim()]
        );
        stats[`via${hit.via[0].toUpperCase()}${hit.via.slice(1)}`] += 1;
        return true;
      };

      if (target && (await link(target, 'target'))) stats.targetLinks += 1;
      for (const optText of Object.values(q.options)) {
        if (await link(optText, 'option')) stats.optionLinks += 1;
      }
    }

    await client.query('COMMIT');

    const linked = await pool.query(
      `SELECT COUNT(DISTINCT question_id)::int AS c FROM question_vocab`
    );

    console.log(`\n✅ Imported ${stats.questions} questions into "${SET.title}".`);
    if (skipped > 0) {
      console.log(`   Skipped ${skipped} unusable (no options or no answer key).`);
    }
    console.log(`   Target links: ${stats.targetLinks} · option links: ${stats.optionLinks}`);
    console.log(`   Resolved by: exact ${stats.viaExact}, lemma ${stats.viaLemma}, override ${stats.viaOverride}`);
    console.log(`   Questions linked to at least one vocabulary word: ${linked.rows[0].c} / ${stats.questions}`);
    console.log(`   Length split: ${stats.easy} easy (under ${EASY_MAX_WORDS} words), ${stats.hard} hard`);

    if (unmatchedTargets.size > 0) {
      const list = [...unmatchedTargets].sort();
      console.log(`\n   ${list.length} target word(s) had no vocabulary entry and were left unlinked.`);
      console.log(`   These are mostly mid-frequency words absent from a C1-C2 list.`);
      console.log(`   Add real mappings to assets/lemma-overrides.json if any look wrong:`);
      console.log(`   ${list.slice(0, 30).join(', ')}${list.length > 30 ? ', …' : ''}`);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Có lỗi xảy ra, đã rollback DB:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});

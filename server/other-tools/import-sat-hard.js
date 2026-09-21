/**
 * Loads assets/sat-cb-hard.json (200 College Board SAT Reading & Writing
 * questions, all "Hard") into question_sets / questions / question_vocab.
 *
 * The JSON comes from parse-sat-pdf.py; charts and tables are PNGs under
 * client/public/sat-figures/, referenced by figure_url.
 *
 * Questions are keyed on the College Board id (source_id), not on position, so
 * re-running after a new export in a different order updates the right rows.
 *
 * WORD LINKS
 * Passage words that resolve to a vocabulary entry are linked with role
 * 'passage'. That powers "Chỉ câu chứa từ tôi đã học" and the word chips for
 * this set. scoredVocabIds() only scores 'target' links and the correct option,
 * so answering a reading question never moves a word's SRS level: getting a
 * passage right does not prove you know any one word in it.
 */
const fs = require('fs');
const path = require('path');
const { createPool } = require('../db');
const { resolveSurface } = require('./lib/lemma');

const pool = createPool();
const DATA_FILE = path.resolve(__dirname, '../assets/sat-cb-hard.json');
const OVERRIDES_FILE = path.resolve(__dirname, '../assets/lemma-overrides.json');

const SET = {
  slug: 'sat-cb-hard',
  title: 'SAT Hard – College Board',
  source: 'College Board SAT Question Bank (Reading and Writing, Hard)'
};

// Short function words would link half the bank to the connectives notebook
// ("but", "and", "not"), which says nothing about the passage.
const MIN_LINK_LENGTH = 5;

// Discourse markers (while, because, therefore, however) appear in almost every
// passage; linking them would make every question look "about" words the user
// studied in the connectives notebook.
const SKIP_NOTEBOOK_SLUG = 'linking-words-discourse-markers';

// lemma.js is tuned for quoted target words, where a loose match is checked by
// a human. Scanning whole passages needs stricter: only plain inflections, so
// "noted" never becomes "not" and "government" never becomes "govern".
const INFLECTION = /^(s|es|d|ed|ing|ly|er|est|ies|ied|ily)$/;
function isInflection(surface, lemma) {
  if (surface === lemma) return true;
  for (const stem of [lemma, lemma.replace(/[ey]$/, '')]) {
    if (!surface.startsWith(stem)) continue;
    const rest = surface.slice(stem.length);
    // doubled final consonant: stopped, beginning
    if (INFLECTION.test(rest) || (rest[0] === stem.slice(-1) && INFLECTION.test(rest.slice(1)))) return true;
  }
  return false;
}

const countWords = (text) => String(text || '').trim().split(/\s+/).filter(Boolean).length;

function loadOverrides() {
  if (!fs.existsSync(OVERRIDES_FILE)) return {};
  return JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf-8')).overrides || {};
}

function passageTokens(passage) {
  const plain = String(passage || '').replace(/<\/?u>/g, ' ');
  const seen = new Set();
  for (const m of plain.matchAll(/[A-Za-z][A-Za-z'’-]*[A-Za-z]/g)) {
    const token = m[0].replace(/[’']s$/, '').toLowerCase();
    // Capitalised mid-sentence words are mostly names (Coll, Bianchi); a
    // vocabulary word that starts a sentence still shows up lower-case
    // somewhere in a passage this long, or is rare enough to lose.
    if (/^[A-Z]/.test(m[0])) continue;
    if (token.length >= MIN_LINK_LENGTH) seen.add(token);
  }
  return [...seen];
}

async function main() {
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error(`${DATA_FILE} not found. Run: python other-tools/parse-sat-pdf.py`);
  }
  const all = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  const overrides = loadOverrides();

  const usable = all.filter((q) => q.source_id && q.options && Object.keys(q.options).length === 4 && q.answer);
  const skipped = all.length - usable.length;

  const client = await pool.connect();
  const stats = { inserted: 0, updated: 0, links: 0, linkedQuestions: 0, figures: 0 };

  try {
    await client.query('BEGIN');

    const setId = (await client.query(
      `INSERT INTO question_sets (slug, title, source)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, source = EXCLUDED.source
       RETURNING id`,
      [SET.slug, SET.title, SET.source]
    )).rows[0].id;

    // Keep each question's number stable across re-imports; new ones go last.
    const existing = new Map((await client.query(
      'SELECT source_id, external_id FROM questions WHERE set_id = $1 AND source_id IS NOT NULL', [setId]
    )).rows.map((r) => [r.source_id, r.external_id]));
    let nextNumber = Math.max(0, ...existing.values()) + 1;

    const vocabRows = (await client.query(
      `SELECT v.id, LOWER(v.word) AS w FROM vocabulary v
       WHERE NOT EXISTS (
         SELECT 1 FROM notebook_vocab nv JOIN notebooks n ON n.id = nv.notebook_id
         WHERE nv.vocab_id = v.id AND n.slug = $1)`,
      [SKIP_NOTEBOOK_SLUG]
    )).rows;
    const byWord = new Map(vocabRows.map((r) => [r.w, r.id]));

    for (const q of usable) {
      const isNew = !existing.has(q.source_id);
      const number = isNew ? nextNumber++ : existing.get(q.source_id);

      const questionId = (await client.query(
        `INSERT INTO questions (set_id, external_id, source_id, prompt, passage, question_type,
                                options, answer_key, explanation, difficulty, word_count,
                                skill, figure_url)
         VALUES ($1, $2, $3, $4, $5, 'reading', $6, $7, $8, 'hard', $9, $10, $11)
         ON CONFLICT (set_id, source_id) WHERE source_id IS NOT NULL DO UPDATE SET
           prompt = EXCLUDED.prompt,
           passage = EXCLUDED.passage,
           options = EXCLUDED.options,
           answer_key = EXCLUDED.answer_key,
           explanation = EXCLUDED.explanation,
           word_count = EXCLUDED.word_count,
           skill = EXCLUDED.skill,
           figure_url = EXCLUDED.figure_url
         RETURNING id`,
        [
          setId, number, q.source_id, q.stem, q.passage,
          JSON.stringify(q.options), q.answer, q.rationale || null,
          countWords(String(q.passage).replace(/<\/?u>/g, '')), q.skill, q.figure || null
        ]
      )).rows[0].id;
      stats[isNew ? 'inserted' : 'updated'] += 1;
      if (q.figure) stats.figures += 1;

      // Rebuilt every run, so better lemma rules never leave stale links.
      await client.query('DELETE FROM question_vocab WHERE question_id = $1', [questionId]);
      const linked = new Set();
      for (const token of passageTokens(q.passage)) {
        const hit = resolveSurface(token, byWord, overrides);
        if (!hit || linked.has(hit.id) || !isInflection(token, hit.matchedOn)) continue;
        linked.add(hit.id);
        await client.query(
          `INSERT INTO question_vocab (question_id, vocab_id, role, surface_form)
           VALUES ($1, $2, 'passage', $3) ON CONFLICT DO NOTHING`,
          [questionId, hit.id, token]
        );
      }
      stats.links += linked.size;
      if (linked.size > 0) stats.linkedQuestions += 1;
    }

    await client.query('COMMIT');

    console.log(`\n✅ ${SET.title}: ${stats.inserted} new, ${stats.updated} updated (${stats.figures} with a figure).`);
    if (skipped > 0) console.log(`   Skipped ${skipped} without four options or an answer key.`);
    console.log(`   Passage word links: ${stats.links} across ${stats.linkedQuestions} / ${usable.length} questions.`);
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

#!/usr/bin/env node
/**
 * Loads the bundled vocabulary in server/assets/ into the database by running
 * the importers in other-tools/ in dependency order.
 *
 * On an empty database every step runs. Once notebooks exist the seed is
 * skipped, EXCEPT for steps marked runOnce that have not run yet (recorded in
 * seed_steps, migration 008). That is how a new importer reaches production:
 * add it with runOnce: true and the next deploy applies it exactly once.
 *
 * FORCE_SEED=true re-runs everything. Avoid it on a live database: several
 * importers overwrite word fields, so hand edits to meanings are lost.
 */
const path = require('path');
const { spawn } = require('child_process');
const { createPool, describeTarget } = require('./db');

const TOOLS = path.resolve(__dirname, 'other-tools');

const STEPS = [
  { label: '7 topic notebooks + SAT C1-C2 500', script: 'import-topics-and-sat-c1c2.js' },
  { label: '12 IELTS Magoosh notebooks', script: 'import-magoosh.js' },
  { label: 'Magoosh examples backfill', script: 'backfill-magoosh-examples.js' },
  { label: 'SAT B2C1 1000 Part 1', script: 'import-va-b2c1-markdown.js', args: ['1'] },
  { label: 'SAT B2C1 1000 Part 2', script: 'import-va-b2c1-markdown.js', args: ['2'] },
  { label: 'SAT B2C1 1000 Part 3', script: 'import-va-b2c1-markdown.js', args: ['3'] },
  { label: 'SAT B2C1 1000 Part 4', script: 'import-va-b2c1-markdown.js', args: ['4'] },
  { label: 'Cambridge IELTS Advanced', script: 'import-cleaned-csv.js' },
  // Re-categorises words the Cambridge import loads, so it must run after it.
  { label: '20 Cambridge IELTS Advanced unit notebooks', script: 'import-vocab4ielts-units.js' },
  // Creates its own notebook, so it has to run before the classification pass
  // below; it seeds the tag taxonomy itself rather than waiting for it.
  { label: 'Linking words & discourse markers', script: 'import-connectives.js' },
  // Last: classifies every notebook that now exists (names, slugs, tags).
  { label: 'Tag taxonomy + notebook classification', script: 'import-tags.js' },
  { label: 'Word function tags', script: 'import-vocab-tags.js' },
  // Needs the full vocabulary present so questions can link to real words.
  { label: '440 question bank', script: 'import-question-bank.js' },
  // runOnce: applies itself to the already-seeded production database.
  { label: 'SAT Hard – College Board (200)', script: 'import-sat-hard.js', runOnce: true }
];

const stepName = (step) => [step.script, ...(step.args || [])].join(' ');

function run(step) {
  return new Promise((resolve, reject) => {
    const args = [path.join(TOOLS, step.script), ...(step.args || [])];
    const child = spawn(process.execPath, args, {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: process.env
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${step.script} exited with code ${code}`));
    });
  });
}

async function alreadySeeded() {
  const pool = createPool();
  try {
    const res = await pool.query('SELECT COUNT(*)::int AS n FROM notebooks');
    return res.rows[0].n > 0;
  } finally {
    await pool.end();
  }
}

async function recordedSteps() {
  const pool = createPool();
  try {
    const res = await pool.query('SELECT name FROM seed_steps');
    return new Set(res.rows.map((r) => r.name));
  } finally {
    await pool.end();
  }
}

async function record(step) {
  const pool = createPool();
  try {
    await pool.query(
      'INSERT INTO seed_steps (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET ran_at = NOW()',
      [stepName(step)]
    );
  } finally {
    await pool.end();
  }
}

async function main() {
  const force = String(process.env.FORCE_SEED || '').toLowerCase() === 'true';

  let steps = STEPS;
  if (!force && (await alreadySeeded())) {
    const done = await recordedSteps();
    steps = STEPS.filter((step) => step.runOnce && !done.has(stepName(step)));
    if (steps.length === 0) {
      console.log('Notebooks already present, skipping seed. (FORCE_SEED=true to re-run.)');
      return;
    }
    console.log(`Notebooks already present; running ${steps.length} new one-time step(s) on ${describeTarget()}`);
  } else {
    console.log(`Seeding ${describeTarget()}`);
  }

  for (const [i, step] of steps.entries()) {
    console.log(`\n[${i + 1}/${steps.length}] ${step.label}`);
    await run(step);
    await record(step);
  }
  console.log('\nSeed complete.');
}

main().catch((err) => {
  console.error('Seed error:', err.message);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Loads the bundled vocabulary in server/assets/ into the database by running
 * the importers in other-tools/ in dependency order.
 *
 * Skips itself when the database already has notebooks, so it is safe to run on
 * every boot. Set FORCE_SEED=true to run the importers anyway (they are all
 * idempotent, just slow).
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
  { label: '20 Cambridge IELTS Advanced unit notebooks', script: 'import-vocab4ielts-units.js' }
];

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

async function main() {
  const force = String(process.env.FORCE_SEED || '').toLowerCase() === 'true';

  if (!force && (await alreadySeeded())) {
    console.log('Notebooks already present, skipping seed. (FORCE_SEED=true to re-run.)');
    return;
  }

  console.log(`Seeding ${describeTarget()}`);
  for (const [i, step] of STEPS.entries()) {
    console.log(`\n[${i + 1}/${STEPS.length}] ${step.label}`);
    await run(step);
  }
  console.log('\nSeed complete.');
}

main().catch((err) => {
  console.error('Seed error:', err.message);
  process.exit(1);
});

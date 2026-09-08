# P2 + P3 build — phase status

Working document for the tagging + question-bank build. The big picture lives in
[ROADMAP.md](ROADMAP.md); this tracks execution.

Full plan: `~/.claude/plans/lively-scribbling-oasis.md`

---

## ✅ Phase A — Notebook tags (done, live)

`005_tags.sql` · `assets/tags.json` · `other-tools/import-tags.js` ·
`other-tools/lib/notebooks.js` · `TagChip` · `TagFilterBar` · `NotebookGrid`

- 26 tags seeded; 45 notebooks classified (45 exam / 33 source / 33 level / 7 topic)
- Renamed to one convention: `IELTS Magoosh — Hard 2`, `SAT B2-C1 1000 — Part 4`,
  `Cambridge IELTS Advanced — Unit 01: Human nature`
- `slug` added as stable identity so renaming does not make the seed create
  duplicates; shared `upsertNotebook` matches slug first, adopts by title
- Empty `vocab4ielts-other` removed
- **26 API tests passing**

## ✅ Phase B — Word tags (done, live)

`assets/vocab-tags.json` · `other-tools/import-vocab-tags.js` ·
`TagManagerModal` · `BulkTagModal`

132 links across 8 function tags, every listed word matched:

| tag | words | | tag | words |
|---|---|---|---|---|
| `function:dispute` | 24 | | `function:contrast` | 16 |
| `function:cause` | 24 | | `function:hedge` | 13 |
| `function:emphasis` | 21 | | `function:concession` | 10 |
| `function:substantiate` | 20 | | `function:addition` | 4 |

- Tags ride along on every vocabulary response via `vocabularySelectFields`
  (740-row notebook measured at 59ms)
- Admin: tag CRUD + bulk apply/remove across a multi-selection
- **24 API tests passing**

## ✅ Phase A.1 — Faceted filter semantics (done)

OR within a tag kind, AND across kinds. Counting `DISTINCT kind` does both at
once. `> 0` guard so an unknown slug matches nothing rather than everything.
**12 tests passing.**

---

## ✅ Phase U — UI / layout fixes (done, verified in browser)

Raised from real use of the running app.

### U1. Search

- [x] Clear (`×`) button on both search inputs
- [x] **Bug:** leaving a notebook does not reset the search input, so the stale
      text immediately fires a *global* search. `SearchBar` keeps its own `query`
      state and only the parent's state is cleared.
- [x] Move global search into the navbar, between the NeuroLex brand and
      `Trang chủ`
- [x] Searching from any page (including home) lands on the notebooks page —
      drive it through `/notebooks?q=…` so it is shareable and back-button safe
- [x] Local (in-notebook) search stays in the notebook header, unchanged in role

### U2. Tag panel becomes a left column

- [x] Move the tag filter out of the scrolling grid into its own column, so it
      stays put while the notebook list scrolls
- [x] Layout becomes: **tag panel | notebook list | spaced-repetition panel**
- [x] Inside a notebook the panel switches to **word** tag filtering.
      Phase B already shipped 8 real function tags, so this filters for real —
      no dummy "All" chip needed.

### U4. Found while testing (not in the original list)

- [x] `/api/search` hand-wrote its own field list instead of using
      `vocabularySelectFields`, so search results came back with **no tags** and
      **no example sentence**. The word-tag panel looked empty on any search.

### U3. Chart toggle

- [x] Two adjacent round buttons: bar icon / donut icon
- [x] Bar view keeps "Nhấn vào cột để bắt đầu ôn tập"
- [x] Donut view shows the donut only, without that caption
- [x] Only one chart visible at a time

---

## ✅ Phase C — Connectives notebook (done, live)

`assets/connectives.json` · `other-tools/import-connectives.js` ·
`other-tools/lib/tags.js`

**92 linking words**, each with EN + VI meanings, an example and function tags.
75 were genuinely new to the vocabulary table — confirming the premise that the
SAT/IELTS lists carry no basic connectives (only `nevertheless` overlapped).

Added `function:negation` to the taxonomy so `not` / `neither` / `hardly` /
`by no means` have a home. Word-tag coverage after this phase:

| tag | before | after |
|---|---|---|
| `function:cause` | 24 | **37** |
| `function:emphasis` | 21 | **35** |
| `function:hedge` | 13 | **29** |
| `function:contrast` | 16 | **29** |
| `function:concession` | 10 | **22** |
| `function:addition` | 4 | **13** |
| `function:negation` | — | **10** |

Ordering knot found and fixed: `import-connectives.js` needs the `function:*`
tags to exist, while `import-tags.js` must run last to classify every notebook —
including the one connectives creates. Left as-is, the new notebook shipped
untagged. Tag seeding moved into a shared `lib/tags.js#ensureTags`, so whichever
importer runs first seeds the taxonomy; seed order is now
connectives → classification → word tags.

Existing entries (`nevertheless`, `whereas`, `hence`, …) are linked and tagged
**without** overwriting their meanings — verified `nevertheless` kept
"tuy nhưng, dù vậy".

## ✅ Notebook ordering (done)

`GET /api/notebooks` sorts by category then name: exam label, then source within
that exam, then title. Groups the 21 Cambridge units, then 12 Magoosh, then the
7 topic notebooks, then SAT. Untagged (Chunk, user lists) sort last.

## ✅ Phase D — Question bank import (done, live)

`006_question_bank.sql` · `other-tools/import-question-bank.js` ·
`other-tools/lib/lemma.js` · `assets/lemma-overrides.json`

**427 questions imported**, 13 skipped as unusable (11 with no answer options,
2 whose 3-digit id failed to parse so their answer key could not be matched —
guessing an answer would teach the wrong thing).

| | |
|---|---|
| questions | 427 |
| question↔vocabulary links | 557 (186 target + 371 option) |
| questions linked to ≥1 word | **315 / 427** |
| resolved by | exact 286, lemma 269, override 2 |
| **touching a word user 1 has studied** | **204** |
| …of which due for review now | **178** |

Parser bugs fixed first: newlines are now collapsed **before** the type check,
so `vocabulary` classification went 406 → 436 (matching the 436 prompts that
actually contain "closest in meaning"); unusable rows are reported rather than
written out silently.

Linking on the four answer options as well as the quoted target is what makes
this usable — target alone links 186 questions, adding options reaches 315. It
is also right pedagogically: in a "closest in meaning" item the correct answer
*is* a synonym of the target.

### Source-data defect found and fixed

`assets/va-c1c2-500-2023-2026.csv` carried **29 words split by a PDF line wrap**
(`circumspecti on`, `commensura te`, `disingenuous ly`) plus **46 phonetics**
broken the same way. Every fresh seed inserted them as garbage rows *alongside*
the correct spelling. Repaired at source: a fresh seed now produces 0 such rows,
500 data rows intact. `sync-content.sql` also carries a narrowly-guarded DELETE
for databases already seeded before the fix.

## ✅ Content sync to Render (done)

`other-tools/export-sync.js` → `server/sql/sync-content.sql`

Re-runnable SQL that brings a deployed database in line with local content.
Keyed on **natural keys** (`vocabulary.word`, `tags.slug`, `notebooks.slug`),
never numeric ids, because Render's ids come from its own seed run.

Exports 27 tags, 46 notebook names, 120 notebook tags, 221 word tags, and the
**1119 vocabulary rows that differ from a pristine seed** — the hand-edited
DeepL meanings no importer can regenerate. Exports no users, passwords, review
progress or question attempts.

Two bugs found by running it for real rather than assuming:

1. **Encoding.** psql on Windows defaults `client_encoding` to the console
   codepage (WIN1252) and aborted on the first Vietnamese character
   (`byte sequence 0x8f`). The file now begins with `SET client_encoding =
   'UTF8';`, so it works whatever codepage the caller has.
2. **Notebook tags silently did not apply.** The file matched notebooks on
   `slug`, but a deployment seeded before P2 has `slug = NULL` and the old
   names - because `seed.js` skips entirely when notebooks already exist, so
   `import-tags.js` never ran there. Word tags synced (they join on `word`)
   while notebook tags inserted 0 rows. The file now matches on slug **or** a
   legacy title, sets the slug, and renames in the same statement. Reproduced
   on a simulated pre-P2 database: notebook_tags 0 -> 120.

Verified end to end: applied to a freshly seeded database it converged to match
live exactly — vocabulary 2870 → 2944, and tags / notebook_tags / vocab_tags /
notebook names all **IDENTICAL**, with **0 of 2944** meanings differing. Running
it twice changes nothing.

## ✅ Deploy fixes (done)

### Seed crashed on Render with a duplicate-title error

`upsertNotebook` matched a notebook by slug, then by its **canonical** title.
A database seeded before P2 has neither — `seed.js` skips entirely when
notebooks already exist, so `import-tags.js` never ran there and the notebooks
are still `Ielts Common 1` with `slug NULL`. The importer therefore inserted a
*second* notebook under the new name, and the later rename collided:

```
duplicate key value violates unique constraint "idx_notebooks_title_global"
Key (title)=(IELTS Magoosh — Common 1) already exists.
```

Two fixes: `upsertNotebook` now also adopts a slug-less row under its **legacy**
title (cause), and `import-tags.js` merges any duplicate a previous run already
created — moving word links, tags and each user's place in the notebook onto the
canonical row before deleting the old one (damage).

Reproduced on a copy of Render's exact state (58 notebooks, 12 duplicate pairs)
and verified repaired: **58 → 46 notebooks**, 0 legacy names, 0 missing slugs,
word links intact, 120 notebook tags. A second run merges nothing.

### `/health` endpoint

Outside `/api` and registered before the SPA fallback, which would otherwise
answer it with `index.html`. Returns `200` with uptime and response time while
the database answers, `503 degraded` when it does not, and sets
`Cache-Control: no-store` so a proxy cannot serve a cached 200 over a real
outage. Both paths tested.

## ✅ Phase E — Question UI + studied-word filter + SRS feedback (done, live)

`GET /api/questions` · `GET /api/questions/studied` · `POST /api/questions/attempt` ·
`applyQuestionResult` · `pages/QuestionsPage.jsx`

The 427 questions are now reachable. Browsing is open to everyone; the four
progress filters (`only_studied`, `due_now`, `got_wrong`, `unanswered`) need a
login, because they are questions about one person's history — anonymous callers
asking for them get a 401 rather than a silently unfiltered list.

Measured on the live local database:

| | |
|---|---|
| questions in the bank | 427 |
| questions touching a word **user 1** has studied | **204** |
| …with a word due for review right now | **180** |
| user 3 (159 studied words) | 34 questions |
| questions whose answer can move the SRS | 230 (186 target + 44 correct-option) |

### The gentler SRS rule

`applyQuestionResult` promotes one level on a hit and steps down exactly one on
a miss, against the flashcard path's drop from level 4 straight to −1. Verified
in the browser as well as in tests: missing `conceal` moved it *nhớ sâu → cấp 4*,
not back to relearning.

Two details worth keeping:

- **`Math.min(currentLevel, Math.max(currentLevel - 1, -1))`**, not the plan's
  `max(level - 1, -1)`. Repeated flashcard misses can dig a word below −1, and
  the simpler form would then *promote* it on a wrong answer.
- **Only the target and the correct answer are scored.** Three of the four
  options are distractors: question 1 links `distinctive` purely as a wrong
  choice, so demoting it after a miss on `representative` would be noise. Tested
  explicitly — a wrong-option word keeps its level.

### Verification

**38 API tests passing** against a real server and two real users with different
studied words, covering: paging and the 50-row limit cap, the four progress
filters, `got_wrong` reading the *latest* attempt (a since-corrected question
drops out), the unknown-tag guard, tag / notebook / text filters matching direct
SQL counts, the SRS rules above, and that answering about an unstudied word
records the attempt but creates no progress row. Both test accounts deleted
afterwards; the database ends byte-identical to how it started.

### Client

`/questions` in the navbar. Reuses `.quiz-option` / `.quiz-progress-*` and the
reveal-then-next flow, so it behaves like the existing quiz. The prompt's quoted
target word is highlighted, and after answering, the words the sentence
exercises appear as chips — yours lit, the rest faint — with the level change
the answer caused. `?notebook_id=` narrows the bank to one notebook's words.

## ✅ Shuffle + easy/hard by length (done, live)

`007_question_length.sql` · `import-question-bank.js` · `QuestionsPage.jsx`

Practising in import order means meeting the same questions in the same
sequence every session, so the bank is now **shuffled by default**, and split
easy/hard by how much reading each question takes.

### The threshold is 45 words, not 80

The 80-word guess does not fit the data. Measured over all 427 questions:

| min | p25 | median | p75 | p90 | max |
|---|---|---|---|---|---|
| 19 | 35 | **42** | 50 | 57 | **83** |

The whole bank is short — **the longest question in it is 83 words**, so a
threshold of 80 would label 424 easy and leave 3 hard. 45 sits just above the
median, so "easy" means clearly shorter than typical and both sides stay big
enough to practise from:

| | count | words |
|---|---|---|
| easy | **250** | 19–44 |
| hard | **177** | 45–83 |

`word_count` is stored as the fact and `difficulty` as the label derived from
it, so re-tuning is one UPDATE with no recomputation. The migration labels rows
already in the database and the importer labels rows as they arrive — both use
the same definition, verified by re-running the importer and getting the same
250 / 177.

### Shuffle that survives pagination

`ORDER BY random()` is re-evaluated per query, so paging a shuffled list shows
some questions twice and never reaches others. The order is
`MD5(id || seed)` instead: the server picks a seed, returns it, and the client
sends it back for each page. "Trộn lại" asks for a new one. Tested by paging the
entire bank — **427 rows, 427 unique, every id covered**.

`order=` also takes `shortest` / `longest` / `sequence`, and `difficulty=` takes
`easy` / `hard`; both combine with every existing filter.

**18 API tests passing.** Applied to Render as well: **0 of 427** questions
differ from local.

Found while building: the sliding `.segmented` thumb is positioned as 1/n of the
track, which only lines up when every segment is the same width — an inline-flex
track sizes each to its own label. Added `.segmented-even` (a grid with equal
auto-columns) rather than changing the shared class behind the chart and theme
toggles.

## ⬜ Phase F — Tag-aware distractors

Prefer quiz distractors sharing a `function:*` tag with the target. Turns tags
into a difficulty dial: four substantiation verbs as options is far harder than
four random words. Fold in the `LATERAL` rewrite of the existing N+1 loop.

---

## Verification standard

Every phase: migrate on a scratch database first, then the live one with a
before/after row count; run each importer twice for idempotency; integration
tests against a real server with two real users; report measured numbers, not
estimates; rebuild the client.

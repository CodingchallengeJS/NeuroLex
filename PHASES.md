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

## ⬜ Phase D — Question bank import

`006_question_bank.sql` · `other-tools/import-question-bank.js` ·
fix `parse-question-bank.js`

- Parser: normalise newlines **before** the `type` check (~30 misclassified);
  report the 11 empty-option and 2 missing-answer questions; trim
  `"account for "`
- Tables: `question_sets`, `questions`, `question_vocab`, `user_question_attempts`
- Link on target **and** the four options: measured **308/440** linkable that
  way versus 176 on the target alone

## ⬜ Phase E — Question UI + studied-word filter + SRS feedback

- `GET /api/questions/studied` with checkbox filters: only studied, due now,
  previously wrong, unanswered
- `applyQuestionResult`: correct promotes a level; wrong steps down **one** level
  (`max(level - 1, -1)`) instead of the flashcard path's drop straight to −1.
  Only touches words the user already has progress on.
- `/questions` page reusing the `.quiz-*` classes and the reveal-then-next flow

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

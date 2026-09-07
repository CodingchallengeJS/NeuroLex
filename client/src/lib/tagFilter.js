/**
 * Client-side mirror of the server's tag matching, used for filtering the words
 * inside an open notebook (the notebook grid is filtered server-side instead).
 *
 * OR within a tag kind, AND across kinds: picking two exams means "either
 * exam", picking an exam and a source means "both". Nothing is both SAT and
 * IELTS, so ANDing within a kind would only ever return nothing.
 */
export function matchesTagSelection(itemTags, selectedSlugs, tagIndex) {
  if (!selectedSlugs || selectedSlugs.length === 0) return true;

  const wantedByKind = new Map();
  for (const slug of selectedSlugs) {
    const kind = tagIndex.get(slug)?.kind;
    if (!kind) continue;
    if (!wantedByKind.has(kind)) wantedByKind.set(kind, []);
    wantedByKind.get(kind).push(slug);
  }

  // Every requested slug was unknown - match nothing rather than everything.
  if (wantedByKind.size === 0) return false;

  const have = new Set((itemTags || []).map(t => t.slug));
  for (const slugs of wantedByKind.values()) {
    if (!slugs.some(s => have.has(s))) return false;
  }
  return true;
}

/** Counts how many of `items` carry each tag, for the panel's usage numbers. */
export function countTagUsage(items) {
  const counts = new Map();
  for (const item of items || []) {
    for (const tag of item.tags || []) {
      counts.set(tag.slug, (counts.get(tag.slug) || 0) + 1);
    }
  }
  return counts;
}

/**
 * Maps an inflected surface form back to a dictionary headword.
 *
 * The question bank quotes words as they appear in the sentence ("prized",
 * "overtaken", "extracting") while the vocabulary table stores base forms, so a
 * direct string match misses most of them.
 *
 * Deliberately conservative: it generates candidates and the caller keeps only
 * those that actually exist in the vocabulary table. Over-generating is
 * harmless; guessing a word that is not there is not.
 */

// Irregular forms worth handling, since suffix rules cannot reach them.
const IRREGULAR = {
  overtaken: 'overtake', overtook: 'overtake',
  undertaken: 'undertake', undertook: 'undertake',
  arisen: 'arise', arose: 'arise',
  borne: 'bear', bore: 'bear',
  driven: 'drive', drove: 'drive',
  drawn: 'draw', drew: 'draw',
  forsaken: 'forsake', forsook: 'forsake',
  given: 'give', gave: 'give',
  grown: 'grow', grew: 'grow',
  known: 'know', knew: 'know',
  shown: 'show', shrunk: 'shrink',
  sought: 'seek', taught: 'teach', brought: 'bring',
  thought: 'think', caught: 'catch', bought: 'buy',
  fought: 'fight', wrought: 'work',
  held: 'hold', led: 'lead', fled: 'flee', bred: 'breed',
  struck: 'strike', stricken: 'strike',
  sprung: 'spring', sprang: 'spring',
  woven: 'weave', wove: 'weave',
  written: 'write', wrote: 'write',
  risen: 'rise', rose: 'rise',
  worn: 'wear', wore: 'wear',
  torn: 'tear', tore: 'tear',
  sworn: 'swear', swore: 'swear',
  lain: 'lie', lay: 'lie',
  begun: 'begin', began: 'begin',
  chosen: 'choose', chose: 'choose',
  frozen: 'freeze', froze: 'freeze',
  spoken: 'speak', spoke: 'speak',
  stolen: 'steal', stole: 'steal',
  proven: 'prove',
  men: 'man', women: 'woman', children: 'child', people: 'person',
  feet: 'foot', teeth: 'tooth', geese: 'goose', mice: 'mouse',
  criteria: 'criterion', phenomena: 'phenomenon', data: 'datum',
  analyses: 'analysis', crises: 'crisis', theses: 'thesis',
  indices: 'index', appendices: 'appendix', matrices: 'matrix'
};

const DOUBLE_CONSONANT = /^(.*?)([bcdfghjklmnpqrstvwxz])\2(ed|ing|er|est)$/;

/** All plausible headwords for a surface form, most likely first. */
function lemmaCandidates(surface) {
  const w = String(surface).toLowerCase().trim().replace(/\s+/g, ' ');
  const out = [w];
  const add = (c) => { if (c && c.length > 1 && !out.includes(c)) out.push(c); };

  if (IRREGULAR[w]) add(IRREGULAR[w]);

  // plurals / third person
  if (/ies$/.test(w)) { add(w.replace(/ies$/, 'y')); add(w.replace(/ies$/, 'ie')); }
  if (/(ches|shes|sses|xes|zes)$/.test(w)) add(w.replace(/es$/, ''));
  if (/ves$/.test(w)) { add(w.replace(/ves$/, 'f')); add(w.replace(/ves$/, 'fe')); }
  if (/es$/.test(w)) { add(w.replace(/es$/, '')); add(w.replace(/es$/, 'e')); }
  if (/s$/.test(w) && !/ss$/.test(w)) add(w.replace(/s$/, ''));

  // past / participle
  if (/ied$/.test(w)) add(w.replace(/ied$/, 'y'));
  if (/ed$/.test(w)) { add(w.replace(/ed$/, '')); add(w.replace(/ed$/, 'e')); }

  // progressive
  if (/ing$/.test(w)) { add(w.replace(/ing$/, '')); add(w.replace(/ing$/, 'e')); }

  // comparatives, adverbs, agent nouns
  if (/ily$/.test(w)) add(w.replace(/ily$/, 'y'));
  if (/ly$/.test(w)) add(w.replace(/ly$/, ''));
  if (/est$/.test(w)) { add(w.replace(/est$/, '')); add(w.replace(/est$/, 'e')); }
  if (/er$/.test(w)) { add(w.replace(/er$/, '')); add(w.replace(/er$/, 'e')); }

  // nominalisations that share a root with a verb in the list
  if (/ation$/.test(w)) { add(w.replace(/ation$/, 'ate')); add(w.replace(/ation$/, 'e')); }
  if (/ment$/.test(w)) add(w.replace(/ment$/, ''));
  if (/ness$/.test(w)) add(w.replace(/ness$/, ''));
  if (/ity$/.test(w)) { add(w.replace(/ity$/, 'e')); add(w.replace(/ity$/, '')); }

  // "stopped" -> "stop", "running" -> "run"
  const dbl = w.match(DOUBLE_CONSONANT);
  if (dbl) add(dbl[1] + dbl[2]);

  return out;
}

/**
 * Resolves a surface form against a Map of lowercase word -> vocab id.
 * `overrides` is an optional plain object of surface -> headword.
 * Returns { id, matchedOn, via } or null.
 */
function resolveSurface(surface, byWord, overrides = {}) {
  const raw = String(surface).toLowerCase().trim().replace(/\s+/g, ' ');
  if (!raw) return null;

  if (overrides[raw] && byWord.has(overrides[raw])) {
    return { id: byWord.get(overrides[raw]), matchedOn: overrides[raw], via: 'override' };
  }
  if (byWord.has(raw)) {
    return { id: byWord.get(raw), matchedOn: raw, via: 'exact' };
  }
  for (const cand of lemmaCandidates(raw).slice(1)) {
    if (byWord.has(cand)) {
      return { id: byWord.get(cand), matchedOn: cand, via: 'lemma' };
    }
  }
  return null;
}

module.exports = { lemmaCandidates, resolveSurface };

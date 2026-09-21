"""
Converts a College Board question-bank export (PDF) into
server/assets/sat-cb-hard.json plus one PNG per chart/table in
client/public/sat-figures/.

    python other-tools/parse-sat-pdf.py                 # newest/largest PDF in assets/CB-full-hard
    python other-tools/parse-sat-pdf.py path/to/export.pdf

Offline and run once: deploys never touch it, they import the JSON it writes
(import-sat-hard.js). Needs pdfplumber and pypdfium2.

WHY FIGURES ARE IMAGES
Charts and tables in these exports are vector drawings. Text extraction turns
them into rotated fragments ("seitilapicinum fo rebmuN"), so they are cropped
from the rendered page instead.

LAYOUT (every question page looks the same)
    Question ID: f1bfbed3
    Assessment Test Domain Skill Difficulty      <- header table
    SAT Reading and Writing Information and Ideas Inferences Hard
    Question                                     <- label, NOT "Question ID"
    [figure + its title, indented]
    passage lines at the left margin (x0 ~ 18)
    <bigger gap>
    Which choice ...?                            <- stem
    Answer
    A. ... D.
    Correct Answer: B
    Rationale ...                                <- may run onto following pages
"""
import glob
import json
import os
import re
import sys
from collections import Counter

import pdfplumber
import pypdfium2 as pdfium

HERE = os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.dirname(HERE)
ASSETS = os.path.join(SERVER, 'assets')
PDF_DIR = os.path.join(ASSETS, 'CB-full-hard')
OUT_JSON = os.path.join(ASSETS, 'sat-cb-hard.json')
FIG_DIR = os.path.join(os.path.dirname(SERVER), 'client', 'public', 'sat-figures')
FIG_URL = '/sat-figures/{}.png'

LEFT_MARGIN = 30        # passage lines start at x0 ~ 18; figure text is indented far more
PARA_PITCH = 21         # top-to-top: a wrapped line is ~14-16pt below the last, a new paragraph ~26
RENDER_SCALE = 2.5      # ~180 dpi, sharp on hi-dpi screens without being huge
PAD = 8

DOMAINS = ['Information and Ideas', 'Craft and Structure', 'Standard English Conventions', 'Expression of Ideas']


# Hand fixes for layout the extractor cannot recover, keyed by question id.
# 43f4013a sets the isotope masses as superscripts, which pdfplumber emits as a
# separate "87 86" line or drops, leaving "Sr/ Sr".
ISOTOPE = '⁸⁷Sr/⁸⁶Sr'
TEXT_FIXES = {
    '43f4013a': [
        (r'\( 87 Sr/ 86 Sr\)', '(' + ISOTOPE + ')'),
        (r'\b87 Sr/ 86 Sr\b', ISOTOPE),
        (r'\s*\n\n87 86 ', ' '),
        (r'\s+87 86$', ''),
        (r'(?<![⁶⁷⁸])\bSr/ Sr\b', ISOTOPE),
    ],
}


def apply_fixes(qid, value):
    for pattern, repl in TEXT_FIXES.get(qid, []):
        value = re.sub(pattern, repl, value)
    return value

def pick_pdf():
    if len(sys.argv) > 1:
        return sys.argv[1]
    # The export parts are cumulative (part4 contains parts 1-3), so the
    # largest file is the complete bank.
    files = glob.glob(os.path.join(PDF_DIR, '*.pdf'))
    if not files:
        sys.exit(f'No PDF in {PDF_DIR}')
    return max(files, key=os.path.getsize)


def join_lines(lines):
    """Joins wrapped PDF lines into running text, undoing end-of-line hyphens."""
    out = ''
    for raw in lines:
        keep_break = raw.endswith('\n')     # reflow marks verse/short lines this way
        line = raw.strip()
        if not line:
            continue
        if not out or out.endswith('\n'):
            out += line
        elif re.search(r'[A-Za-z]-$', out):
            out += line
        else:
            out += ' ' + line
        if keep_break:
            out += '\n'
    return out.strip()


def is_verse(line):
    # Prose starts at the margin (x0 ~ 18); poems are set indented.
    return line['x0'] > 22


def reflow(text_lines, width):
    """
    text_lines: pdfplumber text lines (dicts with top/bottom/x1/text), in order.
    Wrapped lines are joined; a large vertical gap starts a new paragraph; a
    short line followed by a normally spaced one (verse, notes) keeps its break.
    """
    paras, cur, prev = [], [], None
    for ln in text_lines:
        if prev is not None:
            # top-to-top: pdfplumber's line 'bottom' is unreliable in these files
            if is_verse(prev) and is_verse(ln):
                # Verse keeps its line breaks. Indented PROSE (novel excerpts) runs
                # to the right margin (~580pt), so only a short line is a verse line.
                if prev['x1'] < width * 0.75:
                    cur[-1] = cur[-1] + '\n'
            elif ln['top'] - prev['top'] > PARA_PITCH or is_verse(prev) != is_verse(ln):
                paras.append(join_lines(cur))
                cur = []
            elif prev['x1'] < width * 0.6 and not prev['text'].rstrip().endswith('______'):
                cur[-1] = cur[-1] + '\n'
        cur.append(ln['text'])
        prev = ln
    if cur:
        paras.append(join_lines(cur))
    # join_lines strips per line, so rebuild the kept breaks
    fixed = []
    for p in paras:
        p = re.sub(r' ?\n ?', '\n', p)
        # an underline running across a line wrap
        fixed.append(re.sub(r'</u>(\s+)<u>', r'\1', p))
    return [p for p in fixed if p.strip()]


def line_text(line, words, underlines):
    """A line's text rebuilt from its words, underlined words wrapped in <u>."""
    ws = [w for w in words
          if abs(w['top'] - line['top']) < 4 and w['x0'] >= line['x0'] - 1 and w['x1'] <= line['x1'] + 1]
    if not ws:
        return line['text']
    marks = [u for u in underlines if abs(u['top'] - line['bottom']) < 2.5]
    parts = []
    for w in ws:
        centre = (w['x0'] + w['x1']) / 2
        under = any(u['x0'] - 1 <= centre <= u['x1'] + 1 for u in marks)
        parts.append(f"<u>{w['text']}</u>" if under else w['text'])
    return ' '.join(parts).replace('</u> <u>', ' ')


def split_rationale(text):
    text = re.sub(r'\s+', ' ', text).strip()
    parts = re.split(r'(?=\bChoice [A-D] is\b)', text)
    return '\n\n'.join(p.strip() for p in parts if p.strip())


def parse_answer_block(text):
    """Options, answer key and rationale from the text after the 'Answer' label."""
    m = re.search(r'Correct Answer:\s*([A-D])', text)
    answer = m.group(1) if m else None
    opts_text = text[:m.start()] if m else text
    options = {}
    cur = None
    for line in opts_text.split('\n'):
        om = re.match(r'^([A-D])\.\s*(.*)$', line.strip())
        if om:
            cur = om.group(1)
            options[cur] = [om.group(2)]
        elif cur and line.strip():
            options[cur].append(line)
    options = {k: join_lines(v) for k, v in options.items()}

    rationale = ''
    rm = re.search(r'\nRationale\n', text)
    if rm:
        rationale = split_rationale(text[rm.end():])
    return options, answer, rationale


def crop_figure(pdf_doc, page_index, box, out_path):
    page = pdf_doc[page_index]
    image = page.render(scale=RENDER_SCALE).to_pil()
    x0, top, x1, bottom = box
    s = RENDER_SCALE
    image = image.crop((int(x0 * s), int(top * s), int(x1 * s), int(bottom * s)))
    image.save(out_path, optimize=True)
    return os.path.getsize(out_path)


def main():
    pdf_path = pick_pdf()
    os.makedirs(FIG_DIR, exist_ok=True)
    pdf_doc = pdfium.PdfDocument(pdf_path)

    questions, problems = [], []
    with pdfplumber.open(pdf_path) as pdf:
        # Group pages: a question starts on a page carrying "Question ID:".
        groups = []
        for i, page in enumerate(pdf.pages):
            text = page.extract_text() or ''
            m = re.search(r'Question ID:\s*(\w+)', text)
            if m:
                groups.append({'id': m.group(1), 'pages': [i], 'texts': [text]})
            elif groups:
                groups[-1]['pages'].append(i)
                groups[-1]['texts'].append(text)

        seen = set()
        for g in groups:
            if g['id'] in seen:
                continue
            seen.add(g['id'])
            first = pdf.pages[g['pages'][0]]
            text = '\n'.join(g['texts'])

            header = text.split('\n')[2] if len(text.split('\n')) > 2 else ''
            domain = next((d for d in DOMAINS if d in header), None)
            hm = re.search(r'(?:' + '|'.join(DOMAINS) + r')\s+(.*?)\s+(Easy|Medium|Hard)\s*$', header)
            skill = hm.group(1) if hm else None
            difficulty = hm.group(2) if hm else None

            words = first.extract_words()
            labels = [w for k, w in enumerate(words)
                      if w['text'] == 'Question' and w['x0'] < 60
                      and not (k + 1 < len(words) and words[k + 1]['text'] == 'ID:')]
            if not labels:
                problems.append((g['id'], 'no Question label'))
                continue
            q_bottom = labels[0]['bottom']
            answer_label = next((w for w in words if w['text'] == 'Answer' and w['x0'] < 60
                                 and w['top'] > q_bottom), None)
            a_top = answer_label['top'] if answer_label else first.height

            lines = [ln for ln in first.extract_text_lines()
                     if ln['top'] > q_bottom and ln['top'] < a_top - 1]
            objs = [o for o in first.rects + first.curves + first.lines
                    if o['top'] >= q_bottom - 1 and o['bottom'] <= a_top + 1]

            # "the underlined sentence" questions: the underline is a hairline
            # rect sitting on a left-margin line. It is text formatting, not a
            # figure, and the question is unanswerable without it.
            left_lines = [ln for ln in lines if ln['x0'] < 60]
            underlines = [o for o in objs if o['bottom'] - o['top'] <= 1.5
                          and any(abs(o['top'] - ln['bottom']) < 2.5 for ln in left_lines)]
            objs = [o for o in objs if o not in underlines]
            for ln in left_lines:
                ln['text'] = line_text(ln, words, underlines)

            # The passage begins at the first left-margin line below every drawing.
            obj_bottom = max((o['bottom'] for o in objs), default=q_bottom)
            # x0 < 60 rather than the margin itself: verse is indented (27 / 36pt).
            body = [ln for ln in lines if ln['x0'] < 60 and ln['top'] > obj_bottom]
            fig_lines = [ln for ln in lines if ln not in body]

            figure = None
            if objs:
                pieces = objs + fig_lines
                box = (max(min(p['x0'] for p in pieces) - PAD, 0),
                       max(min(p['top'] for p in pieces) - PAD, q_bottom),
                       min(max(p['x1'] for p in pieces) + PAD, first.width),
                       min(max(p['bottom'] for p in pieces) + PAD,
                           body[0]['top'] - 2 if body else a_top))
                out = os.path.join(FIG_DIR, f"{g['id']}.png")
                size = crop_figure(pdf_doc, g['pages'][0], box, out)
                figure = {'url': FIG_URL.format(g['id']), 'bytes': size}

            # Stem = the trailing run of margin lines, cut where the text before
            # it is either a paragraph gap away or verse (poems end right above
            # the stem at normal spacing).
            k = len(body) - 1
            while k > 0 and not is_verse(body[k - 1]) and body[k]['top'] - body[k - 1]['top'] <= PARA_PITCH:
                k -= 1
            passage_lines, stem_lines = body[:k], body[k:]
            width = max((ln['x1'] for ln in body), default=first.width) - min((ln['x0'] for ln in body), default=0)
            passage = '\n\n'.join(reflow(passage_lines, width))
            stem = join_lines([ln['text'] for ln in stem_lines])

            after = text.split('\nAnswer\n', 1)
            options, answer, rationale = parse_answer_block(after[1] if len(after) > 1 else '')

            passage = apply_fixes(g['id'], passage)
            options = {k: apply_fixes(g['id'], v) for k, v in options.items()}

            item = {
                'n': len(questions) + 1,
                'source_id': g['id'],
                'domain': domain,
                'skill': skill,
                'difficulty': difficulty,
                'passage': passage,
                'stem': stem,
                'options': options,
                'answer': answer,
                'rationale': rationale,
                'figure': figure['url'] if figure else None
            }
            issues = []
            if sorted(options) != ['A', 'B', 'C', 'D']:
                issues.append(f'options {sorted(options)}')
            if not answer:
                issues.append('no answer')
            if not stem.endswith('?'):
                issues.append(f'stem not a question: {stem[-60:]!r}')
            if not passage:
                issues.append('empty passage')
            if issues:
                problems.append((g['id'], '; '.join(issues)))
            item['_fig_bytes'] = figure['bytes'] if figure else 0
            questions.append(item)

    sizes = [q.pop('_fig_bytes') for q in questions if q['figure']]
    for q in questions:
        q.pop('_fig_bytes', None)

    # The figure folder belongs to this script: drop crops no question uses
    # any more (e.g. after a parsing fix), so stale images never ship.
    used = {os.path.basename(q['figure']) for q in questions if q['figure']}
    stale = [f for f in os.listdir(FIG_DIR) if f.endswith('.png') and f not in used]
    for f in stale:
        os.remove(os.path.join(FIG_DIR, f))

    with open(OUT_JSON, 'w', encoding='utf-8') as fh:
        json.dump(questions, fh, ensure_ascii=False, indent=2)

    print(f'source   : {os.path.basename(pdf_path)}')
    print(f'questions: {len(questions)} unique')
    print(f'skills   : {dict(Counter(q["skill"] for q in questions))}')
    print(f'levels   : {dict(Counter(q["difficulty"] for q in questions))}')
    if sizes:
        print(f'figures  : {len(sizes)} PNGs, {sum(sizes) // 1024} KB total, '
              f'largest {max(sizes) // 1024} KB -> {os.path.relpath(FIG_DIR, os.path.dirname(SERVER))}')
    if stale:
        print(f'removed  : {len(stale)} unused figure(s)')
    print(f'written  : {os.path.relpath(OUT_JSON, SERVER)}')
    if problems:
        print(f'\n{len(problems)} question(s) need a look:')
        for qid, why in problems:
            print(f'  {qid}: {why}')


if __name__ == '__main__':
    main()

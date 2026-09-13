// Renders a model reply's markdown as React elements. There is deliberately no
// dangerouslySetInnerHTML and no HTML parsing anywhere: every piece of text
// ends up as a React text node, which React escapes, so a reply containing
// <script> or <img onerror=...> shows as literal text instead of running.
// That matters here because a script running on this page could read the
// user's Gemini key. Links survive only when they are plain http(s) URLs.

const INLINE_SOURCE = String.raw`\*\*([^*]+)\*\*|\x60([^\x60]+)\x60|\*([^*\s][^*]*?)\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)`;

function renderInline(text, keyPrefix) {
  // A fresh regex per call: renderInline recurses for bold text, and a shared
  // global regex would have its lastIndex reset underneath the outer loop.
  const pattern = new RegExp(INLINE_SOURCE, 'g');
  const out = [];
  let last = 0;
  let n = 0;
  let match = pattern.exec(text);
  while (match) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const key = `${keyPrefix}.${n}`;
    n += 1;
    if (match[1] !== undefined) out.push(<strong key={key}>{renderInline(match[1], key)}</strong>);
    else if (match[2] !== undefined) out.push(<code key={key}>{match[2]}</code>);
    else if (match[3] !== undefined) out.push(<em key={key}>{match[3]}</em>);
    else out.push(<a key={key} href={match[5]} target="_blank" rel="noopener noreferrer nofollow">{match[4]}</a>);
    last = match.index + match[0].length;
    match = pattern.exec(text);
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const FENCE = /^\s*```/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const BULLET = /^\s*[-*+•]\s+/;
const NUMBERED = /^\s*(\d+)[.)]\s+/;
const QUOTE = /^\s*>\s?/;

const startsBlock = (line) =>
  FENCE.test(line) || HEADING.test(line) || RULE.test(line) || TABLE_ROW.test(line)
  || BULLET.test(line) || NUMBERED.test(line) || QUOTE.test(line);

const cellsOf = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

function withBreaks(lines, keyPrefix) {
  return lines.flatMap((line, i) => (
    i === 0 ? renderInline(line, `${keyPrefix}.${i}`) : [<br key={`${keyPrefix}.br${i}`} />, ...renderInline(line, `${keyPrefix}.${i}`)]
  ));
}

export default function SafeMarkdown({ text }) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const key = `b${blocks.length}`;

    if (!line.trim()) {
      i += 1;
    } else if (FENCE.test(line)) {
      const code = [];
      i += 1;
      while (i < lines.length && !FENCE.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1; // closing fence (or the end, for a reply still streaming)
      blocks.push(<pre key={key}><code>{code.join('\n')}</code></pre>);
    } else if (HEADING.test(line)) {
      const [, hashes, title] = HEADING.exec(line);
      const Tag = hashes.length <= 2 ? 'h4' : 'h5';
      blocks.push(<Tag key={key}>{renderInline(title, key)}</Tag>);
      i += 1;
    } else if (RULE.test(line)) {
      blocks.push(<hr key={key} />);
      i += 1;
    } else if (TABLE_ROW.test(line)) {
      const rows = [];
      while (i < lines.length && TABLE_ROW.test(lines[i])) {
        rows.push(lines[i]);
        i += 1;
      }
      const hasHeader = rows.length >= 2 && /^[\s|:-]+$/.test(rows[1]);
      const head = hasHeader ? cellsOf(rows[0]) : null;
      const body = (hasHeader ? rows.slice(2) : rows).map(cellsOf);
      blocks.push(
        <div key={key} className="safe-md-table">
          <table>
            {head && (
              <thead>
                <tr>{head.map((cell, c) => <th key={c}>{renderInline(cell, `${key}.h${c}`)}</th>)}</tr>
              </thead>
            )}
            <tbody>
              {body.map((cells, r) => (
                <tr key={r}>{cells.map((cell, c) => <td key={c}>{renderInline(cell, `${key}.${r}.${c}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    } else if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = NUMBERED.test(line);
      const marker = ordered ? NUMBERED : BULLET;
      const start = ordered ? Number(NUMBERED.exec(line)[1]) : undefined;
      const items = [];
      while (i < lines.length && marker.test(lines[i])) {
        items.push(lines[i].replace(marker, ''));
        i += 1;
      }
      const List = ordered ? 'ol' : 'ul';
      blocks.push(
        <List key={key} start={ordered && start !== 1 ? start : undefined}>
          {items.map((item, n) => <li key={n}>{renderInline(item, `${key}.${n}`)}</li>)}
        </List>
      );
    } else if (QUOTE.test(line)) {
      const quoted = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        quoted.push(lines[i].replace(QUOTE, ''));
        i += 1;
      }
      blocks.push(<blockquote key={key}>{withBreaks(quoted, key)}</blockquote>);
    } else {
      const paragraph = [];
      while (i < lines.length && lines[i].trim() && (paragraph.length === 0 || !startsBlock(lines[i]))) {
        paragraph.push(lines[i]);
        i += 1;
      }
      blocks.push(<p key={key}>{withBreaks(paragraph, key)}</p>);
    }
  }

  return <div className="safe-md">{blocks}</div>;
}

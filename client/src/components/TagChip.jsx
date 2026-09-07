/**
 * One tag, coloured by its kind so exam / topic / function are separable at a
 * glance. Clickable when `onClick` is given (the filter bar), static otherwise
 * (notebook cards, word cards).
 */
export default function TagChip({ tag, active = false, onClick, title }) {
  if (!tag) return null;

  const className = [
    'chip',
    'tag-chip',
    `tag-${tag.kind || 'other'}`,
    active ? 'active' : '',
    onClick ? 'clickable' : ''
  ].filter(Boolean).join(' ');

  const label = tag.label || tag.slug;

  if (!onClick) {
    return <span className={className} title={title || tag.description || tag.slug}>{label}</span>;
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => onClick(tag)}
      title={title || tag.description || tag.slug}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

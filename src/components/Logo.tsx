/** The ShowGrid mark: a fine globe grid with one city lit tally red. Same drawing as public/icon-512.png, without the tile. */
export function LogoMark({ size = 28 }: { size?: number }) {
  // latitude lines at ±11 from the centre of a radius-21 globe
  const lat = Math.sqrt(21 * 21 - 11 * 11);
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="9 9 46 46" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="32" cy="32" r="21" />
        <ellipse cx="32" cy="32" rx="7" ry="21" />
        <ellipse cx="32" cy="32" rx="14" ry="21" />
        <line x1="32" y1="11" x2="32" y2="53" />
        <line x1="11" y1="32" x2="53" y2="32" />
        <line x1={32 - lat} y1="21" x2={32 + lat} y2="21" />
        <line x1={32 - lat} y1="43" x2={32 + lat} y2="43" />
      </g>
      <circle cx="41.5" cy="20.5" r="4" fill="var(--tally)" stroke="var(--hero-bg)" strokeWidth="1.8" />
    </svg>
  );
}

/** The ShowGrid mark: a 3×3 grid with the centre square lit tally red. Same drawing as public/icon.svg, without the tile. */
export function LogoMark({ size = 26 }: { size?: number }) {
  const cells = [11.5, 26.5, 41.5];
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="8 8 48 48" aria-hidden="true">
      {cells.flatMap((y) =>
        cells.map((x) => (
          <rect
            key={`${x}-${y}`}
            x={x}
            y={y}
            width="11"
            height="11"
            rx="2"
            fill={x === 26.5 && y === 26.5 ? "var(--tally)" : "currentColor"}
          />
        )),
      )}
    </svg>
  );
}

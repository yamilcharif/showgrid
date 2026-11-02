"use client";

/** A timestamp in the viewer's own time zone ("14:05", "Tue", "Mar 3"). */
export function LocalTime({ iso, full = false }: { iso: string; full?: boolean }) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const withinWeek = now.getTime() - d.getTime() < 6 * 864e5;
  const label = full
    ? d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : sameDay
      ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
      : withinWeek
        ? d.toLocaleDateString(undefined, { weekday: "short" })
        : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  // the server renders in its own time zone; the browser corrects it
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {label}
    </time>
  );
}

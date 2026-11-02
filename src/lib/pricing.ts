/** How many day rates a rental costs, by length. Null means every day is charged. */
export interface PriceRule {
  /** ascending: rentals up to `upTo` days cost `factor` day rates */
  tiers: { upTo: number; factor: number }[];
  /** past the last tier, repeat it (e.g. weeks); otherwise each extra day costs one day */
  weekly: boolean;
}

/** Same rule as rental_factor() in supabase/migrations/0007_quotes.sql: keep the two in step. */
export function rentalFactor(rule: PriceRule | null | undefined, days: number): number {
  if (days < 1) return 0;
  const tiers = [...(rule?.tiers ?? [])].sort((a, b) => a.upTo - b.upTo);
  if (!tiers.length) return days;
  for (const t of tiers) if (days <= t.upTo) return t.factor;
  const last = tiers[tiers.length - 1];
  if (rule!.weekly) return Math.floor(days / last.upTo) * last.factor + rentalFactor(rule, days % last.upTo);
  return last.factor + (days - last.upTo);
}

/** Checks a rule an owner typed in: 1-6 tiers, growing day counts, sensible factors. */
export function cleanRule(input: unknown): PriceRule | null {
  if (!input || typeof input !== "object") return null;
  const r = input as { tiers?: unknown; weekly?: unknown };
  if (!Array.isArray(r.tiers)) return null;
  const tiers = r.tiers
    .map((t) => ({ upTo: Math.round(Number((t as { upTo?: unknown }).upTo)), factor: Number((t as { factor?: unknown }).factor) }))
    .filter((t) => t.upTo >= 1 && t.upTo <= 366 && t.factor > 0 && t.factor <= 366)
    .sort((a, b) => a.upTo - b.upTo)
    .filter((t, i, all) => i === 0 || t.upTo > all[i - 1].upTo)
    .slice(0, 6);
  return tiers.length ? { tiers, weekly: Boolean(r.weekly) } : null;
}

import { STANDS_IN, gearKind, type GearKind } from "./gearKind";
import { rentalFactor } from "./pricing";
import { ccOf, coords } from "./places";
import { RADII, dayCount, freeFor, isAccessory, miles, parseQuery, unitFor, type DateRange } from "./search";
import type { Company, Item, Place, Tech } from "./types";

/** One line of a rider or input list: "8x MAC Aura XB" → { qty: 8, name: "MAC Aura XB" }. */
export interface RiderLine {
  key: number;
  name: string;
  qty: number;
  on: boolean;
}

// ---------- reading the text ----------

// contact details, page furniture and headings that carry no gear
const NOISE = /(@|https?:|www\.|\bpage\s*\d|\bp[aá]gina\s*\d|\btel\b|\bphone\b|\bfax\b|\+\d{6,}|\b(date|fecha|venue|lugar|contact|contacto|rider|input list|stage plot|version|rev\.?)\s*:)/i;
const BULLET = /^[\s\-–•*·▪►✓☐□]+/;
const UNIT = String.raw`(?:x|×|pcs?\.?|units?|ea\.?|u\.?|uds?\.?|unidades|piezas|pzs?\.?)`;

const PATTERNS: RegExp[] = [
  // "8x MAC Aura", "8 x MAC Aura", "8 pcs MAC Aura", "8 MAC Aura"
  new RegExp(String.raw`^(\d{1,4})\s*${UNIT}?\s+(.{3,})$`, "i"),
  // "MAC Aura x8", "MAC Aura x 8", "MAC Aura - 8", "MAC Aura: 8 pcs", "MAC Aura (8)"
  new RegExp(String.raw`^(.{3,}?)\s*(?:[x×]|[-–:]|\()\s*(\d{1,4})\s*${UNIT}?\)?$`, "i"),
  // a table row whose last column is the quantity: "MAC Aura XB   Martin   8"
  /^(.{3,}?)\s{2,}(\d{1,4})$/,
];

function cleanName(s: string) {
  return s.replace(/\s+/g, " ").replace(/^[\s.:,;-]+|[\s.:,;-]+$/g, "").slice(0, 120);
}

/** Pulls gear lines with a quantity out of rider text. Duplicate names are added together. */
export function parseRider(text: string): RiderLine[] {
  const out = new Map<string, RiderLine>();
  let key = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(BULLET, "").replace(/\t/g, "  ").trim();
    if (line.length < 4 || line.length > 160 || NOISE.test(line)) continue;
    let name = "";
    let qty = 0;
    for (const [i, re] of PATTERNS.entries()) {
      const m = line.match(re);
      if (!m) continue;
      [name, qty] = i === 0 ? [m[2], Number(m[1])] : [m[1], Number(m[2])];
      break;
    }
    name = cleanName(name);
    // a name needs letters, and quantities past a few hundred are usually years or model numbers
    if (!qty || qty > 500 || !/[a-z]{2}/i.test(name) || /^\d/.test(name)) continue;
    const id = name.toLowerCase();
    const ex = out.get(id);
    if (ex) ex.qty += qty;
    else out.set(id, { key: key++, name, qty, on: true });
  }
  return [...out.values()];
}

/** Text of a PDF, rebuilt line by line from the positions of its words. Empty for scans and drawings. */
export async function pdfText(file: File): Promise<string> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
  const lines: string[] = [];
  for (let p = 1; p <= Math.min(pdf.numPages, 200); p++) {
    const page = await pdf.getPage(p);
    const { items } = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const it of items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3);
      rows.set(y, [...(rows.get(y) ?? []), { x: it.transform[4], s: it.str }]);
    }
    // top of the page first; wide gaps between words become two spaces, like table columns
    for (const y of [...rows.keys()].sort((a, b) => b - a)) {
      const words = rows.get(y)!.sort((a, b) => a.x - b.x);
      lines.push(words.map((w) => w.s.trim()).join("  "));
    }
  }
  return lines.join("\n");
}

// ---------- matching against companies nearby ----------

/** Contrarider: a similar item the company has, offered in place of what it is missing for a line. */
export interface Sub {
  it: Item;
  /** units it can stand in for: the rest of the line, up to what's free */
  have: number;
  kind: GearKind;
  /** the same kind as the line ("spot" for a spot) rather than a near one ("hybrid" for a spot) */
  same: boolean;
}

export interface LineMatch {
  line: RiderLine;
  it: Item | null;
  /** units this company can give for the line on the dates */
  have: number;
  /** what the line is, when we can tell: "spot", "wash", "hazer"… */
  kind: GearKind | null;
  /** similar gear for the units it can't give, best first */
  subs: Sub[];
}

export interface CompanyQuote {
  co: Company;
  d: number;
  matches: LineMatch[];
  /** rider units covered / units asked for */
  coverage: number;
  linesFound: number;
  /** estimated cost of the covered gear that has a public price */
  cost: number;
  /** covered lines whose price is on request */
  onRequest: number;
  /** day rates charged for the rental length, from the company's rule */
  factor: number;
}

/**
 * How well an item answers a rider line, 0-1. A word found in the item's name counts in full; one found only
 * through a synonym, the category or the description counts less. Model numbers ("XB", "MA3", "K2") must match exactly.
 */
export function lineScore(line: string, it: Item) {
  const terms = parseQuery(line).terms.filter((alts) => !FILLER.has(alts[0]));
  const sizes = sizesIn(line);
  if (!terms.length) return 0;
  const name = it.name.toLowerCase();
  const hay = `${name} ${it.cat} ${it.tags} ${it.spec}`.toLowerCase();
  // a length asked for ("8'", "10 ft", "2 m") has to be the item's length
  const itemSizes = sizesIn(name);
  let max = sizes.length * 2;
  let got = sizes.filter((n) => itemSizes.includes(n)).length * 2;
  for (const alts of terms) {
    const word = alts[0];
    const modelish = /\d/.test(word) || word.length <= 2;
    const w = modelish ? 2 : 1;
    max += w;
    if (modelish) {
      const re = new RegExp(`(^|[^a-z0-9])${word.replace(/[.+]/g, "\\$&")}([^a-z0-9]|$)`);
      got += re.test(name) ? w : re.test(hay) ? 0.7 * w : 0;
    } else {
      // the word itself or its singular ("lights" → "light")
      const literal = alts.filter((a) => a === word || a === word.slice(0, -1));
      got += literal.some((a) => name.includes(a)) ? w : alts.some((a) => hay.includes(a)) ? 0.7 * w : 0;
    }
  }
  return got / max;
}

const MIN_SCORE = 0.6;

// words that describe any piece of gear, so they shouldn't decide a match
const FILLER = new Set("maquina maquinas machine machines equipo equipos unidad unidades unit system sistema sistemas set sets pieza piezas generic generico".split(" "));

/** Lengths in a name, in feet: "8'" → 8, "10 ft" → 10, "2 m" / "2mt" → 6.6 (to one decimal). */
function sizesIn(s: string) {
  const out: number[] = [];
  for (const m of s.toLowerCase().matchAll(/(\d+(?:[.,]\d+)?)\s*('|’|ft\b|feet\b|foot\b|pies?\b|mts?\b|m\b)/g)) {
    const n = Number(m[1].replace(",", "."));
    out.push(/^m/.test(m[2]) ? Math.round(n * 32.8) / 10 : n);
  }
  return out;
}

export function quoteRider(
  lines: RiderLine[],
  { place, radiusIdx, dates, listings }: { place: Place; radiusIdx: number; dates: DateRange; listings: { companies: Company[]; items: Item[]; techs: Tech[] } },
): CompanyQuote[] {
  const want = lines.filter((l) => l.on && l.qty > 0 && l.name.trim());
  if (!want.length) return [];
  const unit = unitFor(place);
  const days = dayCount(dates);
  const byCo = new Map<string, Item[]>();
  for (const it of listings.items) if (it.listed) byCo.set(it.co, [...(byCo.get(it.co) ?? []), it]);

  const out: CompanyQuote[] = [];
  for (const co of listings.companies) {
    const d = miles(place.ll, coords(co.city, co.off));
    const inRange = place.country ? ccOf(co.city) === place.cc : (unit === "km" ? d * 1.609 : d) <= RADII[unit][radiusIdx];
    const items = byCo.get(co.id);
    if (!inRange || !items) continue;

    const matches = want.map((line): LineMatch => {
      let best: Item | null = null;
      let bestSc = MIN_SCORE;
      let bestFree = -1;
      for (const it of items) {
        const sc = lineScore(line.name, it);
        if (sc < bestSc) continue;
        const free = freeFor(it, dates);
        // a better match wins; on a tie, the one with more units free
        if (sc > bestSc || free > bestFree) [best, bestSc, bestFree] = [it, sc, free];
      }
      const have = best ? Math.min(line.qty, Math.max(0, bestFree)) : 0;
      const kind = gearKind(line.name) ?? (best ? gearKind((best as Item).name) : null);
      return { line, it: best, have, kind, subs: have < line.qty && kind ? subsFor(line, kind, best, items, line.qty - have, dates) : [] };
    });
    const found = matches.filter((m) => m.it && m.have > 0);
    if (!found.length && !matches.some((m) => m.subs.length)) continue;
    const factor = rentalFactor(co.priceRule, days);
    out.push({
      factor,
      co,
      d,
      matches,
      coverage: found.reduce((a, m) => a + m.have, 0) / want.reduce((a, l) => a + l.qty, 0),
      linesFound: found.length,
      cost: found.reduce((a, m) => a + (m.it!.pub ? m.it!.rate * m.have * factor : 0), 0),
      onRequest: found.filter((m) => !m.it!.pub || !m.it!.rate).length,
    });
  }
  // most of the rider first; a company that could cover more with its contrarider wins a tie
  const reach = (q: CompanyQuote) => summarize(q, Object.fromEntries(q.matches.filter((m) => m.subs.length).map((m) => [m.line.key, { id: m.subs[0].it.id, ok: true }]))).coverage;
  return out.sort((a, b) => b.coverage - a.coverage || reach(b) - reach(a) || a.d - b.d).slice(0, 12);
}

/** Similar items this company has free on the dates, best first: same kind before near kinds, then the most units. */
function subsFor(line: RiderLine, kind: GearKind, matched: Item | null, items: Item[], missing: number, dates: DateRange): Sub[] {
  const ok = STANDS_IN[kind];
  // truss and the like stand in only at the same length
  const sizes = sizesIn(line.name);
  const subs: (Sub & { free: number })[] = [];
  for (const it of items) {
    if (it === matched || isAccessory(it.name)) continue;
    const k = gearKind(it.name);
    if (!k || !ok.includes(k)) continue;
    if (sizes.length && !sizes.every((n) => sizesIn(it.name).includes(n))) continue;
    const free = freeFor(it, dates);
    if (free < 1) continue;
    subs.push({ it, have: Math.min(missing, free), kind: k, same: k === kind, free });
  }
  return subs
    .sort((a, b) => ok.indexOf(a.kind) - ok.indexOf(b.kind) || b.have - a.have || b.free - a.free)
    .slice(0, 4)
    .map((x) => ({ it: x.it, have: x.have, kind: x.kind, same: x.same }));
}

/** The contrarider choices for one company: line key → the substitute picked, and whether it's accepted. */
export type SubChoice = Record<number, { id: string; ok: boolean | null }>;

/**
 * A company's quote with the accepted substitutes counted in: coverage, cost and the lines to request.
 * Lines asking for the same item are added together, up to what's free.
 */
export function summarize(q: CompanyQuote, choice: SubChoice) {
  const wantUnits = q.matches.reduce((a, m) => a + m.line.qty, 0);
  const take = new Map<string, { it: Item; qty: number }>();
  const used: { m: LineMatch; sub: Sub }[] = [];
  const add = (it: Item, qty: number) => {
    const cur = take.get(it.id);
    take.set(it.id, { it, qty: (cur?.qty ?? 0) + qty });
  };
  for (const m of q.matches) {
    if (m.it && m.have > 0) add(m.it, m.have);
    const c = choice[m.line.key];
    const sub = c?.ok ? m.subs.find((s) => s.it.id === c.id) : undefined;
    if (sub) {
      add(sub.it, sub.have);
      used.push({ m, sub });
    }
  }
  const lines = [...take.values()];
  const covered = q.matches.reduce((a, m) => a + m.have, 0) + used.reduce((a, u) => a + u.sub.have, 0);
  return {
    lines,
    used,
    coverage: wantUnits ? Math.min(1, covered / wantUnits) : 0,
    cost: lines.reduce((a, l) => a + (l.it.pub ? l.it.rate * l.qty * q.factor : 0), 0),
    onRequest: lines.filter((l) => !l.it.pub || !l.it.rate).length,
  };
}

/**
 * A ballpark for the whole rider: for each line, the lowest and the median cost among the companies nearby
 * that publish a price for it, for the full quantity and the rental days. Lines nobody nearby prices publicly are counted, not guessed.
 */
export function estimateRider(quotes: CompanyQuote[], lines: RiderLine[], dates: DateRange) {
  const want = lines.filter((l) => l.on && l.qty > 0 && l.name.trim());
  const cur = quotes[0]?.co.cur ?? "USD";
  const days = dayCount(dates);
  let low = 0;
  let mid = 0;
  let priced = 0;
  for (const line of want) {
    // what the line costs at each company that prices it, with that company's rental-length rule
    const costs = quotes
      .filter((q) => q.co.cur === cur)
      .map((q) => ({ it: q.matches.find((m) => m.line.key === line.key)?.it, rule: q.co.priceRule }))
      .filter((x) => x.it && x.it.pub && x.it.rate > 0)
      .map((x) => x.it!.rate * line.qty * rentalFactor(x.rule, days))
      .sort((a, b) => a - b);
    if (!costs.length) continue;
    priced++;
    low += costs[0];
    mid += costs[Math.floor(costs.length / 2)];
  }
  return { cur, low, mid, priced, total: want.length };
}

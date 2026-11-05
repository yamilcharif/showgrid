import { rentalFactor } from "./pricing";
import { ccOf, coords } from "./places";
import { RADII, dayCount, freeFor, miles, parseQuery, unitFor, type DateRange } from "./search";
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
  for (let p = 1; p <= Math.min(pdf.numPages, 40); p++) {
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

export interface LineMatch {
  line: RiderLine;
  it: Item | null;
  /** units this company can give for the line on the dates */
  have: number;
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
      return { line, it: best, have: best ? Math.min(line.qty, Math.max(0, bestFree)) : 0 };
    });
    const found = matches.filter((m) => m.it && m.have > 0);
    if (!found.length) continue;
    const factor = rentalFactor(co.priceRule, days);
    out.push({
      co,
      d,
      matches,
      coverage: found.reduce((a, m) => a + m.have, 0) / want.reduce((a, l) => a + l.qty, 0),
      linesFound: found.length,
      cost: found.reduce((a, m) => a + (m.it!.pub ? m.it!.rate * m.have * factor : 0), 0),
      onRequest: found.filter((m) => !m.it!.pub || !m.it!.rate).length,
    });
  }
  return out.sort((a, b) => b.coverage - a.coverage || a.d - b.d).slice(0, 12);
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

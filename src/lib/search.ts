import { ccOf, coords } from "./places";
import type { Category, Company, InventorySource, Item, LatLng, Place, Tech } from "./types";

export const CAT_ABBR: Record<Category, string> = {
  Lighting: "LX",
  Audio: "SND",
  Video: "VID",
  Rigging: "RIG",
  Power: "PWR",
  Staging: "STG",
  Backline: "BKL",
  Effects: "FX",
  Other: "OTH",
};

export const SRC_LABEL: Record<InventorySource, string> = {
  rentman: "Rentman",
  flex: "Flex",
  manual: "Spreadsheet",
};

// ---------- money, distance, dates ----------

const fmtCache: Record<string, Intl.NumberFormat> = {};
export function money(n: number, cur = "USD") {
  if (!fmtCache[cur]) {
    fmtCache[cur] = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: cur,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }
  return fmtCache[cur].format(n);
}

export const RADII = { mi: [25, 50, 100, 300, Infinity], km: [50, 100, 250, 500, Infinity] } as const;
export type Unit = keyof typeof RADII;

export function unitFor(place: Place): Unit {
  return ["US", "GB", "PR"].includes(place.cc) ? "mi" : "km";
}

export function miles(a: LatLng, b: LatLng) {
  const R = 3958.8;
  const t = (x: number) => (x * Math.PI) / 180;
  const dLat = t(b[0] - a[0]);
  const dLng = t(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(t(a[0])) * Math.cos(t(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function fmtDist(d: number, unit: Unit) {
  const v = unit === "km" ? d * 1.609 : d;
  return `${Math.round(v).toLocaleString("en-US")} ${unit}`;
}

export function syncAgo(m: number) {
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return "manual upload";
}

export interface DateRange {
  from: string; // yyyy-mm-dd
  to: string;
}

export function isoIn(days: number) {
  return new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
}

export function rangeDays({ from, to }: DateRange) {
  const out: string[] = [];
  const end = new Date(`${to}T12:00`);
  for (let d = new Date(`${from}T12:00`), i = 0; d <= end && i < 62; i++, d = new Date(d.getTime() + 864e5)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out.length ? out : [from];
}

export function dayCount(r: DateRange) {
  return rangeDays(r).length;
}

export function rangeLabel({ from, to }: DateRange) {
  const a = new Date(`${from}T12:00`);
  const b = new Date(`${to}T12:00`);
  const m = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  if (from === to) return `${m(a)} ${a.getDate()}`;
  return m(a) === m(b) ? `${m(a)} ${a.getDate()}–${b.getDate()}` : `${m(a)} ${a.getDate()} – ${m(b)} ${b.getDate()}`;
}

// ---------- availability ----------
// Sample availability: extra bookings on some days, so free stock changes
// with the dates searched. Production reads this from Rentman/Flex.

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function freeFor(it: Item, r: DateRange) {
  if (it.bookings) {
    const booked = Math.max(0, ...rangeDays(r).map((day) => it.bookings![day] ?? 0));
    return Math.max(0, it.total - booked);
  }
  let m = it.total;
  for (const day of rangeDays(r)) {
    const h = hash(it.id + day);
    const booked = h % 8 === 0 ? Math.round((it.total * ((h >>> 4) % 101)) / 100) : it.total - it.qty;
    m = Math.min(m, Math.max(0, it.total - booked));
  }
  return m;
}

export function techFree(t: Tech, r: DateRange) {
  if (!t.avail) return false;
  return !rangeDays(r).some((day) => hash(t.id + day) % 9 === 0);
}

// ---------- query parsing ----------

const STOP = new Set(
  "i im i'm need needs a an the my our for some any short on of to with and or in at we are is looking look want got get have has who me us this that saturday sunday friday tonight tomorrow week weekend asap please help".split(
    " ",
  ),
);

const SYN: Record<string, string[]> = {
  light: ["lights", "lighting", "fixture"], lights: ["lighting", "fixture"], lighting: ["lights", "fixture"],
  mover: ["moving head"], movers: ["moving head"], moving: ["moving head"], heads: ["moving head"], head: ["moving head"],
  speaker: ["speaker", "pa", "line array"], speakers: ["speaker", "pa", "line array"], pa: ["line array", "speaker"],
  sound: ["audio", "speaker", "pa"], audio: ["sound", "speaker"],
  console: ["desk", "mixer"], desk: ["console"], mixer: ["console", "desk"], board: ["console", "desk"],
  led: ["led wall", "led"], wall: ["led wall"], screen: ["led wall", "projector", "screen"], projector: ["projection"],
  motor: ["chain motor", "hoist"], motors: ["chain motor", "hoist"], hoist: ["chain motor"], rigging: ["rigging", "rigger", "truss"],
  haze: ["hazer", "haze"], hazer: ["haze"], fog: ["haze", "fog"], smoke: ["haze", "fog"],
  power: ["power", "generator", "distro"], generator: ["genset"], gen: ["generator"], distro: ["power distribution"],
  mic: ["microphone", "wireless"], mics: ["microphone", "wireless"], wireless: ["rf", "wireless"],
  stage: ["staging", "deck", "stage manager"], staging: ["deck", "riser"],
  drums: ["drum kit"], guitar: ["guitar amp"], bass: ["bass amp"], keys: ["keyboard"],
  monitors: ["monitor"], tech: ["tech", "engineer"], techs: ["tech", "engineer"],
  rigger: ["rigger", "rigging"], riggers: ["rigger"], electrician: ["electrician", "power"],
  crew: ["engineer", "tech", "rigger", "programmer", "manager", "operator", "electrician"],
  ma3: ["grandma3"], grandma: ["grandma3"], ma: ["grandma3"],
};

const CREW_WORDS =
  /\b(engineer|engineers|tech|techs|programmer|rigger|riggers|operator|electrician|manager|crew|director|coordinator|a2|hand|hands)\b/;

export interface ParsedQuery {
  need: number;
  terms: string[][];
  crewy: boolean;
}

export function parseQuery(q: string): ParsedQuery {
  const lower = q.toLowerCase();
  const m = lower.match(/\b(\d{1,4})\s*(x|×|pcs|units)?\b/);
  const need = m ? parseInt(m[1], 10) : 0;
  const words = lower
    .replace(/[^a-z0-9&+.\- ]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w) && w !== "x");
  const terms = words.map((w) => {
    const alts = [w];
    if (w.length > 3 && w.endsWith("s")) alts.push(w.slice(0, -1));
    (SYN[w] ?? []).forEach((s) => alts.push(s));
    return alts;
  });
  return { need, terms, crewy: CREW_WORDS.test(lower) };
}

function score(hay: string, terms: string[][]) {
  if (!terms.length) return 1;
  let s = 0;
  for (const alts of terms) {
    let hit = 0;
    for (const a of alts) if (hay.includes(a)) hit = Math.max(hit, a === alts[0] ? 3 : 2);
    s += hit;
  }
  return s;
}

// ---------- search ----------

export interface GearHit { it: Item; co: Company; d: number; sc: number; free: number }
export interface CrewHit { t: Tech; d: number; sc: number; free: boolean }

export interface SearchInput {
  q: string;
  place: Place;
  radiusIdx: number;
  dates: DateRange;
  /** everything searchable: real listings and sample data */
  listings: { companies: Company[]; items: Item[]; techs: Tech[] };
}

export function runSearch({ q, place, radiusIdx, dates, listings }: SearchInput) {
  const P = parseQuery(q);
  const unit = unitFor(place);
  const inRange = (d: number, cc: string) => {
    if (place.country) return cc === place.cc;
    const r = RADII[unit][radiusIdx];
    return (unit === "km" ? d * 1.609 : d) <= r;
  };

  const gear: GearHit[] = [];
  const coById = new Map(listings.companies.map((c) => [c.id, c]));
  for (const it of listings.items) {
    if (!it.listed) continue;
    const co = coById.get(it.co);
    if (!co) continue;
    const d = miles(place.ll, coords(co.city, co.off));
    if (!inRange(d, ccOf(co.city))) continue;
    const sc = score(`${it.name} ${it.cat} ${it.tags} ${it.spec}`.toLowerCase(), P.terms);
    if (sc <= 0) continue;
    gear.push({ it, co, d, sc, free: freeFor(it, dates) });
  }

  const crew: CrewHit[] = [];
  for (const t of listings.techs) {
    const d = miles(place.ll, coords(t.city, t.off));
    if (!inRange(d, ccOf(t.city))) continue;
    const sc = score(`${t.name} ${t.role} ${t.skills.join(" ")}`.toLowerCase(), P.terms);
    if (sc <= 0) continue;
    crew.push({ t, d, sc, free: techFree(t, dates) });
  }

  // free on the chosen dates first (enough to cover the quantity asked for, when there is one),
  // then best match, then closest
  const covers = (g: GearHit) => (P.need ? g.free >= P.need : g.free > 0);
  gear.sort((a, b) => Number(!covers(a)) - Number(!covers(b)) || Number(!a.free) - Number(!b.free) || b.sc - a.sc || a.d - b.d);
  crew.sort((a, b) => Number(!a.free) - Number(!b.free) || b.sc - a.sc || a.d - b.d);
  return { P, gear, crew, unit };
}

export function statsFor({ companies, items, techs }: SearchInput["listings"]) {
  return {
    companies: companies.length,
    units: items.reduce((a, i) => a + i.qty, 0),
    techs: techs.length,
    countries: new Set([...companies.map((c) => ccOf(c.city)), ...techs.map((t) => ccOf(t.city))]).size,
  };
}

/** minutes since an ISO timestamp, for "synced 4 min ago" */
export function minutesSince(iso: string) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 6e4));
}

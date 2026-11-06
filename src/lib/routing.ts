/**
 * Tour routing: show dates and cities in, flights between them out, with a ballpark fare for each party.
 * Fares are estimates from the distance, the cabin and how soon the flight is; each one can be replaced by a real fare.
 */
import { AIRPORTS, findAirport, miles, type Airport } from "./airports";

export type Cabin = "eco" | "prem" | "biz";

export interface Stop {
  id: string;
  /** yyyy-mm-dd */
  date: string;
  /** as written: "Miami, FL", "Bogotá" */
  city: string;
  venue: string;
}

export interface Party {
  id: string;
  name: string;
  pax: number;
  cabin: Cabin;
  color: string;
}

/** What the member changed on one party's flight; anything left out comes from the routing and the estimate. */
export interface FlightEdit {
  date?: string;
  time?: string;
  airline?: string;
  flight?: string;
  cabin?: Cabin;
  /** fare per person, in USD */
  price?: number | null;
  /** this party doesn't take this flight */
  skip?: boolean;
}

export interface Routing {
  /** where the tour leaves from and comes back to; empty for none */
  home: string;
  stops: Stop[];
  parties: Party[];
  /** "legKey:partyId" → changes */
  edits: Record<string, FlightEdit>;
}

export const PARTY_COLORS = ["#e53935", "#1e88e5", "#43a047", "#fb8c00", "#8e24aa", "#00897b", "#6d4c41", "#3949ab"];

export const ROUTING_START: Routing = {
  home: "",
  stops: [],
  parties: [
    { id: "a", name: "Party A", pax: 1, cabin: "biz", color: PARTY_COLORS[0] },
    { id: "b", name: "Party B", pax: 4, cabin: "prem", color: PARTY_COLORS[1] },
    { id: "c", name: "Party C", pax: 12, cabin: "eco", color: PARTY_COLORS[2] },
  ],
  edits: {},
};

// ---------- reading a routing ----------

const MONTHS: Record<string, number> = {
  jan: 1, ene: 1, feb: 2, mar: 3, apr: 4, abr: 4, may: 5, jun: 6, jul: 7, aug: 8, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dec: 12, dic: 12,
};
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : "");

/**
 * A date as tours write them: 2026-11-20, 11/20/2026, 20/11/2026, Nov 20, 20 Nov 2026, Fri Nov 20, 20-nov.
 * Day and month are told apart by which can't be a month; otherwise month first (US style) unless dayFirst.
 */
export function parseDate(text: string, year: number, dayFirst = false): string {
  const s = text.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  let m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/\b(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?\b/);
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : year;
    const [a, b] = [+m[1], +m[2]];
    const dFirst = a > 12 || (b <= 12 && dayFirst);
    return dFirst ? iso(y, b, a) : iso(y, a, b);
  }
  m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+(?:de\s+)?([a-z]{3})[a-z]*\.?(?:[\s,-]+(?:de\s+)?(\d{4}))?/);
  if (m && MONTHS[m[2]]) return iso(m[3] ? +m[3] : year, MONTHS[m[2]], +m[1]);
  m = s.match(/\b([a-z]{3})[a-z]*\.?[\s-]+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/);
  if (m && MONTHS[m[1]]) return iso(m[3] ? +m[3] : year, MONTHS[m[1]], +m[2]);
  return "";
}

let n = 0;
export const newId = () => `${Date.now().toString(36)}${(n++).toString(36)}`;

/**
 * Stops from a routing table (Excel, CSV, PDF or pasted): in each row the date is the cell that reads as a date,
 * the city is the cell where an airport is found, and the rest is the venue. Rows without both are skipped.
 */
export function readStops(rows: string[][], year = new Date().getFullYear()): Stop[] {
  // day-first if any date in the file can only be day-first (13/11, 20/11…)
  const dayFirst = rows.some((r) => r.some((c) => /\b(1[3-9]|2\d|3[01])[/.-](0?[1-9]|1[0-2])\b/.test(c)));
  const stops: Stop[] = [];
  for (const r of rows) {
    const cells = r.map((c) => c.trim()).filter(Boolean);
    let date = "";
    let dateCell = -1;
    cells.forEach((c, i) => {
      if (date) return;
      const d = parseDate(c, year, dayFirst);
      if (d) [date, dateCell] = [d, i];
    });
    if (!date) continue;
    // the city: the cell that names an airport's city (not the date cell)
    let city = "";
    let cityCell = -1;
    cells.forEach((c, i) => {
      if (city || i === dateCell) return;
      if (findAirport(c)) [city, cityCell] = [c, i];
    });
    if (!city) continue;
    const venue = cells.filter((_, i) => i !== dateCell && i !== cityCell && !/^(mon|tue|wed|thu|fri|sat|sun|lun|mar|mie|jue|vie|sab|dom)[a-z]*\.?$/i.test(cells[i])).join(" · ");
    stops.push({ id: newId(), date, city, venue: venue.slice(0, 120) });
  }
  return stops.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- flights ----------

export interface Leg {
  key: string;
  from: Airport | null;
  to: Airport | null;
  fromText: string;
  toText: string;
  /** suggested travel day */
  date: string;
  miles: number | null;
}

const addDays = (d: string, k: number) => {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + k);
  return t.toISOString().slice(0, 10);
};

/**
 * Flights between consecutive cities (and from and back to home, if set). Same-city days need no flight.
 * The travel day is the day after the show, unless the next show is the very next day: then the morning of it.
 */
export function legsOf(r: Routing): Leg[] {
  const stops = [...r.stops].sort((a, b) => a.date.localeCompare(b.date));
  const points: { text: string; date: string; ap: Airport | null }[] = stops.map((s) => ({ text: s.city, date: s.date, ap: findAirport(s.city) }));
  const home = r.home.trim() ? findAirport(r.home) : null;
  const legs: Leg[] = [];
  const push = (fromText: string, from: Airport | null, toText: string, to: Airport | null, date: string, i: number) => {
    if (from && to && from.code === to.code) return;
    legs.push({ key: `${i}-${from?.code ?? fromText}-${to?.code ?? toText}`, from, to, fromText, toText, date, miles: from && to ? Math.round(miles(from, to)) : null });
  };
  if (r.home.trim() && points.length) push(r.home, home, points[0].text, points[0].ap, addDays(points[0].date, -1), 0);
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const next = points[i];
    const gap = Math.round((Date.parse(next.date) - Date.parse(prev.date)) / 864e5);
    push(prev.text, prev.ap, next.text, next.ap, gap <= 1 ? next.date : addDays(prev.date, 1), i);
  }
  if (r.home.trim() && points.length) {
    const last = points[points.length - 1];
    push(last.text, last.ap, r.home, home, addDays(last.date, 1), points.length);
  }
  return legs;
}

/**
 * A ballpark one-way fare per person, in USD: by distance and cabin, more expensive the closer the flight is.
 * Economy runs about $160 for 300 mi, $270 for 1,000 mi, $430 coast to coast and $700 across the Atlantic.
 */
export function estimateFare(mi: number | null, cabin: Cabin, date: string, today = new Date().toISOString().slice(0, 10)) {
  if (mi == null) return null;
  const eco = mi <= 500 ? 120 + 0.12 * mi : mi <= 1500 ? 150 + 0.12 * mi : mi <= 3000 ? 180 + 0.1 * mi : 250 + 0.09 * mi;
  // business on short flights is a domestic first seat; long haul is a full lie-flat cabin
  const cabinFactor = cabin === "eco" ? 1 : cabin === "prem" ? 1.8 : mi < 1500 ? 2.6 : 4;
  const days = Math.round((Date.parse(date) - Date.parse(today)) / 864e5);
  const soon = days < 0 ? 1 : days <= 7 ? 1.6 : days <= 14 ? 1.35 : days <= 21 ? 1.15 : 1;
  return Math.round((eco * cabinFactor * soon) / 5) * 5;
}

/** Each party's flight on a leg: the routing's suggestion with the member's changes on top. */
export function flightOf(r: Routing, leg: Leg, party: Party) {
  const e = r.edits[`${leg.key}:${party.id}`] ?? {};
  const cabin = e.cabin ?? party.cabin;
  const date = e.date ?? leg.date;
  const estimate = estimateFare(leg.miles, cabin, date);
  const price = e.price ?? estimate;
  return { ...e, cabin, date, estimate, price, own: e.price != null, total: e.skip || price == null ? 0 : price * party.pax };
}

/** Totals per party and for the whole routing; how many fares are real and how many estimated. */
export function totals(r: Routing) {
  const legs = legsOf(r);
  const per = new Map(r.parties.map((p) => [p.id, 0]));
  let own = 0;
  let est = 0;
  let unknown = 0;
  for (const leg of legs)
    for (const p of r.parties) {
      const f = flightOf(r, leg, p);
      if (f.skip) continue;
      if (f.price == null) unknown++;
      else if (f.own) own++;
      else est++;
      per.set(p.id, (per.get(p.id) ?? 0) + f.total);
    }
  return { legs, per, all: [...per.values()].reduce((a, b) => a + b, 0), own, est, unknown, seats: legs.length * r.parties.reduce((a, p) => a + p.pax, 0) };
}

/** A search for real fares on this leg and date, to check the estimate. */
export function fareSearchUrl(leg: Leg, date: string, cabin: Cabin) {
  const from = leg.from?.code ?? leg.fromText;
  const to = leg.to?.code ?? leg.toText;
  const cls = cabin === "eco" ? "economy" : cabin === "prem" ? "premium economy" : "business";
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${from} to ${to} on ${date} one way ${cls}`)}`;
}

/** The routing as CSV: one row per party per flight. */
export function routingCsv(r: Routing) {
  const cell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const out = [["Date", "From", "To", "Miles", "Party", "People", "Cabin", "Airline", "Flight", "Time", "Fare per person (USD)", "Fare source", "Total (USD)"]];
  for (const leg of legsOf(r))
    for (const p of r.parties) {
      const f = flightOf(r, leg, p);
      if (f.skip) continue;
      out.push([
        f.date,
        leg.from?.code ?? leg.fromText,
        leg.to?.code ?? leg.toText,
        String(leg.miles ?? ""),
        p.name,
        String(p.pax),
        f.cabin === "eco" ? "Economy" : f.cabin === "prem" ? "Premium economy" : "Business",
        f.airline ?? "",
        f.flight ?? "",
        f.time ?? "",
        f.price == null ? "" : String(f.price),
        f.own ? "entered" : f.price == null ? "" : "estimate",
        String(f.total),
      ]);
    }
  return "﻿" + out.map((row) => row.map(cell).join(",")).join("\r\n");
}

export { AIRPORTS };

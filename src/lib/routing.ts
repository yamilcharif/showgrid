/**
 * Tour routing: show dates and cities in, flights between them out, with a ballpark fare for each party.
 * Fares are estimates from the distance, the cabin and how soon the flight is; each one can be replaced by a real fare.
 */
import { AIRPORTS, findAirport, miles, type Airport } from "./airports";
import { allowedCodes, type AirlinePrefs } from "./airlines";

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

/** A tour bus (or van, or sprinter) on the road between cities: paid by the mile, by the day and for its drivers. */
export interface Vehicle {
  id: string;
  name: string;
  /** a bus carries people; trucks carry the show */
  kind?: "bus" | "truck";
  /** trucks: the count comes from the truck pack */
  fromPack?: boolean;
  /** how many of them */
  count: number;
  /** USD per mile driven */
  perMile: number;
  /** USD per day for the vehicle itself, if it's leased by the day */
  dayRate: number;
  /** USD per day for each driver */
  driverDay: number;
  drivers: number;
  /** days to pay; null counts them from the first leg it drives to the last */
  days: number | null;
  /** parties on board: they don't fly the legs it drives */
  rides: string[];
  /** keys of the legs it doesn't drive */
  off: string[];
}

export interface Routing {
  /** where the tour leaves from and comes back to; empty for none */
  home: string;
  stops: Stop[];
  parties: Party[];
  /** "legKey:partyId" → changes */
  edits: Record<string, FlightEdit>;
  ground?: Vehicle[];
  /** road miles per leg, where the member knows them better than the estimate */
  roadMiles?: Record<string, number>;
  /** which airlines the tour accepts */
  airlines?: AirlinePrefs;
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
  ground: [],
  roadMiles: {},
};

export const newVehicle = (name: string, rides: string[] = []): Vehicle => ({
  id: newId(),
  name,
  count: 1,
  perMile: 4,
  dayRate: 0,
  driverDay: 350,
  drivers: 1,
  days: null,
  rides,
  off: [],
});

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

export const newTruck = (name: string, count: number, fromPack: boolean): Vehicle => ({
  ...newVehicle(name),
  kind: "truck",
  fromPack,
  count: Math.max(1, count),
  perMile: 3.5,
  driverDay: 300,
});

/** Roads wind: driving is about a fifth longer than the straight line between two cities. */
export const ROAD_FACTOR = 1.2;

export const roadMilesOf = (r: Routing, leg: Leg) => r.roadMiles?.[leg.key] ?? (leg.miles == null ? null : Math.round(leg.miles * ROAD_FACTOR));

/** A vehicle's cost over the tour: miles driven, days of the vehicle and of its drivers, times how many there are. */
export function groundOf(r: Routing, v: Vehicle, legs = legsOf(r)) {
  const on = legs.filter((l) => !v.off.includes(l.key));
  const mi = on.reduce((a, l) => a + (roadMilesOf(r, l) ?? 0), 0);
  const unknown = on.filter((l) => roadMilesOf(r, l) == null).length;
  const dates = on.map((l) => l.date).sort();
  const autoDays = dates.length ? Math.round((Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 864e5) + 1 : 0;
  const days = v.days ?? autoDays;
  const miles = mi * v.perMile * v.count;
  const drivers = days * v.drivers * v.driverDay * v.count;
  const vehicle = days * v.dayRate * v.count;
  return { legs: on, mi, unknown, days, autoDays, miles, drivers, vehicle, total: miles + drivers + vehicle };
}

/** Whether a party rides a vehicle on this leg instead of flying. */
const byRoad = (r: Routing, leg: Leg, party: Party) => (r.ground ?? []).some((v) => v.rides.includes(party.id) && !v.off.includes(leg.key));

/** Each party's flight on a leg: the routing's suggestion with the member's changes on top. */
export function flightOf(r: Routing, leg: Leg, party: Party) {
  const e = { skip: byRoad(r, leg, party) || undefined, ...(r.edits[`${leg.key}:${party.id}`] ?? {}) };
  const cabin = e.cabin ?? party.cabin;
  const date = e.date ?? leg.date;
  const estimate = estimateFare(leg.miles, cabin, date);
  const price = e.price ?? estimate;
  return { ...e, cabin, date, estimate, price, own: e.price != null, bus: !!e.skip && byRoad(r, leg, party), total: e.skip || price == null ? 0 : price * party.pax };
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
  const all = [...per.values()].reduce((a, b) => a + b, 0);
  const ground = (r.ground ?? []).map((v) => ({ v, ...groundOf(r, v, legs) }));
  const groundAll = ground.reduce((a, g) => a + g.total, 0);
  return { legs, per, all, ground, groundAll, grand: all + groundAll, own, est, unknown, seats: legs.length * r.parties.reduce((a, p) => a + p.pax, 0) };
}

// ---------- Google Flights links ----------
// Google Flights reads its search from "tfs": a small protobuf, base64-encoded. Each flight carries its date, its two
// airports and the airlines allowed; then the passengers, the cabin and the kind of trip.

const varint = (n: number) => {
  const out: number[] = [];
  while (n > 127) {
    out.push((n & 127) | 128);
    n >>>= 7;
  }
  out.push(n);
  return out;
};
const bytesOf = (no: number, b: number[]) => [...varint((no << 3) | 2), ...varint(b.length), ...b];
const textOf = (no: number, v: string) => bytesOf(no, [...new TextEncoder().encode(v)]);
const numOf = (no: number, v: number) => [...varint(no << 3), ...varint(v)];
const SEAT: Record<Cabin, number> = { eco: 1, prem: 2, biz: 3 };

/** Google Flights caps a search at 9 passengers and a multi-city search at 5 flights. */
export const GF_MAX_PAX = 9;
export const GF_MAX_LEGS = 5;

function flightsUrl(flights: { date: string; from: string; to: string }[], pax: number, cabin: Cabin, airlines: string[]) {
  const info = [
    ...flights.flatMap((f) =>
      bytesOf(3, [...textOf(2, f.date), ...airlines.flatMap((a) => textOf(6, a)), ...bytesOf(13, textOf(2, f.from)), ...bytesOf(14, textOf(2, f.to))]),
    ),
    ...Array.from({ length: Math.max(1, Math.min(GF_MAX_PAX, pax)) }, () => numOf(8, 1)).flat(),
    ...numOf(9, SEAT[cabin]),
    ...numOf(19, flights.length > 1 ? 3 : 2),
  ];
  const tfs = btoa(String.fromCharCode(...info));
  return `https://www.google.com/travel/flights/search?tfs=${encodeURIComponent(tfs)}&curr=USD`;
}

/** A search for real fares on this leg, date and cabin, for the party's people and the airlines the tour accepts. */
export function fareSearchUrl(r: Routing, leg: Leg, date: string, cabin: Cabin, pax: number) {
  if (!leg.from || !leg.to) {
    const cls = cabin === "eco" ? "economy" : cabin === "prem" ? "premium economy" : "business";
    return `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${leg.fromText} to ${leg.toText} on ${date} one way ${cls}`)}`;
  }
  return flightsUrl([{ date, from: leg.from.code, to: leg.to.code }], pax, cabin, allowedCodes(r.airlines));
}

/**
 * The whole routing as multi-city searches for one party: the flights it takes, in order, with its dates and class.
 * Split in parts when the tour has more flights than one search holds.
 */
export function multiCityUrls(r: Routing, party: Party) {
  const mine = legsOf(r)
    .map((leg) => ({ leg, f: flightOf(r, leg, party) }))
    .filter(({ leg, f }) => !f.skip && leg.from && leg.to)
    .map(({ leg, f }) => ({ date: f.date, from: leg.from!.code, to: leg.to!.code }));
  const parts: { url: string; from: string; to: string; n: number }[] = [];
  for (let i = 0; i < mine.length; i += GF_MAX_LEGS) {
    const chunk = mine.slice(i, i + GF_MAX_LEGS);
    // one class per search: the party's own
    parts.push({ url: flightsUrl(chunk, party.pax, party.cabin, allowedCodes(r.airlines)), from: chunk[0].from, to: chunk[chunk.length - 1].to, n: chunk.length });
  }
  return parts;
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
  const ground = (r.ground ?? []).map((v) => ({ v, ...groundOf(r, v) }));
  if (ground.length) {
    out.push([], ["Ground", "Vehicles", "Legs", "Road miles", "USD per mile", "Days", "USD per day", "Drivers", "USD per driver per day", "Miles (USD)", "Vehicle days (USD)", "Drivers (USD)", "Total (USD)"]);
    for (const g of ground)
      out.push([g.v.name, String(g.v.count), g.legs.map((l) => `${l.from?.code ?? l.fromText}-${l.to?.code ?? l.toText}`).join(" "), String(g.mi), String(g.v.perMile), String(g.days), String(g.v.dayRate), String(g.v.drivers), String(g.v.driverDay), String(Math.round(g.miles)), String(Math.round(g.vehicle)), String(Math.round(g.drivers)), String(Math.round(g.total))]);
  }
  return "﻿" + out.map((row) => row.map(cell).join(",")).join("\r\n");
}

export { AIRPORTS };

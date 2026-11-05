import { gearKind, type GearKind } from "./gearKind";

/**
 * Rough street prices to buy gear new, in US dollars, for estimating a rental when nobody nearby publishes one.
 * Known models first, then a typical price for the kind of gear. These are ballparks, not quotes.
 */
const MODELS: [RegExp, number][] = [
  [/grand ?ma ?3.*full|ma3 full/, 80000],
  [/grand ?ma ?3.*light|ma3 light/, 55000],
  [/grand ?ma ?3.*compact ?xt/, 38000],
  [/grand ?ma ?3.*compact|ma3 compact/, 25000],
  [/grand ?ma ?2.*full/, 50000],
  [/grand ?ma ?2.*light/, 35000],
  [/command ?wing|fader ?wing|onpc/, 8000],
  [/full ?boar|hog ?4/, 45000],
  [/viper/, 20000],
  [/mega ?pointe/, 16000],
  [/\bpointe\b/, 9000],
  [/bmfl/, 25000],
  [/iforte/, 25000],
  [/robospot/, 15000],
  [/\bforte\b/, 28000],
  [/esprite/, 18000],
  [/sharpy ?plus/, 9000],
  [/sharpy/, 6000],
  [/aura ?pxl/, 8000],
  [/aura/, 6000],
  [/encore/, 15000],
  [/spiider/, 9000],
  [/jdc ?burst/, 4000],
  [/\bjdc/, 6500],
  [/x4 ?bar/, 4500],
  [/colorado/, 1800],
  [/\bsm ?5[78]\b/, 110],
  [/beta ?5[78]/, 180],
  [/axient/, 6000],
  [/ulx-?d|qlx-?d/, 3000],
  [/digico ?sd ?7/, 150000],
  [/digico ?sd ?(10|5)/, 90000],
  [/digico ?sd ?(12|9|11)/, 45000],
  [/s6l/, 100000],
  [/yamaha ?(cl ?5|pm)/, 45000],
  [/yamaha ?(cl|ql)/, 30000],
  [/\bm32\b/, 4500],
  [/\bx32\b/, 3000],
  [/\bk2\b/, 25000],
  [/\bk1\b/, 30000],
  [/\bkara\b/, 12000],
  [/\bks ?28\b|sb ?28/, 10000],
  [/df-?50/, 1500],
  [/\bmdg\b/, 5500],
  [/unique ?2/, 2000],
  [/smaze|\bf7\b/, 1500],
  [/2 ?t(on)?\b.*motor|motor.*2 ?t(on)?\b/, 5000],
  [/1 ?t(on)?\b.*motor|motor.*1 ?t(on)?\b|lodestar/, 3500],
  [/(half|1\/2) ?t(on)?\b/, 2800],
];

const BY_KIND: Record<GearKind, number> = {
  followspot: 8000,
  hybrid: 10000,
  beam: 6000,
  wash: 7000,
  ellipsoidal: 2500,
  spot: 12000,
  blinder: 1500,
  strobe: 3000,
  ledbar: 2500,
  par: 800,
  lightConsole: 30000,
  audioConsole: 30000,
  wirelessMic: 2500,
  wiredMic: 150,
  hazer: 2000,
  fog: 1000,
  sub: 8000,
  lineArray: 15000,
  wedge: 4000,
  speaker: 4000,
  motor: 3000,
  truss: 600,
  ledwall: 1500,
  projector: 20000,
};

/** Share of the purchase price charged per rental day. */
export const DAY_RATE_SHARE = 0.04;

/** What one unit costs to buy, roughly, or null when we can't tell what it is. */
export function purchaseValue(name: string): number | null {
  const s = name.toLowerCase();
  for (const [re, usd] of MODELS) if (re.test(s)) return usd;
  const kind = gearKind(s);
  if (!kind) return null;
  // truss is priced by length: a 10' section is the reference
  if (kind === "truss") {
    const ft = s.match(/(\d+(?:\.\d+)?)\s*('|ft|feet|pies)/);
    return ft ? Math.round((60 * Number(ft[1])) / 10) * 10 : BY_KIND.truss;
  }
  return BY_KIND[kind];
}

/** Estimated day rate: 4% of the purchase price ($1,000 to buy → $40 a day). */
export function estimatedRate(name: string): { rate: number; value: number } | null {
  const value = purchaseValue(name);
  return value ? { rate: Math.round(value * DAY_RATE_SHARE), value } : null;
}

/**
 * Truck loading: road cases placed on the floor of a truck seen from above, stacked where they overlap.
 * Everything is in inches. x runs from the front wall (behind the cab) to the doors, y across the width, z up.
 */

export interface TruckSize {
  /** "16", "21", "26", "53" or "custom" */
  key: string;
  l: number;
  w: number;
  h: number;
  /** most it should carry, in pounds; 0 when unknown */
  payload?: number;
  /** a low bar across the truck (a door header, a load bar): the height under it, how far it is from the doors and how deep */
  bar?: LowBar | null;
}

export interface LowBar {
  clear: number;
  from: number;
  depth: number;
}

/** Usual inside dimensions; trucks vary, so the planner lets you change them. */
export const TRUCKS: TruckSize[] = [
  { key: "16", l: 192, w: 90, h: 90, payload: 3500 },
  { key: "21", l: 252, w: 96, h: 96, payload: 5500 },
  { key: "26", l: 312, w: 98, h: 99, payload: 10000 },
  { key: "53", l: 630, w: 100, h: 108, payload: 44000 },
];

export interface CaseType {
  id: string;
  name: string;
  l: number;
  w: number;
  h: number;
  /** pounds, case and contents */
  wt?: number;
  /** the department it belongs to (lighting, audio…), whose color it takes */
  group?: string | null;
  qty: number;
  color: string;
}

export interface Placed {
  uid: string;
  type: string;
  x: number;
  y: number;
  z: number;
  /** turned 90°: length runs across the truck */
  rot: boolean;
  /** tipped over: 90° stands it on its end (length becomes height), 180° is upside down (wheels up) */
  tilt?: 0 | 90 | 180;
}

export const CASE_COLORS = ["#e4572e", "#4c9be8", "#f2c14e", "#59c9a5", "#b07fe0", "#ff8fab", "#90be6d", "#f3a712", "#5dd9c1", "#c9ada7"];

/** Common road cases, to start from. Sizes are typical; edit them to match yours. */
export const CASE_PRESETS: Omit<CaseType, "id" | "qty" | "color">[] = [
  { name: "Moving head 2-way", l: 47, w: 24, h: 35, wt: 170 },
  { name: "Console case", l: 66, w: 38, h: 22, wt: 190 },
  { name: "Truss 10' (12\" box)", l: 120, w: 12, h: 12, wt: 50 },
  { name: "Motor case 1T", l: 24, w: 24, h: 30, wt: 150 },
  { name: "Cable trunk", l: 48, w: 24, h: 30, wt: 250 },
  { name: "Power distro", l: 30, w: 24, h: 46, wt: 300 },
  { name: "LED wall case (6 panels)", l: 44, w: 28, h: 46, wt: 290 },
  { name: "Speaker cart", l: 56, w: 30, h: 48, wt: 450 },
];

/** Footprint of a placed case on the floor plan. */
export function footprint(p: Placed, t: CaseType) {
  // standing on its end, the length becomes the height
  const up = p.tilt === 90;
  const l = up ? t.h : t.l;
  return { x: p.x, y: p.y, l: p.rot ? t.w : l, w: p.rot ? l : t.w, h: up ? t.l : t.h };
}

const overlaps = (a: { x: number; y: number; l: number; w: number }, b: { x: number; y: number; l: number; w: number }) =>
  a.x < b.x + b.l - 0.01 && b.x < a.x + a.l - 0.01 && a.y < b.y + b.w - 0.01 && b.y < a.y + a.w - 0.01;

/**
 * Gravity: every case rests on the floor or on the highest case under it. Cases are settled from the bottom up,
 * so one dropped on top of a stack (given a high z) lands on it, and taking a case out lets the ones above come down.
 */
export function settle(placed: Placed[], types: Map<string, CaseType>): Placed[] {
  const order = [...placed].sort((a, b) => a.z - b.z);
  const done: (Placed & { top: number; f: ReturnType<typeof footprint> })[] = [];
  for (const p of order) {
    const t = types.get(p.type);
    if (!t) continue;
    const f = footprint(p, t);
    const z = Math.max(0, ...done.filter((d) => overlaps(f, d.f)).map((d) => d.top));
    done.push({ ...p, z, top: z + f.h, f });
  }
  const byUid = new Map(done.map((d) => [d.uid, d]));
  return placed.filter((p) => byUid.has(p.uid)).map((p) => ({ ...p, z: byUid.get(p.uid)!.z }));
}

/** Where a dragged case would rest if dropped here: the top of whatever is under it. */
export function restingZ(f: { x: number; y: number; l: number; w: number }, placed: Placed[], types: Map<string, CaseType>, skip?: string) {
  let z = 0;
  for (const p of placed) {
    const t = types.get(p.type);
    if (!t || p.uid === skip) continue;
    const g = footprint(p, t);
    if (overlaps(f, g)) z = Math.max(z, p.z + g.h);
  }
  return z;
}

/** Keeps a case inside the walls and pulls its edges onto nearby walls and case edges, so rows line up. */
export function snap(
  f: { x: number; y: number; l: number; w: number },
  truck: TruckSize,
  placed: Placed[],
  types: Map<string, CaseType>,
  skip?: string,
  reach = 4,
) {
  const xs = [0, truck.l - f.l];
  const ys = [0, truck.w - f.w];
  for (const p of placed) {
    const t = types.get(p.type);
    if (!t || p.uid === skip) continue;
    const g = footprint(p, t);
    xs.push(g.x + g.l, g.x - f.l, g.x);
    ys.push(g.y + g.w, g.y - f.w, g.y);
  }
  const near = (v: number, cands: number[]) => {
    let best = Math.round(v);
    let d = reach;
    for (const c of cands) if (Math.abs(c - v) < d) [best, d] = [c, Math.abs(c - v)];
    return best;
  };
  const clamp = (v: number, max: number) => Math.min(Math.max(0, v), Math.max(0, max));
  return { x: clamp(near(f.x, xs), truck.l - f.l), y: clamp(near(f.y, ys), truck.w - f.w) };
}

/** The ceiling over a case: the truck's height, or the clearance under the low bar where the case reaches it. */
export function ceilingOver(f: { x: number; l: number }, truck: TruckSize) {
  const b = truck.bar;
  if (!b) return truck.h;
  const x0 = truck.l - b.from - b.depth;
  const x1 = truck.l - b.from;
  return f.x < x1 - 0.01 && x0 < f.x + f.l - 0.01 ? Math.min(truck.h, b.clear) : truck.h;
}

/** Whether a case at height z hits the ceiling or the low bar. */
export const tooHigh = (f: { x: number; l: number; h: number }, z: number, truck: TruckSize) => z + f.h > ceilingOver(f, truck) + 0.01;

/** Space the low bar takes away, in cubic inches. */
export const barLoss = (truck: TruckSize) => (truck.bar ? Math.max(0, truck.bar.depth) * truck.w * Math.max(0, truck.h - truck.bar.clear) : 0);

export function stats(truck: TruckSize, placed: Placed[], types: Map<string, CaseType>) {
  let floor = 0;
  let vol = 0;
  let depth = 0;
  let tooTall = 0;
  let weight = 0;
  let front = 0;
  for (const p of placed) {
    const t = types.get(p.type);
    if (!t) continue;
    const f = footprint(p, t);
    if (p.z === 0) floor += f.l * f.w;
    vol += f.l * f.w * f.h;
    depth = Math.max(depth, f.x + f.l);
    if (tooHigh(f, p.z, truck)) tooTall++;
    weight += t.wt ?? 0;
    if (f.x + f.l / 2 < truck.l / 2) front += t.wt ?? 0;
  }
  return {
    floor: floor / (truck.l * truck.w),
    // of the space you can actually use: the truck minus what the low bar takes
    volume: vol / Math.max(1, truck.l * truck.w * truck.h - barLoss(truck)),
    lost: barLoss(truck),
    /** how far from the front wall the load reaches */
    depth,
    tooTall,
    /** pounds in the truck, and the share of it in the front half */
    weight,
    frontShare: weight ? front / weight : 0,
    over: truck.payload ? Math.max(0, weight - truck.payload) : 0,
  };
}

/** 1,250 lb, or 567 kg in metric. */
export function fmtWeight(lb: number, metric: boolean) {
  return metric ? `${Math.round(lb * 0.4536).toLocaleString("en-US")} kg` : `${Math.round(lb).toLocaleString("en-US")} lb`;
}

/**
 * The order cases go in: front of the truck first, and a case only after the cases it sits on.
 * Returns placed uids in loading order.
 */
export function loadOrder(placed: Placed[], types: Map<string, CaseType>): string[] {
  const items = placed
    .map((p) => ({ p, f: footprint(p, types.get(p.type)!) }))
    .filter((x) => x.f)
    .sort((a, b) => Math.round(a.f.x / 12) - Math.round(b.f.x / 12) || a.p.z - b.p.z || a.f.y - b.f.y);
  const below = (a: (typeof items)[number]) =>
    items.filter((b) => b !== a && b.p.z + b.f.h <= a.p.z + 0.01 && overlaps(a.f, b.f)).map((b) => b.p.uid);
  const done = new Set<string>();
  const out: string[] = [];
  while (out.length < items.length) {
    const next = items.find((a) => !done.has(a.p.uid) && below(a).every((u) => done.has(u)));
    if (!next) break;
    done.add(next.p.uid);
    out.push(next.p.uid);
  }
  return out;
}

export type Zone = "front" | "mid" | "back";
export type Side = "driver" | "center" | "passenger";

/**
 * Where a case goes, in words a crew can follow: a third of the truck, a side, and floor or stack level.
 * y = 0 is the passenger side, y = width the driver side (US trucks, cab facing forward).
 */
export function position(p: Placed, t: CaseType, truck: TruckSize, placed: Placed[], types: Map<string, CaseType>) {
  const f = footprint(p, t);
  const cx = (f.x + f.l / 2) / truck.l;
  const cy = (f.y + f.w / 2) / truck.w;
  const zone: Zone = cx < 1 / 3 ? "front" : cx < 2 / 3 ? "mid" : "back";
  const side: Side = cy < 0.36 ? "passenger" : cy > 0.64 ? "driver" : "center";
  // the stack level: 1 on the floor, then one more for every case it rests on
  let level = 1;
  let on: string | null = null;
  let cur = { p, f };
  for (let guard = 0; cur.p.z > 0 && guard < 20; guard++) {
    const under = placed
      .filter((q) => q.uid !== cur.p.uid)
      .map((q) => ({ p: q, f: footprint(q, types.get(q.type)!) }))
      .find((q) => Math.abs(q.p.z + q.f.h - cur.p.z) < 0.01 && overlaps(cur.f, q.f));
    if (!under) break;
    if (level === 1) on = under.p.uid;
    level++;
    cur = under;
  }
  return { zone, side, level, on, tilt: p.tilt ?? 0 };
}

/** 98 → 8' 2"; in metric, 98 → 249 cm. */
export function fmtLen(inches: number, metric: boolean) {
  if (metric) return `${Math.round(inches * 2.54)} cm`;
  const ft = Math.floor(Math.round(inches) / 12);
  const inch = Math.round(inches) - ft * 12;
  return ft ? `${ft}'${inch ? ` ${inch}"` : ""}` : `${inch}"`;
}

/** Everything the truck planner keeps: the truck, the case list and where each case sits. */
export interface TruckPlan {
  truck: TruckSize;
  types: CaseType[];
  placed: Placed[];
  metric: boolean;
  /** case #1 at the doors (first out) rather than at the front (first in) */
  fromDoors?: boolean;
  /** your logo, printed on the plan and the case labels */
  logo?: string | null;
  /** departments: lighting, audio, video, rigging… each with its color */
  groups?: Group[];
}

/** Case numbers: load order from the front, or counted from the doors (#1 comes out first). */
export function caseNumbers(placed: Placed[], types: Map<string, CaseType>, fromDoors: boolean) {
  const order = loadOrder(placed, types);
  return new Map(order.map((uid, i) => [uid, fromDoors ? order.length - i : i + 1]));
}

export interface Group {
  id: string;
  name: string;
  color: string;
}

/** The usual departments, to start from. */
export const GROUP_PRESETS: Omit<Group, "id">[] = [
  { name: "Lighting", color: "#e53935" },
  { name: "Audio", color: "#1e88e5" },
  { name: "Video", color: "#43a047" },
  { name: "Rigging", color: "#fdd835" },
  { name: "Power", color: "#fb8c00" },
  { name: "Backline", color: "#8e24aa" },
  { name: "Staging", color: "#6d4c41" },
];

/** Per department: cases loaded and listed, weight, and space taken, for the load summary. */
export function groupSummary(plan: TruckPlan) {
  const types = new Map(plan.types.map((x) => [x.id, x]));
  const rows = [...(plan.groups ?? []), { id: "", name: "", color: "#9e9e9e" }].map((g) => ({ ...g, loaded: 0, listed: 0, weight: 0, volume: 0 }));
  const of = (groupId: string | null | undefined) => rows.find((r) => r.id === (groupId ?? "")) ?? rows[rows.length - 1];
  for (const ty of plan.types) of(ty.group).listed += ty.qty;
  for (const p of plan.placed) {
    const ty = types.get(p.type);
    if (!ty) continue;
    const r = of(ty.group);
    r.loaded++;
    r.weight += ty.wt ?? 0;
    r.volume += ty.l * ty.w * ty.h;
  }
  return rows.filter((r) => r.listed || r.loaded);
}

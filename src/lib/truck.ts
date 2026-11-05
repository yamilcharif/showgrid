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
}

/** Usual inside dimensions; trucks vary, so the planner lets you change them. */
export const TRUCKS: TruckSize[] = [
  { key: "16", l: 192, w: 90, h: 90 },
  { key: "21", l: 252, w: 96, h: 96 },
  { key: "26", l: 312, w: 98, h: 99 },
  { key: "53", l: 630, w: 100, h: 108 },
];

export interface CaseType {
  id: string;
  name: string;
  l: number;
  w: number;
  h: number;
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
}

export const CASE_COLORS = ["#e4572e", "#4c9be8", "#f2c14e", "#59c9a5", "#b07fe0", "#ff8fab", "#90be6d", "#f3a712", "#5dd9c1", "#c9ada7"];

/** Common road cases, to start from. Sizes are typical; edit them to match yours. */
export const CASE_PRESETS: Omit<CaseType, "id" | "qty" | "color">[] = [
  { name: "Moving head 2-way", l: 47, w: 24, h: 35 },
  { name: "Console case", l: 66, w: 38, h: 22 },
  { name: "Truss 10' (12\" box)", l: 120, w: 12, h: 12 },
  { name: "Motor case 1T", l: 24, w: 24, h: 30 },
  { name: "Cable trunk", l: 48, w: 24, h: 30 },
  { name: "Power distro", l: 30, w: 24, h: 46 },
  { name: "LED wall case (6 panels)", l: 44, w: 28, h: 46 },
  { name: "Speaker cart", l: 56, w: 30, h: 48 },
];

/** Footprint of a placed case on the floor plan. */
export function footprint(p: Placed, t: CaseType) {
  return { x: p.x, y: p.y, l: p.rot ? t.w : t.l, w: p.rot ? t.l : t.w, h: t.h };
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
    done.push({ ...p, z, top: z + t.h, f });
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
    if (overlaps(f, g)) z = Math.max(z, p.z + t.h);
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

export function stats(truck: TruckSize, placed: Placed[], types: Map<string, CaseType>) {
  let floor = 0;
  let vol = 0;
  let depth = 0;
  let tooTall = 0;
  for (const p of placed) {
    const t = types.get(p.type);
    if (!t) continue;
    const f = footprint(p, t);
    if (p.z === 0) floor += f.l * f.w;
    vol += f.l * f.w * f.h;
    depth = Math.max(depth, f.x + f.l);
    if (p.z + t.h > truck.h + 0.01) tooTall++;
  }
  return {
    floor: floor / (truck.l * truck.w),
    volume: vol / (truck.l * truck.w * truck.h),
    /** how far from the front wall the load reaches */
    depth,
    tooTall,
  };
}

/** 98 → 8' 2"; in metric, 98 → 249 cm. */
export function fmtLen(inches: number, metric: boolean) {
  if (metric) return `${Math.round(inches * 2.54)} cm`;
  const ft = Math.floor(Math.round(inches) / 12);
  const inch = Math.round(inches) - ft * 12;
  return ft ? `${ft}'${inch ? ` ${inch}"` : ""}` : `${inch}"`;
}

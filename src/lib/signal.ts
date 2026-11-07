/** LED signal flow and rack: the devices between the media server and the walls, how they're cabled, and the rack they live in. */

import { offPanels, screenSize, type OutputMap, type PatternSettings, type SavedScreen } from "./pattern";

export type DeviceKind = "server" | "processor" | "switch" | "fiber" | "dist";
export type Cable = "HDMI" | "SDI" | "DP" | "Fiber" | "Cat6";
export const CABLES: Cable[] = ["HDMI", "SDI", "DP", "Fiber", "Cat6"];
export const KINDS: DeviceKind[] = ["server", "processor", "switch", "fiber", "dist"];

export interface SigDevice {
  id: string;
  kind: DeviceKind;
  name: string;
  /** make and model, free text */
  model: string;
  ins: string[];
  outs: string[];
  /** rack units it takes; 0 keeps it out of the rack */
  u: number;
  /** processor: pixels each output port carries, and pixels the whole unit can load */
  portPx?: number;
  maxPx?: number;
  /** media server: the output that carries the output map */
  mapOut?: number | null;
}

/** A cable from a device output ("dev:out") to a device input ("dev:in") or a screen ("screen:<saved screen id>"). */
export interface SigLink {
  id: string;
  from: string;
  to: string;
  cable: Cable;
  /** length in metres, optional */
  m?: number | null;
}

export interface SignalFlow {
  devices: SigDevice[];
  links: SigLink[];
  rackName: string;
  rackU: number;
}

export const SIGNAL_START: SignalFlow = { devices: [], links: [], rackName: "Rack 1", rackU: 12 };

/** A 1 Gb port at 8 bit, 60 Hz: the usual figure crews plan with. */
export const PORT_PX = 655360;

const range = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i));

/** A new device with sensible ports for its kind. */
export function newDevice(kind: DeviceKind, id: string, n: number, label?: string): SigDevice {
  const d = baseDevice(kind, id, n);
  return label ? { ...d, name: `${label} ${n}` } : d;
}

function baseDevice(kind: DeviceKind, id: string, n: number): SigDevice {
  switch (kind) {
    case "server":
      return { id, kind, name: `Media server ${n}`, model: "", ins: [], outs: range(2, (i) => `Output ${i + 1}`), u: 2, mapOut: 0 };
    case "processor":
      return { id, kind, name: `Processor ${n}`, model: "", ins: ["HDMI 1", "DP 1"], outs: range(8, (i) => `P${i + 1}`), u: 1, portPx: PORT_PX, maxPx: 3840 * 2160 };
    case "switch":
      return { id, kind, name: `Switch ${n}`, model: "", ins: range(4, (i) => `In ${i + 1}`), outs: range(4, (i) => `Out ${i + 1}`), u: 1 };
    case "fiber":
      return { id, kind, name: `Fiber ${n}`, model: "", ins: ["In"], outs: ["Out"], u: 1 };
    case "dist":
      return { id, kind, name: `DA ${n}`, model: "", ins: ["In"], outs: range(4, (i) => `Out ${i + 1}`), u: 1 };
  }
}

/** The lit pixels of a screen: panels taken out don't load the processor. */
export function screenPx(s: PatternSettings) {
  return (s.cols * s.rows - offPanels(s).size) * s.pw * s.ph;
}

const split = (k: string) => {
  const i = k.lastIndexOf(":");
  return [k.slice(0, i), Number(k.slice(i + 1))] as const;
};

export type Problem =
  | { kind: "port"; dev: string; port: number; px: number; max: number }
  | { kind: "total"; dev: string; px: number; max: number }
  | { kind: "short"; screen: string; ports: number; need: number }
  | { kind: "unfed"; screen: string };

/** Which processor ports feed each screen, how loaded each port and processor is, and what doesn't add up. */
export function signalCheck(flow: SignalFlow, library: SavedScreen[], output?: OutputMap) {
  const devs = new Map(flow.devices.map((d) => [d.id, d]));
  const into = new Map<string, SigLink[]>();
  for (const l of flow.links) into.set(l.to, [...(into.get(l.to) ?? []), l]);

  /** Walks back from a cable to the processor ports it comes from, through fiber, switches and DAs. */
  const portsBehind = (l: SigLink, seen = new Set<string>()): string[] => {
    if (seen.has(l.id)) return [];
    seen.add(l.id);
    const [devId] = split(l.from);
    const d = devs.get(devId);
    if (!d) return [];
    if (d.kind === "processor") return [l.from];
    if (d.kind === "server") return [];
    return d.ins.flatMap((_, i) => (into.get(`${d.id}:${i}`) ?? []).flatMap((x) => portsBehind(x, seen)));
  };

  const fed = new Map<string, string[]>();
  const load = new Map<string, number>();
  const total = new Map<string, number>();
  for (const sc of library) {
    const ports = [...new Set((into.get(`screen:${sc.id}`) ?? []).flatMap((l) => portsBehind(l)))];
    if (!ports.length) continue;
    fed.set(sc.id, ports);
    const share = screenPx(sc.s) / ports.length;
    for (const p of ports) {
      load.set(p, (load.get(p) ?? 0) + share);
      const [dev] = split(p);
      total.set(dev, (total.get(dev) ?? 0) + share);
    }
  }

  const problems: Problem[] = [];
  for (const d of flow.devices) {
    if (d.kind !== "processor") continue;
    const portMax = d.portPx || PORT_PX;
    d.outs.forEach((_, i) => {
      const px = load.get(`${d.id}:${i}`) ?? 0;
      if (px > portMax) problems.push({ kind: "port", dev: d.id, port: i, px: Math.round(px), max: portMax });
    });
    const t = total.get(d.id) ?? 0;
    if (d.maxPx && t > d.maxPx) problems.push({ kind: "total", dev: d.id, px: Math.round(t), max: d.maxPx });
  }
  for (const [id, ports] of fed) {
    const sc = library.find((l) => l.id === id)!;
    const portMax = Math.min(...ports.map((p) => devs.get(split(p)[0])?.portPx || PORT_PX));
    const need = Math.ceil(screenPx(sc.s) / portMax);
    if (ports.length < need) problems.push({ kind: "short", screen: id, ports: ports.length, need });
  }
  // screens on the output map that no processor port reaches
  for (const it of output?.items ?? []) if (!fed.has(it.screen) && library.some((l) => l.id === it.screen)) problems.push({ kind: "unfed", screen: it.screen });

  return { fed, load, total, problems };
}

/** How many ports a screen needs at a given port size. */
export const portsNeeded = (s: PatternSettings, portPx = PORT_PX) => Math.ceil(screenPx(s) / portPx);

/** Builds a first draft from the output map: one server output, one processor, enough ports for every screen. */
export function draftFromOutput(output: OutputMap, library: SavedScreen[], uid: () => string, kinds?: Record<DeviceKind, string>, cable: { in: Cable; port: Cable } = { in: "HDMI", port: "Cat6" }): SignalFlow {
  const screens = output.items.map((it) => library.find((l) => l.id === it.screen)).filter((x): x is SavedScreen => !!x);
  const unique = [...new Map(screens.map((s) => [s.id, s])).values()];
  const server = newDevice("server", uid(), 1, kinds?.server);
  server.outs = [output.name.trim() || "Output 1"];
  server.mapOut = 0;
  const proc = newDevice("processor", uid(), 1, kinds?.processor);
  const need = unique.map((s) => Math.max(1, portsNeeded(s.s)));
  const ports = Math.max(4, need.reduce((a, b) => a + b, 0));
  proc.outs = range(ports, (i) => `P${i + 1}`);
  const links: SigLink[] = [{ id: uid(), from: `${server.id}:0`, to: `${proc.id}:0`, cable: cable.in }];
  let p = 0;
  unique.forEach((s, i) => {
    for (let k = 0; k < need[i]; k++) links.push({ id: uid(), from: `${proc.id}:${p++}`, to: `screen:${s.id}`, cable: cable.port });
  });
  return { ...SIGNAL_START, devices: [server, proc], links };
}

// ---------- drawing ----------

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** Cuts a label to roughly fit a width, at ~0.58 em per character. */
const fitText = (s: string, w: number, size: number) => {
  const max = Math.max(3, Math.floor(w / (size * 0.58)));
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
};
const mpx = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)} Mpx` : `${Math.round(n / 1000)} kpx`);

export const CABLE_COLORS: Record<Cable, string> = { HDMI: "#6d3fd6", SDI: "#c2410c", DP: "#0e7490", Fiber: "#d4a106", Cat6: "#2563eb" };

const INK = "#16181d";
const MUTED = "#5b6270";
const LINE = "#cfd4dc";
const BAD = "#d92d20";
const FONT = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

export interface SignalLabels {
  title: string;
  kinds: Record<DeviceKind, string>;
  load: string;
  map: string;
  ports: string;
  legend: string;
  empty: string;
}

/** The signal flow, left to right: sources, processing, the walls. A standalone SVG, light, ready to print. */
export function signalSvg(flow: SignalFlow, library: SavedScreen[], output: OutputMap | undefined, L: SignalLabels, title = ""): { svg: string; w: number; h: number } {
  const check = signalCheck(flow, library, output);
  const badPorts = new Set(check.problems.flatMap((p) => (p.kind === "port" ? [`${p.dev}:${p.port}`] : [])));
  const badDevs = new Set(check.problems.flatMap((p) => (p.kind === "total" ? [p.dev] : [])));
  const shortScreens = new Set(check.problems.flatMap((p) => (p.kind === "short" ? [p.screen] : [])));
  const devs = new Map(flow.devices.map((d) => [d.id, d]));
  const links = flow.links.filter((l) => devs.has(split(l.from)[0]) && (l.to.startsWith("screen:") ? library.some((s) => `screen:${s.id}` === l.to) : devs.has(split(l.to)[0])));
  const screenIds = [...new Set(links.filter((l) => l.to.startsWith("screen:")).map((l) => l.to.slice(7)))];

  // columns: each device one step right of whatever feeds it
  const col = new Map(flow.devices.map((d) => [d.id, 0]));
  for (let pass = 0; pass < flow.devices.length; pass++)
    for (const l of links) {
      if (l.to.startsWith("screen:")) continue;
      const a = split(l.from)[0];
      const b = split(l.to)[0];
      if (a !== b) col.set(b, Math.max(col.get(b)!, Math.min(flow.devices.length, col.get(a)! + 1)));
    }
  const lastCol = flow.devices.length ? Math.max(...col.values()) + 1 : 0;

  const NW = 210;
  const SW = 190;
  const GAP = 170;
  const ROW = 20;
  const HEAD = 40;
  const M = 28;
  const TOP = title ? 64 : 24;
  const devH = (d: SigDevice) => HEAD + Math.max(1, d.ins.length, d.outs.length) * ROW + 10 + (d.kind === "processor" || (d.kind === "server" && d.mapOut != null && output) ? 20 : 0);
  const scrIn = (id: string) => links.filter((l) => l.to === `screen:${id}`);
  const scrH = (id: string) => Math.max(70, scrIn(id).length * 14 + 40);

  type Box = { x: number; y: number; w: number; h: number };
  const box = new Map<string, Box>();
  const order: string[][] = [];
  for (const d of flow.devices) (order[col.get(d.id)!] ??= []).push(d.id);
  order[lastCol] = screenIds.map((id) => `screen:${id}`);
  // keep each column roughly in line with what feeds it
  const rank = new Map<string, number>();
  order.forEach((ids, c) => {
    if (!ids) return;
    if (c > 0) {
      const avg = (id: string) => {
        const src = links.filter((l) => (id.startsWith("screen:") ? l.to === id : split(l.to)[0] === id)).map((l) => rank.get(split(l.from)[0]) ?? 0);
        return src.length ? src.reduce((a, b) => a + b, 0) / src.length : 1e9;
      };
      ids.sort((a, b) => avg(a) - avg(b));
    }
    let y = TOP;
    ids.forEach((id, i) => {
      const h = id.startsWith("screen:") ? scrH(id.slice(7)) : devH(devs.get(id)!);
      box.set(id, { x: M + c * (NW + GAP), y, w: id.startsWith("screen:") ? SW : NW, h });
      rank.set(id, c * 1000 + i);
      y += h + 22;
    });
  });

  const W = Math.max(520, M * 2 + lastCol * (NW + GAP) + (screenIds.length ? SW : -GAP));
  const contentH = Math.max(80, ...[...box.values()].map((b) => b.y + b.h));
  const legendY = contentH + 30;
  const H = legendY + 34;

  const outPt = (k: string) => {
    const [id, i] = split(k);
    const b = box.get(id)!;
    return { x: b.x + b.w, y: b.y + HEAD + i * ROW + ROW / 2 + 4 };
  };
  const inPt = (l: SigLink) => {
    if (l.to.startsWith("screen:")) {
      const b = box.get(l.to)!;
      const list = scrIn(l.to.slice(7));
      const i = list.indexOf(l);
      return { x: b.x, y: b.y + (b.h * (i + 1)) / (list.length + 1) };
    }
    const [id, i] = split(l.to);
    const b = box.get(id)!;
    return { x: b.x, y: b.y + HEAD + i * ROW + ROW / 2 + 4 };
  };

  const parts: string[] = [];
  parts.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
  if (title) {
    parts.push(`<text x="${M}" y="34" font-size="20" font-weight="800" fill="${INK}">${esc(fitText(title, W - M * 2, 20))}</text>`);
    parts.push(`<text x="${M}" y="52" font-size="11" font-weight="600" fill="${MUTED}" letter-spacing="1.4">${esc(L.title.toUpperCase())}</text>`);
  }
  if (!flow.devices.length) parts.push(`<text x="${W / 2}" y="${TOP + 40}" text-anchor="middle" font-size="14" fill="${MUTED}">${esc(L.empty)}</text>`);

  // cables under the boxes
  const labels: string[] = [];
  for (const l of links) {
    if (!box.has(split(l.from)[0]) || !box.has(l.to.startsWith("screen:") ? l.to : split(l.to)[0])) continue;
    const a = outPt(l.from);
    const b = inPt(l);
    const dx = Math.max(40, Math.abs(b.x - a.x) * 0.45);
    const c1 = { x: a.x + dx, y: a.y };
    const c2 = { x: b.x - dx, y: b.y };
    const color = badPorts.has(l.from) ? BAD : CABLE_COLORS[l.cable];
    parts.push(`<path d="M${a.x} ${a.y} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}" fill="none" stroke="${color}" stroke-width="2.2"${l.cable === "Fiber" ? ` stroke-dasharray="7 4"` : ""}/>`);
    // the tag sits a third of the way along, where cables from one port haven't merged yet
    const t = 0.32;
    const u = 1 - t;
    const px = u ** 3 * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * b.x;
    const py = u ** 3 * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * b.y;
    const text = l.m ? `${l.cable} · ${l.m} m` : l.cable;
    const tw = text.length * 6.2 + 10;
    labels.push(`<rect x="${px - tw / 2}" y="${py - 8}" width="${tw}" height="16" rx="8" fill="#ffffff" stroke="${color}" stroke-width="1"/><text x="${px}" y="${py + 3.5}" text-anchor="middle" font-size="10" font-weight="700" fill="${color}">${esc(text)}</text>`);
  }

  for (const d of flow.devices) {
    const b = box.get(d.id)!;
    const bad = badDevs.has(d.id);
    const fill = d.kind === "server" ? "#eef2ff" : d.kind === "processor" ? "#ecfdf3" : "#f5f6f8";
    parts.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="8" fill="${fill}" stroke="${bad ? BAD : "#9aa3b2"}" stroke-width="${bad ? 2 : 1.2}"/>`);
    parts.push(`<text x="${b.x + 12}" y="${b.y + 19}" font-size="13" font-weight="800" fill="${INK}">${esc(fitText(d.name, b.w - 24, 13))}</text>`);
    parts.push(`<text x="${b.x + 12}" y="${b.y + 33}" font-size="10" font-weight="600" fill="${MUTED}">${esc(fitText([L.kinds[d.kind], d.model].filter(Boolean).join(" · "), b.w - 24, 10))}</text>`);
    parts.push(`<line x1="${b.x}" y1="${b.y + HEAD}" x2="${b.x + b.w}" y2="${b.y + HEAD}" stroke="${LINE}"/>`);
    d.ins.forEach((n, i) => {
      const y = b.y + HEAD + i * ROW + ROW / 2 + 4;
      parts.push(`<circle cx="${b.x}" cy="${y}" r="3.5" fill="#ffffff" stroke="${INK}" stroke-width="1.4"/><text x="${b.x + 9}" y="${y + 3.5}" font-size="10.5" fill="${INK}">${esc(fitText(n, b.w / 2 - 14, 10.5))}</text>`);
    });
    d.outs.forEach((n, i) => {
      const k = `${d.id}:${i}`;
      const y = b.y + HEAD + i * ROW + ROW / 2 + 4;
      const over = badPorts.has(k);
      const px = check.load.get(k);
      const lab = d.kind === "processor" && px ? `${n} · ${mpx(px)}` : d.kind === "server" && d.mapOut === i && output ? `${n} ▣` : n;
      parts.push(`<circle cx="${b.x + b.w}" cy="${y}" r="3.5" fill="${over ? BAD : INK}"/><text x="${b.x + b.w - 9}" y="${y + 3.5}" text-anchor="end" font-size="10.5" font-weight="${over ? 800 : 400}" fill="${over ? BAD : INK}">${esc(fitText(lab, b.w / 2 + 20, 10.5))}</text>`);
    });
    const foot = b.y + b.h - 10;
    if (d.kind === "processor") {
      const t = check.total.get(d.id) ?? 0;
      parts.push(`<text x="${b.x + 12}" y="${foot}" font-size="10" font-weight="700" fill="${bad ? BAD : MUTED}">${esc(`${L.load} ${mpx(t)}${d.maxPx ? ` / ${mpx(d.maxPx)}` : ""}`)}</text>`);
    } else if (d.kind === "server" && d.mapOut != null && output) {
      parts.push(`<text x="${b.x + 12}" y="${foot}" font-size="10" font-weight="700" fill="${MUTED}">${esc(fitText(`▣ ${L.map}: ${output.name} ${output.w}×${output.h}`, b.w - 24, 10))}</text>`);
    }
  }

  for (const id of screenIds) {
    const b = box.get(`screen:${id}`)!;
    const sc = library.find((s) => s.id === id)!;
    const { w, h } = screenSize(sc.s);
    const short = shortScreens.has(id);
    // a little picture of the wall, its own proportions
    const k = Math.min(46 / w, 30 / h);
    const tw = Math.max(6, w * k);
    const th = Math.max(4, h * k);
    parts.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="8" fill="#111318" stroke="${short ? BAD : "#111318"}" stroke-width="${short ? 2.5 : 1}"/>`);
    parts.push(`<rect x="${b.x + b.w - 12 - tw}" y="${b.y + 12}" width="${tw}" height="${th}" fill="${sc.s.a}" stroke="#ffffff" stroke-width="1"/>`);
    parts.push(`<text x="${b.x + 12}" y="${b.y + 22}" font-size="13" font-weight="800" fill="#ffffff">${esc(fitText(sc.s.name.trim() || sc.name, b.w - tw - 32, 13))}</text>`);
    parts.push(`<text x="${b.x + 12}" y="${b.y + 38}" font-size="10" font-weight="600" fill="#c9ced8">${w} × ${h} px · ${mpx(screenPx(sc.s))}</text>`);
    const n = check.fed.get(id)?.length ?? 0;
    parts.push(`<text x="${b.x + 12}" y="${b.y + 54}" font-size="10" font-weight="700" fill="${short ? "#ff8a80" : "#c9ced8"}">${esc(`${n} ${L.ports} · ${sc.s.cols} × ${sc.s.rows}`)}</text>`);
  }
  parts.push(...labels);

  // legend
  let lx = M;
  parts.push(`<text x="${lx}" y="${legendY + 4}" font-size="10" font-weight="700" fill="${MUTED}" letter-spacing="1">${esc(L.legend.toUpperCase())}</text>`);
  lx += L.legend.length * 7.5 + 14;
  for (const c of CABLES) {
    parts.push(`<line x1="${lx}" y1="${legendY}" x2="${lx + 26}" y2="${legendY}" stroke="${CABLE_COLORS[c]}" stroke-width="3"${c === "Fiber" ? ` stroke-dasharray="6 3"` : ""}/><text x="${lx + 32}" y="${legendY + 4}" font-size="11" font-weight="700" fill="${INK}">${c}</text>`);
    lx += 32 + c.length * 7 + 18;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">${parts.join("")}</svg>`;
  return { svg, w: W, h: H };
}

export interface RackLabels {
  title: string;
  kinds: Record<DeviceKind, string>;
  over: string;
  empty: string;
}

/** Devices in the rack, top down, in the order of the list. */
export function rackSlots(flow: SignalFlow) {
  let top = flow.rackU;
  return flow.devices
    .filter((d) => d.u > 0)
    .map((d) => {
      const slot = { dev: d, top, bottom: top - d.u + 1 };
      top -= d.u;
      return slot;
    });
}

/** A front elevation of a 19" rack: U numbers on the rails (U1 at the bottom), each device on its units. */
export function rackSvg(flow: SignalFlow, L: RackLabels, title = ""): { svg: string; w: number; h: number } {
  const U = 34;
  const RAIL = 30;
  const FACE = 368; // 19" panel to 1U is about 10.9 : 1
  const M = 28;
  const TOP = title ? 70 : 44;
  const slots = rackSlots(flow);
  const used = slots.reduce((a, s) => a + s.dev.u, 0);
  const n = Math.max(flow.rackU, 1);
  const W = M * 2 + RAIL * 2 + FACE;
  const over = used > n;
  const H = TOP + n * U + 30 + (over ? 24 : 0);
  const x0 = M + RAIL;
  const yOf = (u: number) => TOP + (n - u) * U; // top edge of unit u
  const parts: string[] = [`<rect width="${W}" height="${H}" fill="#ffffff"/>`];
  if (title) parts.push(`<text x="${M}" y="30" font-size="18" font-weight="800" fill="${INK}">${esc(fitText(title, W - M * 2, 18))}</text>`);
  parts.push(`<text x="${M}" y="${title ? 50 : 28}" font-size="11" font-weight="700" fill="${MUTED}" letter-spacing="1.2">${esc(`${(flow.rackName || L.title).toUpperCase()} · ${n}U`)}</text>`);
  // the cabinet and its rails
  parts.push(`<rect x="${M - 6}" y="${TOP - 8}" width="${W - M * 2 + 12}" height="${n * U + 16}" rx="6" fill="#2b2f36"/>`);
  for (const side of [M, x0 + FACE]) {
    parts.push(`<rect x="${side}" y="${TOP}" width="${RAIL}" height="${n * U}" fill="#3a3f48"/>`);
    for (let u = 1; u <= n; u++) {
      const y = yOf(u);
      parts.push(`<line x1="${side}" y1="${y}" x2="${side + RAIL}" y2="${y}" stroke="#555b66"/>`);
      for (const f of [0.22, 0.5, 0.78]) parts.push(`<rect x="${side + (side === M ? 18 : 6)}" y="${y + U * f - 2}" width="5" height="4" fill="#15171b"/>`);
      if (side === M) parts.push(`<text x="${side + 9}" y="${y + U / 2 + 3.5}" text-anchor="middle" font-size="9.5" font-weight="700" fill="#c9ced8">${u}</text>`);
    }
  }
  parts.push(`<rect x="${x0}" y="${TOP}" width="${FACE}" height="${n * U}" fill="#1b1e23"/>`);
  if (!slots.length) parts.push(`<text x="${x0 + FACE / 2}" y="${TOP + (n * U) / 2}" text-anchor="middle" font-size="12" fill="#8f96a3">${esc(L.empty)}</text>`);
  for (const s of slots) {
    if (s.bottom < 1) continue;
    const y = yOf(s.top) + 1.5;
    const h = s.dev.u * U - 3;
    const fill = s.dev.kind === "processor" ? "#1f3b2d" : s.dev.kind === "server" ? "#252c4a" : "#3a3f48";
    parts.push(`<rect x="${x0 - RAIL + 4}" y="${y}" width="${FACE + RAIL * 2 - 8}" height="${h}" rx="3" fill="${fill}" stroke="#0e1013"/>`);
    // ears with their screws
    for (const ex of [x0 - RAIL + 4, x0 + FACE + 4]) parts.push(`<rect x="${ex}" y="${y}" width="${RAIL - 8}" height="${h}" fill="#000" fill-opacity="0.18"/><circle cx="${ex + (RAIL - 8) / 2}" cy="${y + Math.min(h / 2, U / 2)}" r="3" fill="#c9ced8"/>`);
    const big = s.dev.u > 1 ? 14 : 12;
    parts.push(`<text x="${x0 + 12}" y="${y + Math.min(h / 2, U / 2) + (s.dev.u > 1 ? -2 : 4)}" font-size="${big}" font-weight="800" fill="#ffffff">${esc(fitText(s.dev.name, FACE * 0.55, big))}</text>`);
    if (s.dev.u > 1 || s.dev.model) {
      const sub = [L.kinds[s.dev.kind], s.dev.model].filter(Boolean).join(" · ");
      if (s.dev.u > 1) parts.push(`<text x="${x0 + 12}" y="${y + U / 2 + 13}" font-size="10" font-weight="600" fill="#c9ced8">${esc(fitText(sub, FACE * 0.55, 10))}</text>`);
    }
    // the outputs as little connectors on the right of the face
    const dots = Math.min(s.dev.outs.length, 16);
    for (let i = 0; i < dots; i++) parts.push(`<rect x="${x0 + FACE - 52 - (dots - i) * 11}" y="${y + Math.min(h, U) / 2 - 4}" width="8" height="8" rx="1.5" fill="#0e1013" stroke="#8f96a3" stroke-width="0.8"/>`);
    parts.push(`<text x="${x0 + FACE - 10}" y="${y + Math.min(h, U) / 2 + 3}" text-anchor="end" font-size="8.5" font-weight="700" fill="#8f96a3">U${s.bottom}${s.dev.u > 1 ? `–${s.top}` : ""}</text>`);
  }
  if (over) parts.push(`<text x="${M}" y="${TOP + n * U + 36}" font-size="12" font-weight="800" fill="${BAD}">${esc(L.over)}</text>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">${parts.join("")}</svg>`;
  return { svg, w: W, h: H };
}

/** An SVG drawing as a PNG, at twice its size so it prints sharp. */
export function svgPng(svg: string, w: number, h: number, scale = 2): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = Math.round(w * scale);
      c.height = Math.round(h * scale);
      const ctx = c.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(resolve, "image/png");
    };
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/** An SVG drawing on one PDF page (Letter), turned to fit and centred. */
export async function svgPdf(svg: string, w: number, h: number): Promise<Blob | null> {
  const png = await svgPng(svg, w, h, 2);
  if (!png) return null;
  const data = await new Promise<string>((done) => {
    const r = new FileReader();
    r.onload = () => done(String(r.result));
    r.readAsDataURL(png);
  });
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: w > h ? "landscape" : "portrait" });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const k = Math.min((PW - 48) / w, (PH - 48) / h);
  doc.addImage(data, "PNG", (PW - w * k) / 2, (PH - h * k) / 2, w * k, h * k);
  return doc.output("blob");
}

/** LED wall test patterns: the settings and the drawing, shared by the tool and the project download. */

export type Style = "checker" | "grid" | "solid";
export type LogoAt = "center" | "tl" | "tr" | "bl" | "br" | "each" | "custom";

/** A window on the wall for a piece of content: camera, IMAG, a video… in wall pixels. */
export interface Pip {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  /** a frame of the content, shown inside the window */
  img: string | null;
}

export interface PatternSettings {
  cols: number;
  rows: number;
  pw: number;
  ph: number;
  /** panel size in millimetres */
  mw: number;
  mh: number;
  style: Style;
  a: string;
  b: string;
  line: string;
  ink: string;
  name: string;
  numbers: boolean;
  borders: boolean;
  circle: boolean;
  diagonals: boolean;
  ramp: boolean;
  bars: boolean;
  pips: Pip[];
  logo: string | null;
  logoAt: LogoAt;
  /** logo height, as a share of the wall height (or of a panel, on every panel) */
  logoSize: number;
  /** one color for the whole logo (keeping its shape); unset shows it in its own colors */
  logoColor?: string | null;
  /** where the logo was dragged to (its centre, in wall pixels), for logoAt "custom" */
  logoX?: number;
  logoY?: number;
  /** where the title plate was dragged to (its centre); unset keeps it in the middle */
  titleX?: number | null;
  titleY?: number | null;
  /** panels left out of the wall ("col,row"), for doors, pyramids and other shapes; drawn black */
  off?: string[];
  /** curve between neighbouring panels, in degrees (0 = flat) */
  curve?: number;
  curveDir?: "in" | "out";
  /** power and data planning for the wall */
  power?: Partial<PowerData>;
}

export type Volts = 110 | 120 | 208 | 230;
export type Corner = "tl" | "tr" | "bl" | "br";

export interface PowerData {
  /** draw the data and power runs on the wall (and the totals on the plate) */
  overlay: boolean;
  volts: Volts;
  /** breaker size, in amps */
  breaker: number;
  /** most panels on one power chain */
  perPower: number;
  /** per panel: watts at full white, typical watts, kg; null when unknown */
  wMax: number | null;
  wAvg: number | null;
  kg: number | null;
  /** pixels one processor port can drive */
  portPx: number;
  /** panels on one data chain; null = as many as fit on a port */
  perData: number | null;
  /** the snake: along rows or columns, from which corner */
  order: "h" | "v";
  start: Corner;
}

/** A 1 G port at 8 bit, 60 Hz. */
export const PORT_1G = 655360;
/** Breakers are loaded to 80 % for a continuous load. */
export const BREAKER_LOAD = 0.8;

export const POWER_START: PowerData = {
  overlay: false,
  volts: 208,
  breaker: 20,
  perPower: 10,
  wMax: null,
  wAvg: null,
  kg: null,
  portPx: PORT_1G,
  perData: null,
  order: "h",
  start: "tl",
};

export const powerOf = (s: PatternSettings): PowerData => ({ ...POWER_START, ...s.power });

/** The panels in cabling order: a snake along rows (or columns) from the start corner, skipping panels left out. */
export function snake(s: PatternSettings, p: PowerData): [number, number][] {
  const off = offPanels(s);
  const fromLeft = p.start === "tl" || p.start === "bl";
  const fromTop = p.start === "tl" || p.start === "tr";
  const out: [number, number][] = [];
  const lines = p.order === "h" ? s.rows : s.cols;
  const along = p.order === "h" ? s.cols : s.rows;
  for (let i = 0; i < lines; i++) {
    // first direction along a line, flipping every line
    const forward = (p.order === "h" ? fromLeft : fromTop) !== (i % 2 === 1);
    const line = (p.order === "h" ? fromTop : fromLeft) ? i : lines - 1 - i;
    for (let j = 0; j < along; j++) {
      const k = forward ? j : along - 1 - j;
      const [c, r] = p.order === "h" ? [k, line] : [line, k];
      if (!off.has(`${c},${r}`)) out.push([c, r]);
    }
  }
  return out;
}

const chunk = <T,>(list: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
};

/** Watts, amps, circuits, data ports and the runs themselves, for the lit panels. */
export function powerPlan(s: PatternSettings) {
  const p = powerOf(s);
  const path = snake(s, p);
  const n = path.length;
  const panelPx = s.pw * s.ph;
  /** panels that fit on one port */
  const fit = Math.floor(p.portPx / panelPx);
  const perData = Math.max(1, p.perData ?? fit);
  const perPower = Math.max(1, p.perPower);
  const dataRuns = chunk(path, perData);
  const powerRuns = chunk(path, perPower);
  const usable = p.volts * p.breaker * BREAKER_LOAD;
  const wMax = p.wMax && p.wMax > 0 ? p.wMax : null;
  const wAvg = p.wAvg && p.wAvg > 0 ? p.wAvg : null;
  const totalMax = wMax ? n * wMax : null;
  const totalAvg = wAvg ? n * wAvg : null;
  // whole power chains go on a circuit: fill each circuit until the next chain won't fit
  let circuits: number | null = null;
  if (wMax) {
    circuits = 0;
    let load = Infinity;
    for (const run of powerRuns) {
      const w = run.length * wMax;
      if (w > usable) {
        // a chain too big for one breaker: it has to be split, so count what it really needs
        circuits += Math.ceil(w / usable);
        load = Infinity;
        continue;
      }
      if (load + w > usable) {
        circuits++;
        load = 0;
      }
      load += w;
    }
  }
  return {
    p,
    lit: n,
    fit,
    perData,
    perPower,
    dataRuns,
    powerRuns,
    usable,
    totalMax,
    totalAvg,
    ampsMax: totalMax != null ? totalMax / p.volts : null,
    ampsAvg: totalAvg != null ? totalAvg / p.volts : null,
    circuits,
    /** one power chain draws more than a breaker holds */
    chainOver: wMax != null && Math.min(perPower, n) * wMax > usable,
    /** the data chain holds more pixels than a port */
    dataOver: perData * panelPx > p.portPx,
    kg: p.kg && p.kg > 0 ? n * p.kg : null,
  };
}

export type PowerPlan = ReturnType<typeof powerPlan>;

const kw = (w: number) => (w >= 1000 ? `${(w / 1000).toFixed(1)} kW` : `${Math.round(w)} W`);
export { kw as fmtWatts };

const RUN_COLORS = ["#ffcc00", "#00e5ff", "#ff5ad1", "#7dff4d", "#ff8a3d", "#b28cff", "#ff4d4d", "#4dd0ff"];

/** Data runs (top-left labels, solid lines) and power runs (bottom-left labels, dashed lines) over the panels. */
function drawRuns(ctx: CanvasRenderingContext2D, s: PatternSettings, plan: PowerPlan) {
  const unit = Math.min(s.pw, s.ph);
  const lw = Math.max(2, Math.round(unit / 36));
  const font = Math.max(9, Math.round(unit / 7));
  const pad = Math.round(font * 0.35);
  const o = unit * 0.18;
  const centre = ([c, r]: [number, number]) => [c * s.pw + s.pw / 2, r * s.ph + s.ph / 2];
  const runs = (list: [number, number][][], tag: string, dy: number, dashed: boolean, top: boolean) =>
    list.forEach((run, i) => {
      const color = RUN_COLORS[i % RUN_COLORS.length];
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.lineJoin = "round";
      ctx.shadowColor = "rgba(0,0,0,0.9)";
      ctx.shadowBlur = lw * 2;
      if (dashed) ctx.setLineDash([lw * 3, lw * 2]);
      ctx.beginPath();
      run.forEach((k, j) => {
        const [x, y] = centre(k);
        if (j) ctx.lineTo(x + dy, y + dy);
        else ctx.moveTo(x + dy, y + dy);
      });
      ctx.stroke();
      // the start of the run: a dot where the cable comes in
      const [sx, sy] = centre(run[0]);
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(sx + dy, sy + dy, lw * 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.font = `800 ${font}px system-ui, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      run.forEach(([c, r], j) => {
        const text = `${tag}${i + 1}.${j + 1}`;
        const w = ctx.measureText(text).width + pad * 2;
        const h = font * 1.3;
        const x = c * s.pw + lw * 2;
        const y = top ? r * s.ph + lw * 2 : r * s.ph + s.ph - lw * 2 - h;
        ctx.fillStyle = dashed ? "rgba(0,0,0,0.8)" : color;
        ctx.fillRect(x, y, w, h);
        if (dashed) {
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(1, lw / 2);
          ctx.strokeRect(x, y, w, h);
        }
        ctx.fillStyle = dashed ? color : "#000";
        ctx.fillText(text, x + pad, y + h / 2);
      });
    });
  runs(plan.dataRuns, "D", -o, false, true);
  runs(plan.powerRuns, "P", o, true, false);
  ctx.textAlign = "center";
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What can be grabbed on the canvas, from the last drawing. */
export interface Hits {
  plate: Rect;
  logo: Rect | null;
}

export const PATTERN_START: PatternSettings = {
  cols: 16,
  rows: 9,
  pw: 176,
  ph: 176,
  mw: 500,
  mh: 500,
  style: "checker",
  a: "#1d3557",
  b: "#2a6f97",
  line: "#ffffff",
  ink: "#ffffff",
  name: "",
  numbers: true,
  borders: true,
  circle: true,
  diagonals: true,
  ramp: true,
  bars: true,
  pips: [],
  logo: null,
  logoAt: "tr",
  logoSize: 0.18,
};

/** A1, B1 … Z1, AA1: columns as letters, rows as numbers, the way LED crews call panels. */
export const colName = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : colName(Math.floor(i / 26) - 1) + colName(i % 26));

/** The panels left out of the wall, only those still inside it. */
export function offPanels(s: PatternSettings): Set<string> {
  return new Set((s.off ?? []).filter((k) => {
    const [c, r] = k.split(",").map(Number);
    return c < s.cols && r < s.rows;
  }));
}

/** A curved wall: the angle it sweeps, its radius and how wide it is in a straight line, in mm. */
export function wallCurve(s: PatternSettings) {
  const deg = s.curve ?? 0;
  if (!deg) return null;
  const a = (deg * Math.PI) / 180;
  const radius = s.mw / (2 * Math.sin(a / 2));
  const total = deg * s.cols;
  const chord = total >= 360 ? 0 : 2 * radius * Math.sin((total * Math.PI) / 360);
  return { deg, total, radius, chord, dir: s.curveDir ?? "in" };
}

/** 4.5 m · 14' 9" */
export function wallLen(mm: number) {
  const m = mm / 1000;
  const inches = mm / 25.4;
  const ft = Math.floor(inches / 12);
  const inch = Math.round(inches - ft * 12);
  return { m: `${m.toFixed(m < 10 ? 2 : 1)} m`, ft: inch === 12 ? `${ft + 1}'` : `${ft}' ${inch}"` };
}

const tints = new WeakMap<HTMLImageElement, { color: string; canvas: HTMLCanvasElement }>();

/** The logo in one color: its shape (transparency) kept, every visible pixel painted the chosen color. */
function tinted(img: HTMLImageElement, color: string): HTMLCanvasElement {
  const hit = tints.get(img);
  if (hit && hit.color === color) return hit.canvas;
  const c = document.createElement("canvas");
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  tints.set(img, { color, canvas: c });
  return c;
}

/** Draws the pattern at the wall's exact pixel size: every panel edge falls on a whole pixel. */
export function drawPattern(ctx: CanvasRenderingContext2D, s: PatternSettings, images: Map<string, HTMLImageElement>): Hits {
  const W = s.cols * s.pw;
  const H = s.rows * s.ph;
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = s.a;
  ctx.fillRect(0, 0, W, H);
  if (s.style === "checker") {
    ctx.fillStyle = s.b;
    for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) if ((r + c) % 2) ctx.fillRect(c * s.pw, r * s.ph, s.pw, s.ph);
  }

  // bands across the middle: color bars above, a gray ramp below
  const band = Math.max(Math.round(H / 12), Math.min(s.ph, 64));
  if (s.bars) {
    const colors = ["#ffffff", "#ffff00", "#00ffff", "#00ff00", "#ff00ff", "#ff0000", "#0000ff", "#000000"];
    const y = Math.round(H / 2 - band * 1.5);
    colors.forEach((c, i) => {
      const x0 = Math.round((W * i) / colors.length);
      const x1 = Math.round((W * (i + 1)) / colors.length);
      ctx.fillStyle = c;
      ctx.fillRect(x0, y, x1 - x0, band);
    });
  }
  if (s.ramp) {
    const y = Math.round(H / 2 + band * 0.5);
    const steps = 11;
    for (let i = 0; i < steps; i++) {
      const v = Math.round((255 * i) / (steps - 1));
      const x0 = Math.round((W * i) / steps);
      const x1 = Math.round((W * (i + 1)) / steps);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x0, y, x1 - x0, band);
    }
  }

  const stroke = Math.max(1, Math.round(Math.min(W, H) / 540));
  ctx.strokeStyle = s.line;
  ctx.lineWidth = stroke;
  if (s.diagonals) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(W, H);
    ctx.moveTo(W, 0);
    ctx.lineTo(0, H);
    ctx.stroke();
  }
  if (s.circle) {
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, Math.min(W, H) / 2 - stroke, 0, Math.PI * 2);
    ctx.stroke();
  }

  // panel edges as 1-pixel lines inside each panel, so every cabinet shows its own border
  if (s.borders || s.style === "grid") {
    ctx.fillStyle = s.style === "grid" ? s.b : s.line;
    for (let c = 0; c < s.cols; c++) {
      ctx.fillRect(c * s.pw, 0, 1, H);
      ctx.fillRect(c * s.pw + s.pw - 1, 0, 1, H);
    }
    for (let r = 0; r < s.rows; r++) {
      ctx.fillRect(0, r * s.ph, W, 1);
      ctx.fillRect(0, r * s.ph + s.ph - 1, W, 1);
    }
  }

  // panels that aren't there: black, the way the processor leaves them
  const off = offPanels(s);
  ctx.fillStyle = "#000";
  for (const k of off) {
    const [c, r] = k.split(",").map(Number);
    ctx.fillRect(c * s.pw, r * s.ph, s.pw, s.ph);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (s.numbers) {
    ctx.fillStyle = s.ink;
    const size = Math.max(8, Math.round(Math.min(s.pw, s.ph) / 5));
    ctx.font = `700 ${size}px system-ui, sans-serif`;
    for (let r = 0; r < s.rows; r++)
      for (let c = 0; c < s.cols; c++) if (!off.has(`${c},${r}`)) ctx.fillText(`${colName(c)}${r + 1}`, c * s.pw + s.pw / 2, r * s.ph + s.ph / 2);
  }

  // content windows: the picture (or a tint), a thick frame, and the name with its pixel size
  for (const p of s.pips) {
    const img = p.img ? images.get(p.img) : undefined;
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.x, p.y, p.w, p.h);
    ctx.clip();
    if (img) {
      // cover the window, centred
      const k = Math.max(p.w / img.width, p.h / img.height);
      ctx.drawImage(img, p.x + (p.w - img.width * k) / 2, p.y + (p.h - img.height * k) / 2, img.width * k, img.height * k);
    } else {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(p.x, p.y, p.w, p.h);
    }
    ctx.restore();
    const fw = Math.max(2, stroke * 3);
    ctx.strokeStyle = p.color;
    ctx.lineWidth = fw;
    ctx.strokeRect(p.x + fw / 2, p.y + fw / 2, p.w - fw, p.h - fw);
    const tag = Math.max(10, Math.round(Math.min(p.h / 8, p.w / 14)));
    const text = `${p.name || "PIP"} · ${p.w}×${p.h} @ ${p.x},${p.y}`;
    ctx.font = `700 ${tag}px system-ui, sans-serif`;
    const tw = Math.min(p.w - fw * 2, ctx.measureText(text).width + tag);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x + fw, p.y + fw, tw, tag * 1.5);
    ctx.fillStyle = "#000";
    ctx.textAlign = "left";
    ctx.fillText(text, p.x + fw + tag / 2, p.y + fw + tag * 0.78, tw - tag);
    ctx.textAlign = "center";
  }

  const plan = s.power?.overlay ? powerPlan(s) : null;
  if (plan) drawRuns(ctx, s, plan);

  // name, sizes in pixels, metres and feet, on a dark plate so they read over anything
  const wm = wallLen(s.cols * s.mw);
  const hm = wallLen(s.rows * s.mh);
  const curve = wallCurve(s);
  const lines = [
    s.name.trim(),
    `${W} × ${H} px · ${s.cols} × ${s.rows}${off.size ? ` (${s.cols * s.rows - off.size} panels)` : ""} · ${s.pw} × ${s.ph}`,
    `${wm.m} × ${hm.m} · ${wm.ft} × ${hm.ft}`,
    curve
      ? `${curve.dir === "out" ? "Convex" : "Concave"} curve ${+curve.deg.toFixed(2)}° / panel · ${+curve.total.toFixed(1)}° · R ${wallLen(curve.radius).m}`
      : "",
    plan
      ? `Power ${plan.totalMax != null ? `${kw(plan.totalMax)} max · ${Math.ceil(plan.ampsMax!)} A @ ${plan.p.volts} V · ${plan.circuits} × ${plan.p.breaker} A circuits · ` : ""}${plan.powerRuns.length} runs × ${plan.perPower}`
      : "",
    plan ? `Data ${plan.dataRuns.length} ports · ${plan.perData} panels / port${plan.kg != null ? ` · ${Math.round(plan.kg)} kg` : ""}` : "",
  ].filter(Boolean);
  const big = Math.max(12, Math.round(Math.min(W / 22, H / 9)));
  const small = Math.round(big * 0.5);
  const isName = (i: number) => i === 0 && !!s.name.trim();
  const widths = lines.map((l, i) => {
    ctx.font = `${isName(i) ? 800 : 600} ${isName(i) ? big : small}px system-ui, sans-serif`;
    return ctx.measureText(l).width;
  });
  const plateW = Math.min(W, Math.max(...widths) + big);
  const plateH = lines.reduce((a, _, i) => a + (isName(i) ? big * 1.2 : small * 1.45), 0) + small;
  const tx = s.titleX ?? W / 2;
  const ty = s.titleY ?? H / 2;
  const plate = { x: Math.round(tx - plateW / 2), y: Math.round(ty - plateH / 2), w: Math.round(plateW), h: Math.round(plateH) };
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.fillRect(plate.x, plate.y, plate.w, plate.h);
  ctx.fillStyle = s.ink;
  let y = ty - plateH / 2 + small / 2;
  lines.forEach((l, i) => {
    const h = isName(i) ? big * 1.2 : small * 1.45;
    ctx.font = `${isName(i) ? 800 : 600} ${isName(i) ? big : small}px system-ui, sans-serif`;
    ctx.fillText(l, tx, y + h / 2);
    y += h;
  });
  let logoHit: Rect | null = null;

  // the logo last, so it sits on top of everything
  const original = s.logo ? images.get(s.logo) : undefined;
  const logo = original && s.logoColor ? tinted(original, s.logoColor) : original;
  if (logo) {
    const put = (cx: number, cy: number, maxH: number, maxW: number) => {
      const k = Math.min(maxH / logo.height, maxW / logo.width);
      const r = { x: Math.round(cx - (logo.width * k) / 2), y: Math.round(cy - (logo.height * k) / 2), w: Math.round(logo.width * k), h: Math.round(logo.height * k) };
      ctx.drawImage(logo, r.x, r.y, r.w, r.h);
      return r;
    };
    if (s.logoAt === "each") {
      // above the panel number
      const lh = s.ph * Math.min(0.5, s.logoSize * 2);
      for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) if (!off.has(`${c},${r}`)) put(c * s.pw + s.pw / 2, r * s.ph + s.ph * 0.28, lh, s.pw * 0.8);
    } else {
      const lh = H * s.logoSize;
      const lw = W * 0.4;
      const m = Math.max(s.ph * 0.25, lh * 0.25);
      const at = {
        custom: [s.logoX ?? W / 2, s.logoY ?? H / 4],
        center: [W / 2, H / 2 - plateH / 2 - lh / 2 - m / 2],
        tl: [m + lw / 2, m + lh / 2],
        tr: [W - m - lw / 2, m + lh / 2],
        bl: [m + lw / 2, H - m - lh / 2],
        br: [W - m - lw / 2, H - m - lh / 2],
      }[s.logoAt];
      // in a corner, hug the edge rather than the middle of the 40% box
      const k = Math.min(lh / logo.height, lw / logo.width);
      const dw = logo.width * k;
      const cx = s.logoAt === "tl" || s.logoAt === "bl" ? m + dw / 2 : s.logoAt === "tr" || s.logoAt === "br" ? W - m - dw / 2 : at[0];
      logoHit = put(cx, at[1], lh, lw);
    }
  }
  return { plate, logo: logoHit };
}

/** Draws a pattern on its own canvas, once its pictures have loaded, and returns it as a PNG. */
export async function patternPng(s: PatternSettings): Promise<Blob | null> {
  const W = s.cols * s.pw;
  const H = s.rows * s.ph;
  if (W > 16384 || H > 16384) return null;
  const images = new Map<string, HTMLImageElement>();
  await Promise.all(
    [s.logo, ...s.pips.map((p) => p.img)]
      .filter((src): src is string => !!src)
      .map(
        (src) =>
          new Promise<void>((done) => {
            const img = new Image();
            img.onload = () => {
              images.set(src, img);
              done();
            };
            img.onerror = () => done();
            img.src = src;
          }),
      ),
  );
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  drawPattern(ctx, s, images);
  return new Promise((resolve) => c.toBlob(resolve, "image/png"));
}

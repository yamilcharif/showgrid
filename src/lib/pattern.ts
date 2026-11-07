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
  /** the screens saved so far, to open again or duplicate */
  library?: SavedScreen[];
  /** which saved screen is open in the editor */
  current?: string | null;
  /** several screens placed on one output canvas (a 4K output feeding four walls…) */
  output?: OutputMap;
  view?: "screen" | "output";
}

/** A screen kept in the list: its own settings, without the list or the output. */
export interface SavedScreen {
  id: string;
  name: string;
  s: PatternSettings;
}

/** A saved screen placed on the output, its top-left corner in output pixels. */
export interface OutputItem {
  id: string;
  screen: string;
  x: number;
  y: number;
}

export interface OutputMap {
  name: string;
  w: number;
  h: number;
  items: OutputItem[];
}

export const OUTPUT_SIZES = [
  { id: "hd", name: "HD 1920 × 1080", w: 1920, h: 1080 },
  { id: "qhd", name: "QHD 2560 × 1440", w: 2560, h: 1440 },
  { id: "uhd", name: "4K UHD 3840 × 2160", w: 3840, h: 2160 },
  { id: "dci", name: "4K DCI 4096 × 2160", w: 4096, h: 2160 },
  { id: "8k", name: "8K 7680 × 4320", w: 7680, h: 4320 },
];

/** One screen's own settings: the list, the output and the view left out. */
export function screenOf(s: PatternSettings): PatternSettings {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- left out on purpose
  const { library, current, output, view, ...rest } = s;
  return rest;
}

export const screenSize = (s: PatternSettings) => ({ w: s.cols * s.pw, h: s.rows * s.ph });

/** Where each placed screen sits on the output, with its size. */
export function outputRects(out: OutputMap, library: SavedScreen[]) {
  return out.items
    .map((it) => {
      const sc = library.find((l) => l.id === it.screen);
      if (!sc) return null;
      const { w, h } = screenSize(sc.s);
      return { item: it, screen: sc, x: it.x, y: it.y, w, h };
    })
    .filter((r): r is NonNullable<typeof r> => !!r);
}

/** Placed screens that overlap another, or run off the output. */
export function outputProblems(out: OutputMap, library: SavedScreen[]) {
  const rects = outputRects(out, library);
  const bad = new Map<string, "overlap" | "outside">();
  rects.forEach((a, i) => {
    if (a.x < 0 || a.y < 0 || a.x + a.w > out.w || a.y + a.h > out.h) bad.set(a.item.id, "outside");
    rects.forEach((b, j) => {
      if (i !== j && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) bad.set(a.item.id, "overlap");
    });
  });
  return bad;
}

/** The output: black, each screen's own pattern where it's placed, and a tag with the output's name and size. */
export function drawOutput(ctx: CanvasRenderingContext2D, out: OutputMap, library: SavedScreen[], images: Map<string, HTMLImageElement>) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, out.w, out.h);
  // a faint grid every 10% so empty pixels still read as part of the output
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 10; i++) {
    ctx.moveTo(Math.round((out.w * i) / 10) + 0.5, 0);
    ctx.lineTo(Math.round((out.w * i) / 10) + 0.5, out.h);
    ctx.moveTo(0, Math.round((out.h * i) / 10) + 0.5);
    ctx.lineTo(out.w, Math.round((out.h * i) / 10) + 0.5);
  }
  ctx.stroke();
  const rects = outputRects(out, library);
  for (const r of rects) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.translate(r.x, r.y);
    drawPattern(ctx, r.screen.s, images);
    ctx.restore();
  }
  // the output's own tag, bottom left, with where each screen starts
  const tag = Math.max(14, Math.round(Math.min(out.w, out.h) / 45));
  const lines = [`${out.name.trim() || "OUTPUT"} · ${out.w} × ${out.h}`, ...rects.map((r) => `${r.screen.s.name.trim() || r.screen.name} · ${r.w}×${r.h} @ ${r.x},${r.y}`)];
  ctx.font = `700 ${tag}px system-ui, sans-serif`;
  const tw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + tag;
  const th = lines.length * tag * 1.35 + tag * 0.6;
  ctx.fillStyle = "rgba(0,0,0,0.78)";
  ctx.fillRect(0, out.h - th, tw, th);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  lines.forEach((l, i) => {
    ctx.font = `${i ? 600 : 800} ${i ? Math.round(tag * 0.8) : tag}px system-ui, sans-serif`;
    ctx.fillText(l, tag / 2, out.h - th + tag * 0.3 + tag * 1.35 * (i + 0.5));
  });
  return rects;
}

/** Every picture a set of screens uses. */
export const screenImages = (list: PatternSettings[]) => [...new Set(list.flatMap((s) => [s.logo, ...s.pips.map((p) => p.img)]).filter((x): x is string => !!x))];

async function loadImages(srcs: string[]) {
  const images = new Map<string, HTMLImageElement>();
  await Promise.all(
    srcs.map(
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
  return images;
}

/** The output map as a PNG at its exact resolution. */
export async function outputPng(out: OutputMap, library: SavedScreen[]): Promise<Blob | null> {
  if (out.w > 16384 || out.h > 16384) return null;
  const images = await loadImages(screenImages(outputRects(out, library).map((r) => r.screen.s)));
  const c = document.createElement("canvas");
  c.width = out.w;
  c.height = out.h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  drawOutput(ctx, out, library, images);
  return new Promise((resolve) => c.toBlob(resolve, "image/png"));
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

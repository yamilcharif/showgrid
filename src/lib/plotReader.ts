/**
 * Reads a lighting or rigging plot (a drawing, not a table) from the words on the page and where they sit.
 * Next to each fixture symbol a plot prints its ID (101) and its patch (2.145, 1/333, 1-111); motors carry an ID
 * (M1, CM12) and a tag with their X/Y position. Pairs are made by distance, and each fixture takes the nearest
 * position name (LX1, POD 2, FOH…).
 */

interface Word {
  s: string;
  x: number;
  y: number;
  /** text height, to judge what "near" means at the plot's scale */
  size: number;
  w: number;
  page: number;
}

export interface PlotFixture {
  id: string;
  u: string;
  a: string;
  pos: string;
  /** the model, from the legend entry whose symbol matches this fixture's */
  type: string;
  /** the DMX mode, printed under the fixture or in the legend */
  mode: string;
}

/** A drawn path: where it sits on the page and what it's made of, to tell fixture symbols apart. */
interface Shape {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  lines: number;
  curves: number;
  subs: number;
  page: number;
}

/** What a symbol looks like, whatever its size or turn: its parts and its proportions. */
interface Signature {
  lines: number;
  curves: number;
  subs: number;
  /** short side over long side */
  ratio: number;
  area: number;
}

export interface LegendEntry {
  type: string;
  mode: string;
}

export interface PlotMotor {
  id: string;
  xy: string;
  pos: string;
}

export interface PlotResult {
  fixtures: PlotFixture[];
  /** the fixture models the legend lists */
  legend: LegendEntry[];
  motors: PlotMotor[];
  /** how many words the PDF had: none means it's an image or outlined text */
  words: number;
}

const PATCH = /^(\d{1,4})\s*[./\-:]\s*(\d{1,3})$/;
const ID = /^\d{1,5}[A-Z]?$/;
const MOTOR = /^(?:M|CM|MTR|MOTOR|HOIST|H|PT|P)\s?-?\s?(\d{1,3}[A-Z]?)$/i;
const POSITION =
  /^(?:(?:US|DS|MS|SL|SR|CS|MID|UP|DOWN|FRONT|BACK|REAR|BALC|BALCONY)\s+)?(?:LX|ELEC|E|FOH|POD|TRUSS|PIPE|BOOM|TOWER|LADDER|BRIDGE|CATWALK|BOX|BALC|BALCONY|DECK|FLOOR|SPOT|SPOTS|CLUSTER|ARC|RING|WING|SIDE|SIDEFILL|FINGER|BEAM|TRACK|GRID|HEADER|TORM|TORMENTOR|PROSC|PROSCENIUM|CYC|BORDER)(?:\d|\b)[\w ./#-]{0,10}$/i;
/** an X or Y measure: X 12'6", Y: -8', X=3.5m, 12'6" / 8'3" */
const COORD = /(?:^|\b)([XY])\s*[:=]?\s*(-?\d+(?:[.,]\d+)?\s*(?:m|cm|mm|['’]\s*-?\s*\d*(?:\s*["”])?|["”])?)/gi;

type Matrix = [number, number, number, number, number, number];
const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

/**
 * The paths drawn on a page, each with its box in page units and a count of its lines, curves and sub-paths.
 * Follows the drawing's transforms (and symbols placed as reusable forms) so everything lands where it's seen.
 */
async function readShapes(page: { getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[] }> }, ops: Record<string, number>, n: number): Promise<Shape[]> {
  const list = await page.getOperatorList();
  const shapes: Shape[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  for (let i = 0; i < list.fnArray.length && shapes.length < 60000; i++) {
    const fn = list.fnArray[i];
    const args = list.argsArray[i] as unknown[];
    if (fn === ops.save) stack.push(ctm);
    else if (fn === ops.restore) ctm = stack.pop() ?? ctm;
    else if (fn === ops.transform) ctm = mul(ctm, args as Matrix);
    else if (fn === ops.paintFormXObjectBegin) {
      stack.push(ctm);
      if (Array.isArray(args[0]) && args[0].length === 6) ctm = mul(ctm, args[0] as Matrix);
    } else if (fn === ops.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (fn === ops.constructPath) {
      // [paint op, [path data], [minX, minY, maxX, maxY]]; path data: 0 moveTo x y, 1 lineTo x y, 2 curveTo ×6, 3 quadratic ×4, 4 close
      const data = (args[1] as ArrayLike<number>[] | undefined)?.[0];
      const box = args[2] as ArrayLike<number> | undefined;
      if (!data || !box) continue;
      let lines = 0;
      let curves = 0;
      let subs = 0;
      for (let k = 0; k < data.length; ) {
        const op = data[k];
        if (op === 0) subs++;
        else if (op === 1) lines++;
        else if (op === 2 || op === 3) curves++;
        k += op === 0 || op === 1 ? 3 : op === 2 ? 7 : op === 3 ? 5 : 1;
      }
      const pts = [
        [box[0], box[1]],
        [box[2], box[1]],
        [box[0], box[3]],
        [box[2], box[3]],
      ].map(([x, y]) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]);
      const xs = pts.map((q) => q[0]);
      const ys = pts.map((q) => q[1]);
      if (!Number.isFinite(xs[0])) continue;
      shapes.push({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), lines, curves, subs, page: n });
    }
  }
  return shapes;
}

/** Words with their page position, rebuilt from the PDF's text pieces (a label can come in several pieces), and the drawn shapes. */
async function readPage(file: File): Promise<{ words: Word[]; shapes: Shape[] }> {
  const { getDocumentProxy, getResolvedPDFJS } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
  const { OPS } = (await getResolvedPDFJS()) as unknown as { OPS: Record<string, number> };
  const words: Word[] = [];
  const shapes: Shape[] = [];
  for (let p = 1; p <= Math.min(pdf.numPages, 60); p++) {
    const page = await pdf.getPage(p);
    try {
      shapes.push(...(await readShapes(page as never, OPS, p)));
    } catch {
      // drawings we can't follow: the model is left for the member to fill
    }
    const { items } = await page.getTextContent();
    const raw = items
      .filter((it): it is typeof it & { str: string; transform: number[]; width: number } => "str" in it && !!it.str.trim())
      .map((it) => ({ s: it.str, x: it.transform[4], y: it.transform[5], size: Math.hypot(it.transform[0], it.transform[1]) || 8, w: it.width }))
      .sort((a, b) => b.y - a.y || a.x - b.x);
    // glue pieces on the same baseline that touch: "2" "." "145" → "2.145"
    let cur: Word | null = null;
    for (const r of raw) {
      if (cur && Math.abs(r.y - cur.y) < cur.size * 0.3 && r.x - (cur.x + cur.w) < cur.size * 0.35 && r.x >= cur.x) {
        const gap = r.x - (cur.x + cur.w) > cur.size * 0.15 ? " " : "";
        cur.s += gap + r.s;
        cur.w = r.x + r.w - cur.x;
      } else {
        if (cur) words.push(cur);
        cur = { s: r.s, x: r.x, y: r.y, size: r.size, w: r.w, page: p };
      }
    }
    if (cur) words.push(cur);
  }
  return { words: words.map((w) => ({ ...w, s: w.s.replace(/\s+/g, " ").trim() })).filter((w) => w.s), shapes };
}

const signature = (group: Shape[]): Signature | null => {
  if (!group.length) return null;
  const x0 = Math.min(...group.map((g) => g.x0));
  const x1 = Math.max(...group.map((g) => g.x1));
  const y0 = Math.min(...group.map((g) => g.y0));
  const y1 = Math.max(...group.map((g) => g.y1));
  const w = x1 - x0;
  const h = y1 - y0;
  return {
    lines: group.reduce((a, g) => a + g.lines, 0),
    curves: group.reduce((a, g) => a + g.curves, 0),
    subs: group.reduce((a, g) => a + g.subs, 0),
    ratio: Math.min(w, h) / Math.max(w, h, 1e-6),
    area: Math.max(w * h, 1e-6),
  };
};

/** How different two symbols look: 0 is the same drawing. Counts matter most; size and proportions a little. */
function differ(a: Signature, b: Signature) {
  const rel = (p: number, q: number) => Math.abs(p - q) / (1 + Math.max(p, q));
  return rel(a.lines, b.lines) * 1.2 + rel(a.curves, b.curves) * 1.2 + rel(a.subs, b.subs) + Math.abs(a.ratio - b.ratio) + Math.min(1, Math.abs(Math.log(a.area / b.area)) * 0.15);
}

/** Paths that frame a word (the box or circle around an ID) belong to the label, not the symbol. */
const framesWord = (s: Shape, words: Word[]) =>
  words.some((w) => {
    if (w.page !== s.page) return false;
    const c = center(w);
    const inside = c.x > s.x0 && c.x < s.x1 && c.y > s.y0 && c.y < s.y1;
    return inside && s.x1 - s.x0 < w.w + w.size * 3 && s.y1 - s.y0 < w.size * 4;
  });

/** A short word or two that reads like a DMX mode: Basic, Mode 1, Extended, 16 bit, 1ch DWE, 37ch… */
const MODE = /\b(mode|basic|standard|std|ext(ended)?|compact|vector|pixel|bit|\d+\s*ch|ch\b|dwe|simple|full|reduced|direct|rgbw?)\b/i;

const center = (w: Word) => ({ x: w.x + w.w / 2, y: w.y + w.size / 2 });
const dist = (a: Word, b: Word) => {
  const p = center(a);
  const q = center(b);
  return Math.hypot(p.x - q.x, p.y - q.y);
};

/** Pairs each anchor with the nearest free candidate within reach, closest pairs first. */
function pair(anchors: Word[], candidates: Word[], reach: (a: Word) => number) {
  const options: { a: number; c: number; d: number }[] = [];
  anchors.forEach((a, i) =>
    candidates.forEach((c, j) => {
      if (c.page !== a.page) return;
      const d = dist(a, c);
      if (d <= reach(a)) options.push({ a: i, c: j, d });
    }),
  );
  options.sort((p, q) => p.d - q.d);
  const usedA = new Set<number>();
  const usedC = new Set<number>();
  const out = new Map<number, number>();
  for (const o of options) {
    if (usedA.has(o.a) || usedC.has(o.c)) continue;
    usedA.add(o.a);
    usedC.add(o.c);
    out.set(o.a, o.c);
  }
  return out;
}

/** The position name nearest to a word on the same page, if the plot names its positions. */
function nearestPosition(w: Word, positions: Word[]) {
  let best: Word | null = null;
  let bd = Infinity;
  for (const p of positions) {
    if (p.page !== w.page) continue;
    // trusses and pipes run across the page: being level with the label counts more than being beside it
    const a = center(w);
    const b = center(p);
    const d = Math.hypot((a.x - b.x) * 0.5, (a.y - b.y) * 1.5);
    if (d < bd) [best, bd] = [p, d];
  }
  return best?.s.toUpperCase() ?? "";
}

export async function readPlot(file: File): Promise<PlotResult> {
  const { words, shapes } = await readPage(file);
  const patches = words.filter((w) => {
    const m = w.s.match(PATCH);
    return m && Number(m[2]) >= 1 && Number(m[2]) <= 512 && Number(m[1]) >= 1;
  });
  const ids = words.filter((w) => ID.test(w.s) && !patches.includes(w));
  const positions = words.filter((w) => POSITION.test(w.s) && !PATCH.test(w.s));

  // a fixture's ID sits around its symbol, on either side of it, within a symbol or two of its patch;
  // closest pairs are made first, so neighbours don't steal each other's numbers
  const idOf = pair(patches, ids, (a) => a.size * 16);
  const symbolShapes = shapes.filter((sh) => !framesWord(sh, words));
  const legend = readLegend(words, symbolShapes, new Set([...patches, ...ids, ...positions]));
  const used = new Set<Word>([...patches, ...ids, ...positions, ...legend.flatMap((e) => e.words)]);
  const fixtures: PlotFixture[] = [];
  patches.forEach((p, i) => {
    const m = p.s.match(PATCH)!;
    const idWord = idOf.has(i) ? ids[idOf.get(i)!] : null;
    // the symbol sits between (or right by) the ID and the patch
    const a = center(p);
    const b = idWord ? center(idWord) : a;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const reach = Math.max(Math.hypot(a.x - b.x, a.y - b.y) * 0.65, p.size * 3);
    const group = symbolShapes.filter((sh) => {
      if (sh.page !== p.page) return false;
      const cx = (sh.x0 + sh.x1) / 2;
      const cy = (sh.y0 + sh.y1) / 2;
      return Math.hypot(cx - mid.x, cy - mid.y) < reach && Math.max(sh.x1 - sh.x0, sh.y1 - sh.y0) < reach * 3;
    });
    const sig = signature(group);
    let best: (typeof legend)[number] | null = null;
    let bd = legend.length === 1 ? 1.6 : 1.2;
    if (sig) for (const e of legend) {
      const d = differ(sig, e.sig);
      if (d < bd) [best, bd] = [e, d];
    }
    // a mode printed under the fixture wins over the legend's
    const below = words
      .filter((w) => w.page === p.page && !used.has(w) && MODE.test(w.s) && w.s.length <= 30 && dist(w, p) < p.size * 6)
      .sort((x, y) => dist(x, p) - dist(y, p))[0];
    fixtures.push({
      id: idWord?.s ?? "",
      u: String(Number(m[1])),
      a: String(Number(m[2])),
      pos: nearestPosition(idWord ?? p, positions),
      type: best?.type ?? "",
      mode: below?.s ?? best?.mode ?? "",
    });
  });
  fixtures.sort((a, b) => (Number.parseInt(a.id) || 1e9) - (Number.parseInt(b.id) || 1e9) || Number(a.u) - Number(b.u) || Number(a.a) - Number(b.a));

  // motors: an ID like M12, with X and Y measures in a tag close by
  const motorWords = words.filter((w) => MOTOR.test(w.s));
  const coordWords = words.filter((w) => /[XY]\s*[:=]?\s*-?\d/i.test(w.s) && !MOTOR.test(w.s));
  const motors: PlotMotor[] = motorWords.map((m) => {
    const near = coordWords.filter((c) => c.page === m.page && dist(c, m) <= m.size * 9).sort((a, b) => dist(a, m) - dist(b, m));
    let x = "";
    let y = "";
    for (const c of near) {
      for (const g of c.s.matchAll(COORD)) {
        if (g[1].toUpperCase() === "X" && !x) x = g[2].trim();
        if (g[1].toUpperCase() === "Y" && !y) y = g[2].trim();
      }
      if (x && y) break;
    }
    return { id: m.s.toUpperCase().replace(/\s+/g, ""), xy: x || y ? `X ${x || "?"} / Y ${y || "?"}` : "", pos: nearestPosition(m, positions) };
  });
  const seen = new Set<string>();
  const uniqueMotors = motors.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));

  return { fixtures, legend: legend.map((e) => ({ type: e.type, mode: e.mode })), motors: uniqueMotors, words: words.length };
}

/**
 * Legend entries: a line of text (the model) with a small drawing just to its left (the symbol). A line right under
 * it that reads like a mode, or a mode in brackets after the name, is the mode.
 */
function readLegend(words: Word[], shapes: Shape[], skip: Set<Word>) {
  const out: { type: string; mode: string; sig: Signature; words: Word[] }[] = [];
  for (const w of words) {
    if (skip.has(w) || !/[a-z]{2}/i.test(w.s) || w.s.length < 3 || /^(legend|key|symbol|leyenda|qty|count|cant)/i.test(w.s)) continue;
    const cy = w.y + w.size / 2;
    const group = shapes.filter(
      (sh) =>
        sh.page === w.page &&
        sh.x1 <= w.x + w.size * 0.5 &&
        sh.x1 > w.x - w.size * 10 &&
        Math.abs((sh.y0 + sh.y1) / 2 - cy) < w.size * 2.2 &&
        Math.max(sh.x1 - sh.x0, sh.y1 - sh.y0) < w.size * 9,
    );
    // the symbol is the drawing next to the name, not a long rule or frame line
    const sig = signature(group);
    if (!sig || sig.lines + sig.curves < 3) continue;
    const next = words.find((v) => v !== w && v.page === w.page && Math.abs(v.x - w.x) < w.size * 2 && w.y - v.y > 0 && w.y - v.y < w.size * 1.9 && MODE.test(v.s));
    const inline = w.s.match(/^(.*?)\s*[(\[–-]\s*([^()\[\]]*?(?:mode|basic|standard|ext|bit|ch)[^()\[\]]*)[)\]]?$/i);
    out.push({
      type: (inline ? inline[1] : w.s).trim(),
      mode: (inline ? inline[2] : next?.s ?? "").trim(),
      sig,
      words: next ? [w, next] : [w],
    });
  }
  // a word with drawings beside it that isn't a model (a note, a title) usually has no twin among the fixtures; keep distinct names
  const seen = new Set<string>();
  return out.filter((e) => (seen.has(e.type) ? false : (seen.add(e.type), true)));
}

/** Plot fixtures as rows for the label maker, with the column names it recognises. */
export function fixtureRows(f: PlotFixture[]): string[][] {
  return [["Fixture ID", "Position", "Instrument Type", "Mode", "Universe/Address"], ...f.map((x) => [x.id, x.pos, x.type, x.mode, `${x.u}/${x.a}`])];
}

export function motorRows(m: PlotMotor[]): string[][] {
  return [["Motor", "Position", "X / Y"], ...m.map((x) => [x.id, x.pos, x.xy])];
}

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
}

export interface PlotMotor {
  id: string;
  xy: string;
  pos: string;
}

export interface PlotResult {
  fixtures: PlotFixture[];
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

/** Words with their page position, rebuilt from the PDF's text pieces (a label can come in several pieces). */
async function readWords(file: File): Promise<Word[]> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
  const words: Word[] = [];
  for (let p = 1; p <= Math.min(pdf.numPages, 60); p++) {
    const page = await pdf.getPage(p);
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
  return words.map((w) => ({ ...w, s: w.s.replace(/\s+/g, " ").trim() })).filter((w) => w.s);
}

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
  const words = await readWords(file);
  const patches = words.filter((w) => {
    const m = w.s.match(PATCH);
    return m && Number(m[2]) >= 1 && Number(m[2]) <= 512 && Number(m[1]) >= 1;
  });
  const ids = words.filter((w) => ID.test(w.s) && !patches.includes(w));
  const positions = words.filter((w) => POSITION.test(w.s) && !PATCH.test(w.s));

  // a fixture's ID sits around its symbol, on either side of it, within a symbol or two of its patch;
  // closest pairs are made first, so neighbours don't steal each other's numbers
  const idOf = pair(patches, ids, (a) => a.size * 16);
  const fixtures: PlotFixture[] = [];
  patches.forEach((p, i) => {
    const m = p.s.match(PATCH)!;
    const idWord = idOf.has(i) ? ids[idOf.get(i)!] : null;
    fixtures.push({ id: idWord?.s ?? "", u: String(Number(m[1])), a: String(Number(m[2])), pos: nearestPosition(idWord ?? p, positions) });
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

  return { fixtures, motors: uniqueMotors, words: words.length };
}

/** Plot fixtures as rows for the label maker, with the column names it recognises. */
export function fixtureRows(f: PlotFixture[]): string[][] {
  return [["Fixture ID", "Position", "Instrument Type", "Mode", "Universe/Address"], ...f.map((x) => [x.id, x.pos, "", "", `${x.u}/${x.a}`])];
}

export function motorRows(m: PlotMotor[]): string[][] {
  return [["Motor", "Position", "X / Y"], ...m.map((x) => [x.id, x.pos, x.xy])];
}

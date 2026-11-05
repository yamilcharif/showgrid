/**
 * Sticker sheets for the label maker. Everything is in inches; A4 sheets are given in millimetres and converted.
 * Margins and gaps are what the manufacturer prints the sheet with, so labels land on the stickers.
 */

export interface Sheet {
  id: string;
  name: string;
  paper: "letter" | "a4";
  /** label size */
  w: number;
  h: number;
  /** distance from the page edge to the first label */
  top: number;
  left: number;
  /** space between labels, across and down */
  gapX: number;
  gapY: number;
  cols: number;
  rows: number;
}

const MM = 1 / 25.4;
export const PAPER = { letter: { w: 8.5, h: 11 }, a4: { w: 210 * MM, h: 297 * MM } } as const;

export const SHEETS: Sheet[] = [
  { id: "5160", name: "Avery 5160 · 2⅝ × 1 in · 30", paper: "letter", w: 2.625, h: 1, top: 0.5, left: 0.1875, gapX: 0.125, gapY: 0, cols: 3, rows: 10 },
  { id: "5163", name: "Avery 5163 · 4 × 2 in · 10", paper: "letter", w: 4, h: 2, top: 0.5, left: 0.15625, gapX: 0.1875, gapY: 0, cols: 2, rows: 5 },
  { id: "5164", name: "Avery 5164 · 4 × 3⅓ in · 6", paper: "letter", w: 4, h: 10 / 3, top: 0.5, left: 0.15625, gapX: 0.1875, gapY: 0, cols: 2, rows: 3 },
  { id: "5167", name: "Avery 5167 · 1¾ × ½ in · 80", paper: "letter", w: 1.75, h: 0.5, top: 0.5, left: 0.28125, gapX: 0.3125, gapY: 0, cols: 4, rows: 20 },
  { id: "5168", name: "Avery 5168 · 3½ × 5 in · 4", paper: "letter", w: 3.5, h: 5, top: 0.5, left: 0.5, gapX: 0.5, gapY: 0, cols: 2, rows: 2 },
  { id: "22806", name: "Avery 22806 · 2 × 2 in · 12", paper: "letter", w: 2, h: 2, top: 0.625, left: 0.625, gapX: 0.625, gapY: 0.5833, cols: 3, rows: 4 },
  { id: "5165", name: "Avery 5165 · 8½ × 11 in · 1", paper: "letter", w: 8.5, h: 11, top: 0, left: 0, gapX: 0, gapY: 0, cols: 1, rows: 1 },
  { id: "L7160", name: "Avery L7160 · 63.5 × 38.1 mm · 21", paper: "a4", w: 63.5 * MM, h: 38.1 * MM, top: 15.1 * MM, left: 7.2 * MM, gapX: 2.5 * MM, gapY: 0, cols: 3, rows: 7 },
  { id: "L7163", name: "Avery L7163 · 99.1 × 38.1 mm · 14", paper: "a4", w: 99.1 * MM, h: 38.1 * MM, top: 15.1 * MM, left: 4.65 * MM, gapX: 2.5 * MM, gapY: 0, cols: 2, rows: 7 },
  { id: "L7165", name: "Avery L7165 · 99.1 × 67.7 mm · 8", paper: "a4", w: 99.1 * MM, h: 67.7 * MM, top: 13.1 * MM, left: 4.65 * MM, gapX: 2.5 * MM, gapY: 0, cols: 2, rows: 4 },
];

/** A sheet of your own size: as many labels as fit between equal margins. */
export function customSheet(s: Omit<Sheet, "id" | "name" | "cols" | "rows">): Sheet {
  const p = PAPER[s.paper];
  const fit = (page: number, margin: number, size: number, gap: number) => Math.max(1, Math.floor((page - 2 * margin + gap + 1e-6) / (size + gap)));
  return { ...s, id: "custom", name: "", cols: fit(p.w, s.left, s.w, s.gapX), rows: fit(p.h, s.top, s.h, s.gapY) };
}

// ---------- reading lists ----------

/** Splits text into rows and columns: CSV, TSV or semicolons when there are any, else wide gaps (PDF tables), else one column. */
export function parseTable(text: string): string[][] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (!lines.length) return [];
  const first = lines.slice(0, 5).join("\n");
  const count = (c: string) => first.split(c).length - 1;
  const delim = count("\t") >= lines.slice(0, 5).length ? "\t" : count(";") >= lines.slice(0, 5).length ? ";" : count(",") >= lines.slice(0, 5).length ? "," : null;
  if (!delim) return lines.map((l) => l.trim().split(/\s{2,}/));
  // quoted fields may hold the delimiter: "Moving head, 2-way"
  return lines.map((line) => {
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = !quoted;
      } else if (ch === delim && !quoted) {
        out.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  });
}

/** Rows of an Excel, CSV, text or PDF file. */
export async function readTable(file: File): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import("read-excel-file/universal");
    const rows = (await readSheet(file)) as unknown[][];
    return rows.map((r) => r.map((c) => (c == null ? "" : c instanceof Date ? c.toLocaleDateString() : String(c))));
  }
  if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
    const { pdfText } = await import("./rider");
    return parseTable(await pdfText(file));
  }
  return parseTable(await file.text());
}

// ---------- the label maker's settings ----------

export const BAND_COLORS = ["#e4572e", "#4c9be8", "#f2c14e", "#59c9a5", "#b07fe0", "#ff8fab", "#90be6d", "#f3a712", "#5dd9c1", "#8d99ae"];
export const MAX_ROWS = 3000;

export type Band = "none" | "left" | "top";
/** "general": the columns you pick, in lines. "fixture": a lighting sticker, big ID, position, type, U: and A:. */
export type Template = "general" | "fixture";
/** Which column holds each part of a fixture sticker; -1 when there's none. */
export interface FixtureCols {
  id: number;
  pos: number;
  type: number;
  mode: number;
  uni: number;
  addr: number;
}
export type LabelSide = "left" | "right" | "top";

export interface LabelSettings {
  rows: string[][];
  headers: boolean;
  /** column indexes printed, in order; the first is the big line */
  fields: number[];
  extra: string;
  copies: number;
  /** column holding a copy count, or -1 */
  qtyCol: number;
  bg: string;
  ink: string;
  accent: string;
  band: Band;
  /** column whose values pick the band color, or -1 for one color */
  colorBy: number;
  align: "left" | "center";
  logo: string | null;
  logoSide: LabelSide;
  sheetId: string;
  custom: Omit<Sheet, "id" | "name" | "cols" | "rows">;
  metric: boolean;
  startAt: number;
  outline: boolean;
  template?: Template;
  fx?: FixtureCols;
  /** fixture stickers colored all over (by position), with black or white text to suit */
  fxFill?: boolean;
  /** a chosen color for some values of the color-by column: {"LX1": "#e53935"} */
  valueColors?: Record<string, string>;
  /** logo height as a share of the label's height; unset uses the layout's own size */
  logoSize?: number;
  /** where the logo was dragged to: its centre, as a share of the label's width and height */
  logoPos?: { x: number; y: number } | null;
  /** text size, times the layout's own (1 = as designed) */
  textScale?: number;
}

export const LABELS_START: LabelSettings = {
  rows: [],
  headers: true,
  fields: [],
  extra: "",
  copies: 1,
  qtyCol: -1,
  bg: "#ffffff",
  ink: "#0b0b0c",
  accent: "#ff3b3b",
  band: "left",
  colorBy: -1,
  align: "left",
  logo: null,
  logoSide: "right",
  sheetId: "5163",
  custom: { paper: "letter", w: 4, h: 2, top: 0.5, left: 0.25, gapX: 0.125, gapY: 0.125 },
  metric: false,
  startAt: 1,
  outline: false,
};

export interface Label {
  key: string;
  lines: string[];
  band: string;
  /** the parts of a fixture sticker */
  fx?: { id: string; pos: string; type: string; mode: string; u: string; a: string };
}

const NO_FX: FixtureCols = { id: -1, pos: -1, type: -1, mode: -1, uni: -1, addr: -1 };

/**
 * Finds the fixture columns of a patch list or plot report by their names: Unit Number / Fixture ID / Channel,
 * Position, Instrument Type, Mode, Universe and Address (or "Universe/Address" in one column).
 */
export function detectFixture(head: string[]): FixtureCols {
  const find = (re: RegExp, not?: RegExp) => head.findIndex((h) => re.test(h.trim()) && !(not && not.test(h.trim())));
  const fx: FixtureCols = {
    id: find(/^(unit ?(number|no|#)|fixture ?(id|#|no|number)|id|#|ch(an(nel)?)?|channel ?#?|purpose ?id|fid)$/i),
    pos: find(/position|^pos\b|location|truss|pipe|posici[oó]n|ubicaci[oó]n/i),
    type: find(/instrument ?type|fixture ?type|^type$|^fixture$|model|^device|equipo|tipo|aparato/i, /id|#|number/i),
    mode: find(/mode|personality|modo/i),
    uni: find(/universe|^univ|^u$|universo/i),
    addr: find(/address|^addr|^dmx|^a$|direcci[oó]n/i),
  };
  return fx;
}

/** "1/506", "1.506", "1:506" → universe 1, address 506; an absolute 2048 → universe 4, address 512. */
export function splitPatch(u: string, a: string): { u: string; a: string } {
  const both = (a || u).match(/^\s*(\d+)\s*[/.:\-]\s*(\d+)\s*$/);
  if (both) return { u: both[1], a: both[2] };
  const n = Number(a);
  if (!u && Number.isInteger(n) && n > 512) return { u: String(Math.floor((n - 1) / 512) + 1), a: String(((n - 1) % 512) + 1) };
  return { u: u.trim(), a: a.trim() };
}

/** Black or white, whichever reads better on a background color. */
export function inkFor(bg: string) {
  const m = bg.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return "#000000";
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? "#000000" : "#ffffff";
}

/** Every label to print, in order: one per row (or per copy), with its lines and band color. */
export function buildLabels(s: LabelSettings): Label[] {
  const body = s.headers ? s.rows.slice(1) : s.rows;
  const values = s.colorBy >= 0 ? [...new Set(body.map((r) => r[s.colorBy] ?? ""))] : [];
  const out: Label[] = [];
  body.forEach((r, i) => {
    const v = r[s.colorBy] ?? "";
    const band = s.colorBy >= 0 ? s.valueColors?.[v] ?? BAND_COLORS[values.indexOf(v) % BAND_COLORS.length] : s.accent;
    const n = s.qtyCol >= 0 ? Math.max(0, Math.min(500, Math.round(Number(String(r[s.qtyCol]).replace(/[^\d.]/g, "")) || 0))) : s.copies;
    if (s.template === "fixture") {
      const fx = s.fx ?? NO_FX;
      const cell = (c: number) => (c >= 0 ? (r[c] ?? "").trim() : "");
      const id = cell(fx.id);
      if (!id && !cell(fx.type)) return;
      const patch = splitPatch(fx.uni === fx.addr ? "" : cell(fx.uni), cell(fx.addr));
      const f = { id, pos: cell(fx.pos), type: cell(fx.type), mode: cell(fx.mode), u: patch.u, a: patch.a };
      for (let k = 0; k < n; k++) out.push({ key: `${i}-${k}`, lines: [id, f.type, f.mode].filter(Boolean), band, fx: f });
      return;
    }
    const lines = s.fields.map((c) => r[c] ?? "").filter((v) => v.trim());
    if (!lines.length) return;
    for (let k = 0; k < n; k++) out.push({ key: `${i}-${k}`, lines, band });
  });
  return out;
}

/** The sheet a label maker setting prints on. */
export function sheetOf(s: LabelSettings): Sheet {
  return s.sheetId === "custom" ? customSheet(s.custom) : SHEETS.find((x) => x.id === s.sheetId) ?? SHEETS[1];
}

/** The values of the color-by column, each with the color its labels get. */
export function colorKey(s: LabelSettings): { value: string; color: string }[] {
  if (s.colorBy < 0) return [];
  const body = s.headers ? s.rows.slice(1) : s.rows;
  const values = [...new Set(body.map((r) => r[s.colorBy] ?? ""))];
  return values.map((value, i) => ({ value, color: s.valueColors?.[value] ?? BAND_COLORS[i % BAND_COLORS.length] }));
}

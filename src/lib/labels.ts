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

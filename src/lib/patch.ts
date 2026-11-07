/**
 * The patch: one row per fixture (ID, type, mode, position, universe, address, footprint, notes), read from
 * an MVR, a grandMA XML export, a PDF report or a spreadsheet, edited as a table, then printed as an
 * "Address Patch By Fixture" report and as one sticker per fixture. GDTF files give each type its modes.
 * Runs in the browser.
 */

import { detectFixture, splitPatch } from "./labels";

export interface PatchRow {
  key: string;
  /** fixture ID (or unit number / channel) as written on the plot */
  fid: string;
  type: string;
  mode: string;
  pos: string;
  /** position color, for the sticker paper: a name (green, verde) or #hex */
  color: string;
  u: string;
  a: string;
  /** DMX channels the fixture takes */
  foot: string;
  notes: string;
}

/** A fixture type from a GDTF file (or an MVR): its name and the footprint of each mode. */
export interface FixtureType {
  name: string;
  maker: string;
  modes: { name: string; foot: number }[];
}

export interface PatchSettings {
  rows: PatchRow[];
  types: FixtureType[];
  /** report header and footer */
  show: string;
  job: string;
  by: string;
  rev: string;
  logo: string | null;
  page: "a4" | "letter";
  /** sticker sheet (see SHEETS in labels.ts) and a nudge for printers that drift, in points */
  sheetId: string;
  offX: number;
  offY: number;
  /** universe and address with 3 digits on stickers: 2 → 002 */
  pad: boolean;
  /** stickers colored by position (for white paper); off = black on colored label paper */
  fill: boolean;
}

export const PATCH_START: PatchSettings = {
  rows: [],
  types: [],
  show: "",
  job: "",
  by: "",
  rev: "",
  logo: null,
  page: "a4",
  sheetId: "22822",
  offX: 0,
  offY: 0,
  pad: true,
  fill: false,
};

export const MAX_FIXTURES = 3000;
export const uid = () => Math.random().toString(36).slice(2, 10);

export const blankRow = (): PatchRow => ({ key: uid(), fid: "", type: "", mode: "", pos: "", color: "", u: "", a: "", foot: "", notes: "" });

// ---------- tidying ----------

/** "Clay Paky Xtylos 30ch.lit" → "30ch"; "Mode 1" stays. */
export function cleanMode(m: string) {
  const s = m.trim().replace(/\.lit$/i, "");
  const ch = s.match(/\d+\s?ch\b.*/i);
  return ch ? ch[0].trim() : s;
}

/** The channel count in a mode name: "30ch" → 30. */
export function footFromMode(m: string) {
  const ch = m.match(/(\d+)\s?ch/i);
  return ch ? ch[1] : "";
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** The GDTF type a row's type name stands for, if one was loaded. */
export function typeFor(types: FixtureType[], name: string): FixtureType | undefined {
  const n = norm(name);
  if (!n) return;
  return types.find((t) => norm(t.name) === n || norm(`${t.maker} ${t.name}`) === n) ?? types.find((t) => n.includes(norm(t.name)) || norm(t.name).includes(n));
}

/** A row's footprint: what's written, else the GDTF mode's, else the "NNch" in the mode name. */
export function footOf(r: PatchRow, types: FixtureType[]): number {
  const n = Number(r.foot);
  if (n > 0) return n;
  const m = typeFor(types, r.type)?.modes.find((x) => norm(x.name) === norm(r.mode));
  if (m) return m.foot;
  return Number(footFromMode(r.mode)) || 0;
}

/** Fills in what a row can work out on its own: footprint from the mode, universe and address split. */
function finish(r: Partial<PatchRow>): PatchRow {
  const row = { ...blankRow(), ...r };
  for (const k of ["fid", "type", "mode", "pos", "color", "u", "a", "foot", "notes"] as const) row[k] = String(row[k] ?? "").trim();
  const p = splitPatch(row.u, row.a);
  row.u = p.u.replace(/^0+(?=\d)/, "");
  row.a = p.a.replace(/^0+(?=\d)/, "");
  if (!row.foot) row.foot = footFromMode(row.mode);
  return row;
}

/** Keeps the rows that are fixtures: they have an ID or a type, and something else besides. */
function keepFixtures(rows: PatchRow[]) {
  return rows.filter((r) => (r.fid || r.type) && [r.fid, r.type, r.mode, r.u, r.a, r.pos].filter(Boolean).length >= 2).slice(0, MAX_FIXTURES);
}

// ---------- spreadsheets (Excel, CSV, Vectorworks reports) ----------

type Col = "fid" | "fid2" | "type" | "mode" | "pos" | "color" | "u" | "a" | "foot" | "notes";

/** Which column holds what, from the header names. */
function headerMap(head: string[]): Partial<Record<Col, number>> {
  const fx = detectFixture(head);
  const find = (re: RegExp) => head.findIndex((h) => re.test(h.trim()));
  const out: Partial<Record<Col, number>> = {};
  // Vectorworks: Unit Number is the sticker ID when there is one, else Fixture ID, else Channel
  const unit = find(/^unit ?(number|no|#)$/i);
  const fid = find(/^(fixture ?(id|#|no|number)|fid)$/i);
  const ids = [unit, fid, fx.id].filter((i, k, all) => i >= 0 && all.indexOf(i) === k);
  if (ids.length) out.fid = ids[0];
  // a row without a unit number takes its fixture ID or channel
  if (ids.length > 1) out.fid2 = ids[1];
  if (fx.type >= 0) out.type = fx.type;
  if (fx.mode >= 0) out.mode = fx.mode;
  if (fx.pos >= 0) out.pos = fx.pos;
  if (fx.uni >= 0) out.u = fx.uni;
  if (fx.addr >= 0) out.a = fx.addr;
  const color = find(/colou?r|^gel$/i);
  if (color >= 0 && color !== out.pos) out.color = color;
  // "Channel" alone is the console channel (an ID), not a channel count
  const foot = find(/footprint|channel ?count|^#\s?(of )?ch(s|annels)?$|^chs$|canales/i);
  if (foot >= 0 && foot !== out.fid) out.foot = foot;
  const notes = find(/^(notes?|purpose|comments?|notas?|uso)$/i);
  if (notes >= 0) out.notes = notes;
  return out;
}

/**
 * Rows of a spreadsheet as a patch. The header is the first row (in the first 40) that names at least three
 * patch columns, so titles, tour names and dates above it are left out.
 */
export function fromTable(table: string[][]): PatchRow[] {
  let at = -1;
  let map: Partial<Record<Col, number>> = {};
  for (let i = 0; i < Math.min(40, table.length); i++) {
    const m = headerMap(table[i].map((c) => String(c ?? "")));
    const score = ["fid", "type", "mode", "pos", "u", "a"].filter((k) => m[k as Col] != null).length;
    if (score >= 3) {
      at = i;
      map = m;
      break;
    }
  }
  if (at < 0) return [];
  const rows = table.slice(at + 1).map((r) => {
    const cell = (k: Col) => (map[k] != null ? String(r[map[k]!] ?? "") : "");
    // "2/145" in one Universe/Address column
    const both = map.u != null && map.u === map.a;
    return finish({ fid: cell("fid") || cell("fid2"), type: cell("type"), mode: cleanMode(cell("mode")), pos: cell("pos"), color: cell("color").split(",")[0], u: both ? "" : cell("u"), a: cell("a"), foot: cell("foot"), notes: cell("notes") });
  });
  return keepFixtures(rows);
}

// ---------- XML: MVR scenes, grandMA2 and grandMA3 exports ----------

/** Text of an element's first child with one of these names (any depth with deep=true). */
function child(el: Element, names: string[], deep = false): Element | null {
  const want = names.map((n) => n.toLowerCase());
  const list = deep ? el.getElementsByTagName("*") : el.children;
  for (const c of Array.from(list)) if (want.includes(c.localName.toLowerCase())) return c;
  return null;
}
function attr(el: Element, names: string[]): string {
  for (const n of names) for (const a of Array.from(el.attributes)) if (a.name.toLowerCase() === n.toLowerCase() && a.value.trim()) return a.value.trim();
  return "";
}
const text = (el: Element | null) => el?.textContent?.trim() ?? "";

/** "1.001", "1/1", "1-1" → universe and address; a plain number is absolute (1025 → 3.1). */
function patchOf(v: string): { u: string; a: string } {
  const s = v.trim();
  if (!s || /^none$/i.test(s)) return { u: "", a: "" };
  const m = s.match(/^(\d+)\s*[./:\-]\s*(\d+)$/);
  if (m) return { u: String(Number(m[1])), a: String(Number(m[2])) };
  const n = Number(s);
  if (Number.isInteger(n) && n > 0) return { u: String(Math.floor((n - 1) / 512) + 1), a: String(((n - 1) % 512) + 1) };
  return { u: "", a: "" };
}

/** "Robe Lighting@Robin 600 LEDWash.gdtf" → "Robin 600 LEDWash"; "7 MegaPointe" (MA3) → "MegaPointe". */
function typeName(v: string) {
  return v
    .replace(/\.gdtf$/i, "")
    .replace(/^.*@/, "")
    .replace(/^\d+\s+(?=\D)/, "")
    .replace(/_/g, " ")
    .trim();
}

/** The fixtures of an MVR scene or a console's XML export. */
export function fromXml(xml: string, gdtf: FixtureType[] = []): PatchRow[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return [];
  // MVR positions are named once and pointed to by uuid
  const names = new Map<string, string>();
  for (const p of Array.from(doc.getElementsByTagName("*"))) {
    if (/^(position|class)$/i.test(p.localName) && p.getAttribute("uuid") && p.getAttribute("name")) names.set(p.getAttribute("uuid")!.toLowerCase(), p.getAttribute("name")!);
  }
  const rows: PatchRow[] = [];
  for (const el of Array.from(doc.getElementsByTagName("*"))) {
    if (!/^fixture$/i.test(el.localName)) continue;
    // a sub-fixture (a cell of a multi-instance fixture) belongs to the fixture above it
    let up = el.parentElement;
    let nested = false;
    while (up) {
      if (/^fixture$/i.test(up.localName)) nested = true;
      up = up.parentElement;
    }
    if (nested) continue;

    const fid = attr(el, ["FID", "fixture_id", "FixtureID", "channel_id", "id"]) || text(child(el, ["FixtureID", "UnitNumber", "FixtureIDNumeric"])) || attr(el, ["CID"]);
    const unit = text(child(el, ["UnitNumber"]));
    const typeEl = child(el, ["FixtureType"]);
    const type = typeName(attr(el, ["FixtureType", "Type"]) || (typeEl ? attr(typeEl, ["name"]) : "") || text(child(el, ["GDTFSpec"])) || "");
    const mode = attr(el, ["Mode", "DMXMode"]) || text(child(el, ["GDTFMode", "Mode", "DMXMode"])) || (typeEl ? attr(typeEl, ["mode"]) : "");
    // MVR: <Addresses><Address break="0">1025</Address>; MA3: Patch="1.001"; MA2: <Patch><Address>1025</Address>
    let patch = attr(el, ["Patch", "Address", "DMX"]);
    if (!patch) {
      const addrs = Array.from(el.getElementsByTagName("*")).filter((c) => /^address$/i.test(c.localName));
      const first = addrs.find((a) => (a.getAttribute("break") ?? "0") === "0") ?? addrs[0];
      patch = text(first ?? null);
    }
    const posRef = text(child(el, ["Position"])) || attr(el, ["Position", "Layer"]);
    const pos = names.get(posRef.toLowerCase()) ?? (/^[0-9a-f-]{36}$/i.test(posRef) ? "" : posRef);
    const name = attr(el, ["name"]);
    const t = typeFor(gdtf, type);
    const m = t?.modes.find((x) => norm(x.name) === norm(mode));
    rows.push(
      finish({
        fid: unit && /^\d+$/.test(unit) && !fid ? unit : fid || unit,
        type: type || name,
        mode: cleanMode(mode),
        pos,
        ...patchOf(patch),
        foot: m ? String(m.foot) : "",
        // the fixture's own name only when it says more than its type ("Wash 1", not "MegaPointe")
        notes: name && !/^\d+$/.test(name) && !norm(type).includes(norm(name)) && !norm(name).includes(norm(type)) && !/^(spot|wash|beam|profile|par|led|fixture)$/i.test(name) ? name : "",
      }),
    );
  }
  return keepFixtures(rows);
}

// ---------- GDTF and MVR files (zips) ----------

async function unzip(buf: ArrayBuffer) {
  const { unzipSync, strFromU8 } = await import("fflate");
  const files = unzipSync(new Uint8Array(buf));
  return { files, str: (name: string) => (files[name] ? strFromU8(files[name]) : "") };
}

/** A fixture type's name, maker and modes (with the channels each takes) from a GDTF description. */
export function gdtfFromXml(xml: string): FixtureType | null {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const ft = doc.getElementsByTagName("FixtureType")[0];
  if (!ft) return null;
  const modes = Array.from(ft.getElementsByTagName("DMXMode")).map((m) => {
    let foot = 0;
    for (const c of Array.from(m.getElementsByTagName("DMXChannel"))) {
      if ((c.getAttribute("DMXBreak") ?? "1") !== "1") continue;
      for (const o of (c.getAttribute("Offset") ?? "").split(",")) {
        const n = Number(o);
        if (n > foot) foot = n;
      }
    }
    return { name: m.getAttribute("Name") ?? "", foot };
  });
  return { name: ft.getAttribute("LongName") || ft.getAttribute("Name") || "", maker: ft.getAttribute("Manufacturer") ?? "", modes: modes.filter((m) => m.name) };
}

export async function readGdtf(file: File): Promise<FixtureType | null> {
  const { str } = await unzip(await file.arrayBuffer());
  return gdtfFromXml(str("description.xml"));
}

/** An MVR: the scene's fixtures, and the GDTF types packed with it. */
export async function readMvr(file: File): Promise<{ rows: PatchRow[]; types: FixtureType[] }> {
  const { files, str } = await unzip(await file.arrayBuffer());
  const { strFromU8, unzipSync } = await import("fflate");
  const types: FixtureType[] = [];
  for (const [name, data] of Object.entries(files)) {
    if (!/\.gdtf$/i.test(name)) continue;
    try {
      const inner = unzipSync(data);
      const t = inner["description.xml"] && gdtfFromXml(strFromU8(inner["description.xml"]));
      if (t) types.push(t);
    } catch {
      // a broken GDTF: the fixtures still load, without its modes
    }
  }
  const scene = str("GeneralSceneDescription.xml") || str(Object.keys(files).find((n) => /\.xml$/i.test(n)) ?? "");
  return { rows: fromXml(scene, types), types };
}

// ---------- PDF reports ----------

interface Piece {
  s: string;
  x: number;
  x1: number;
  y: number;
  size: number;
}

/** The text of each PDF page as lines of phrases (pieces closer than a space apart are joined). */
async function pdfLines(file: File): Promise<Piece[][][]> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
  const pages: Piece[][][] = [];
  for (let p = 1; p <= Math.min(pdf.numPages, 150); p++) {
    const page = await pdf.getPage(p);
    const { items } = await page.getTextContent();
    const pieces: Piece[] = [];
    for (const it of items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const size = Math.hypot(it.transform[2], it.transform[3]) || 8;
      pieces.push({ s: it.str.trim(), x: it.transform[4], x1: it.transform[4] + (it.width || it.str.length * size * 0.5), y: it.transform[5], size });
    }
    // lines: pieces whose baselines are within a third of the text height
    pieces.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: Piece[][] = [];
    for (const pc of pieces) {
      const line = lines.find((l) => Math.abs(l[0].y - pc.y) < Math.max(2, pc.size * 0.35));
      if (line) line.push(pc);
      else lines.push([pc]);
    }
    pages.push(
      lines.map((l) => {
        l.sort((a, b) => a.x - b.x);
        const out: Piece[] = [];
        for (const pc of l) {
          const last = out[out.length - 1];
          if (last && pc.x - last.x1 < pc.size * 0.45) {
            last.s += (pc.x - last.x1 > pc.size * 0.1 ? " " : "") + pc.s;
            last.x1 = pc.x1;
          } else out.push({ ...pc });
        }
        return out;
      }),
    );
  }
  return pages;
}

const COLOR_WORDS = /^(red|green|violet|purple|grey|gray|brown|orange|yellow|blue|white|black|pink|cyan|magenta|rojo|verde|violeta|morado|gris|marr[oó]n|caf[eé]|naranja|amarillo|azul|blanco|negro|rosa)$/i;

/**
 * A patch report or any PDF table with a header row (Fixture ID / Type / Mode / Universe / Address…).
 * Lines between tables name the fixture type (a banner left of the table) or the position (a block header).
 */
export async function fromPdf(file: File): Promise<PatchRow[]> {
  const pages = await pdfLines(file);
  const rows: PatchRow[] = [];
  for (const lines of pages) {
    let cols: { k: Col; x: number }[] | null = null;
    let left = 0;
    let type = "";
    let mode = "";
    let pos = "";
    let color = "";
    // a line between tables: the fixture type (a banner, left of the table) or a position block header
    const between = (line: Piece[]) => {
      if (line.length > 6 || line.some((p) => /^(page|p[aá]gina)\b|exported|revision|^\d{4}-\d\d-\d\d/i.test(p.s))) return;
      const words = line.map((p) => p.s);
      if (line[0].x < left - 20) {
        type = words[0];
        mode = words.length > 1 ? words[words.length - 1] : "";
        pos = "";
        color = "";
      } else {
        pos = words.filter((w) => !COLOR_WORDS.test(w))[0] ?? pos;
        // our own report's group for fixtures without one
        if (/^no position$/i.test(pos)) pos = "";
        color = words.find((w) => COLOR_WORDS.test(w))?.toLowerCase() ?? "";
      }
    };
    // the last line before the first table header of a page, read once that header says where the table starts
    let before: Piece[] | null = null;
    for (const line of lines) {
      const head = line.map((p) => p.s);
      const m = headerMap(head);
      const named = (Object.keys(m) as Col[]).filter((k) => k !== "color");
      if (named.length >= 3 && (m.a != null || m.u != null)) {
        cols = named.filter((k) => k !== "fid2").map((k) => ({ k, x: (line[m[k]!].x + line[m[k]!].x1) / 2 })).sort((a, b) => a.x - b.x);
        left = Math.min(...line.map((p) => p.x));
        if (before) between(before);
        before = null;
        continue;
      }
      if (!cols) {
        before = line;
        continue;
      }
      // a data row: a number sits under the address (or the ID) column
      const at = (p: Piece) => {
        const c = (p.x + p.x1) / 2;
        let best = cols![0];
        for (const col of cols!) if (Math.abs(col.x - c) < Math.abs(best.x - c)) best = col;
        return best.k;
      };
      const cells: Partial<Record<Col, string>> = {};
      for (const p of line) {
        const k = at(p);
        cells[k] = cells[k] ? `${cells[k]} ${p.s}` : p.s;
      }
      const numeric = (v?: string) => !!v && /^\d+([./:\-]\d+)?$/.test(v.trim());
      if (line.length >= 3 && (numeric(cells.a) || numeric(cells.u)) && (cells.fid || cells.type)) {
        rows.push(
          finish({
            fid: cells.fid,
            type: cells.type || type,
            mode: cleanMode(cells.mode || mode),
            pos: cells.pos || pos,
            color,
            u: cells.u,
            a: cells.a,
            foot: numeric(cells.foot) ? cells.foot : "",
            notes: cells.notes,
          }),
        );
        continue;
      }
      // headers between tables; page numbers, stamps and footers are skipped
      between(line);
    }
  }
  return keepFixtures(rows);
}

// ---------- reading any file ----------

export type PatchFile = "mvr" | "gdtf" | "xml" | "pdf" | "table";

export function kindOf(f: File): PatchFile {
  const n = f.name.toLowerCase();
  if (n.endsWith(".mvr")) return "mvr";
  if (n.endsWith(".gdtf")) return "gdtf";
  if (n.endsWith(".xml")) return "xml";
  if (n.endsWith(".pdf") || f.type === "application/pdf") return "pdf";
  return "table";
}

/** The patch in a file: MVR, console XML, PDF report or plot, Excel or CSV. */
export async function readPatchFile(f: File, types: FixtureType[]): Promise<{ rows: PatchRow[]; types: FixtureType[] }> {
  const kind = kindOf(f);
  if (kind === "mvr") return readMvr(f);
  if (kind === "xml") return { rows: fromXml(await f.text(), types), types: [] };
  if (kind === "pdf") {
    const rows = await fromPdf(f);
    if (rows.length) return { rows, types: [] };
    // a drawing rather than a report: fixtures read off the plot
    const { readPlot, fixtureRows } = await import("./plotReader");
    const plot = await readPlot(f);
    if (plot.fixtures.length) return { rows: fromTable(fixtureRows(plot.fixtures)), types: [] };
    const { readTable } = await import("./labels");
    return { rows: fromTable(await readTable(f)), types: [] };
  }
  const { readTable } = await import("./labels");
  return { rows: fromTable(await readTable(f)), types: [] };
}

// ---------- checking and re-patching ----------

/** Rows whose channels overlap another fixture's, or run past 512. */
export function conflicts(rows: PatchRow[], types: FixtureType[]): Map<string, string> {
  const out = new Map<string, string>();
  const spans = rows
    .map((r) => {
      const u = Number(r.u);
      const a = Number(r.a);
      if (!(u > 0 && a > 0)) return null;
      const foot = Math.max(1, footOf(r, types));
      if (a + foot - 1 > 512) out.set(r.key, `> 512`);
      return { r, start: (u - 1) * 512 + a, end: (u - 1) * 512 + a + foot - 1 };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((x, y) => x.start - y.start);
  for (let i = 0; i < spans.length; i++)
    for (let j = i + 1; j < spans.length && spans[j].start <= spans[i].end; j++) {
      out.set(spans[i].r.key, spans[j].r.fid || "?");
      out.set(spans[j].r.key, spans[i].r.fid || "?");
    }
  return out;
}

/** Patches the chosen rows one after the other from a universe and address, a fixture never split across universes. */
export function repatch(rows: PatchRow[], keys: Set<string>, types: FixtureType[], u: number, a: number): PatchRow[] {
  let uu = Math.max(1, u);
  let aa = Math.min(512, Math.max(1, a));
  return rows.map((r) => {
    if (!keys.has(r.key)) return r;
    const foot = Math.max(1, footOf(r, types));
    if (aa + foot - 1 > 512) {
      uu += 1;
      aa = 1;
    }
    const next = { ...r, u: String(uu), a: String(aa) };
    aa += foot;
    if (aa > 512) {
      uu += 1;
      aa = 1;
    }
    return next;
  });
}

/** Fixture IDs in plot order: 101, 102 … 110, then text IDs. */
export const byId = (x: PatchRow, y: PatchRow) => x.fid.localeCompare(y.fid, undefined, { numeric: true });
export const byPatch = (x: PatchRow, y: PatchRow) => (Number(x.u) || 1e9) - (Number(y.u) || 1e9) || (Number(x.a) || 1e9) - (Number(y.a) || 1e9);

// ---------- colors ----------

const CHIP: Record<string, string> = {
  red: "#D50000",
  green: "#0AAA14",
  violet: "#6A00B0",
  purple: "#6A00B0",
  grey: "#808080",
  gray: "#808080",
  brown: "#6F4234",
  orange: "#FF9800",
  yellow: "#FFD83D",
  blue: "#0038A8",
  white: "#FFFFFF",
  black: "#000000",
  pink: "#FF7AB6",
  cyan: "#00B7D4",
  magenta: "#D4008F",
};
const ES: Record<string, string> = {
  rojo: "red",
  verde: "green",
  violeta: "violet",
  morado: "violet",
  gris: "grey",
  marron: "brown",
  marrón: "brown",
  cafe: "brown",
  café: "brown",
  naranja: "orange",
  amarillo: "yellow",
  azul: "blue",
  blanco: "white",
  negro: "black",
  rosa: "pink",
};
export const COLOR_NAMES = ["green", "violet", "red", "blue", "yellow", "orange", "brown", "grey", "white", "pink", "cyan"];

/** A position color as #hex, or null when there's none. */
export function colorHex(c: string): string | null {
  const s = c.trim().toLowerCase();
  if (!s) return null;
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  return CHIP[ES[s] ?? s] ?? null;
}

/** The colors each position has, from its rows: for the report's chips and the sticker groups. */
export function positionColor(rows: PatchRow[], pos: string) {
  return rows.find((r) => r.pos === pos && r.color)?.color ?? "";
}

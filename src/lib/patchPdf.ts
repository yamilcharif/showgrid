/**
 * The patch on paper: the "Address Patch By Fixture" report (a page per fixture type, a block per position)
 * and one sticker per fixture, grouped by position color so each group prints on its own colored label paper.
 * Everything is drawn in points from the top left (jsPDF).
 */

import { PAPER, SHEETS, type Sheet } from "./labels";
import { colorHex, footOf, positionColor, type PatchRow, type PatchSettings } from "./patch";

const NAVY = "#0B3A6B";
const BLUE = "#1F4E79";
const GREY = "#555555";
const LGREY = "#F2F2F2";
const BANNER = "#EEEEEE";
const LINE = "#C8C8C8";

interface Logo {
  data: string;
  ratio: number;
}

/** The logo with its white margins cut off; with black=true, every visible pixel black (for colored paper). */
async function loadLogo(src: string | null, black = false): Promise<Logo | null> {
  if (!src) return null;
  const img = await new Promise<HTMLImageElement | null>((done) => {
    const i = new Image();
    i.onload = () => done(i);
    i.onerror = () => done(null);
    i.src = src;
  });
  if (!img) return null;
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, c.width, c.height);
  const d = px.data;
  let x0 = c.width,
    y0 = c.height,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      // how much ink a pixel has: dark and opaque
      const ink = (d[i + 3] / 255) * (1 - (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255);
      const seen = d[i + 3] > 40 && (ink > 0.15 || d[i + 3] < 250 || Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 40);
      if (seen) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      if (black) {
        // keep the shape: dark or colored = black, white or clear = see-through
        const sat = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
        const a = Math.min(255, Math.round(Math.max(ink * 255, sat > 40 ? d[i + 3] : 0)));
        d[i] = d[i + 1] = d[i + 2] = 0;
        d[i + 3] = a;
      }
    }
  if (x1 < x0) return null;
  if (black) g.putImageData(px, 0, 0);
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext("2d")!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return { data: out.toDataURL("image/png"), ratio: out.width / out.height };
}

const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Fits text in a width by cutting it with an ellipsis. */
function fit(doc: import("jspdf").jsPDF, s: string, w: number) {
  if (doc.getTextWidth(s) <= w) return s;
  let t = s;
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > w) t = t.slice(0, -1);
  return `${t}…`;
}

/** Fixture types in the order they first appear, each with its positions in order. */
function grouped(rows: PatchRow[]) {
  const out = new Map<string, Map<string, PatchRow[]>>();
  for (const r of rows) {
    const t = r.type || "—";
    if (!out.has(t)) out.set(t, new Map());
    const byPos = out.get(t)!;
    const p = r.pos || "No Position";
    byPos.set(p, [...(byPos.get(p) ?? []), r]);
  }
  return out;
}

export async function patchReportPdf(s: PatchSettings, rows = s.rows): Promise<ArrayBuffer> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: s.page });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const logo = await loadLogo(s.logo);
  const when = stamp();
  const R = W - 18;
  const COLS = [85, 209, 338, 390, 437, 483, 531, R];
  const HEADS = ["Fixture Type", "Mode", "Fixture ID", "Universe", "Address", "Footprint", "Notes"];
  const ROW_H = 18,
    TH_H = 18,
    BH_H = 19,
    GAP = 8;
  const BOTTOM = H - 62;
  const mid = (i: number) => (COLS[i] + COLS[i + 1]) / 2;

  const header = () => {
    if (logo) {
      const lh = 24;
      doc.addImage(logo.data, "PNG", 20, 36 - lh / 2, lh * logo.ratio, lh);
    }
    if (s.show) doc.setTextColor("#000000").setFont("helvetica", "bold").setFontSize(24).text(fit(doc, s.show, W - 330), logo ? 20 + 24 * logo.ratio + 16 : 20, 49);
    doc.setTextColor(BLUE).setFont("helvetica", "normal").setFontSize(9.5);
    if (s.job) doc.text(s.job, R, 31, { align: "right" });
    doc.setFontSize(11.5).text("Address Patch By Fixture", R, 46, { align: "right" });
  };
  const footer = (pg: number, total: number) => {
    doc.setFillColor(NAVY).rect(22, H - 50, 28, 28, "F");
    doc.setTextColor("#ffffff").setFont("helvetica", "bold").setFontSize(15).text("LX", 36, H - 29, { align: "center" });
    doc.setTextColor(BLUE).setFont("helvetica", "normal").setFontSize(7);
    doc.text(`Exported By: ${s.by}`, 57, H - 41).text(when, 57, H - 32);
    if (logo) {
      const lh = 17;
      doc.addImage(logo.data, "PNG", W / 2 - (lh * logo.ratio) / 2, H - 28 - lh, lh * logo.ratio, lh);
    }
    doc.setTextColor(GREY).setFontSize(6.5).text(`Page ${pg} of ${total}`, W / 2, H - 14, { align: "center" });
    doc.setTextColor(BLUE).setFontSize(8.5).text(`Last Sync with VWX Revision: ${s.rev || "—"}`, R, H - 36, { align: "right" });
  };
  const banner = (type: string, mode: string, y: number) => {
    doc.setFillColor(BANNER).roundedRect(20, y, W - 36, 26, 4, 4, "F");
    doc.setDrawColor(NAVY).setLineWidth(1.6).line(20, y + 26, W, y + 26);
    doc.setTextColor("#000000").setFont("helvetica", "bold").setFontSize(13.5).text(fit(doc, type, W - 200), 27, y + 18);
    doc.setTextColor(GREY).setFont("helvetica", "normal").setFontSize(15).text(mode, R - 6, y + 19, { align: "right" });
    return y + 36;
  };
  const block = (pos: string, color: string, y: number) => {
    doc.setFillColor(LGREY).rect(85, y, R - 85, BH_H, "F");
    doc.setDrawColor(GREY).setLineWidth(0.8).line(85, y, R, y).line(85, y + BH_H, R, y + BH_H);
    doc.setTextColor(BLUE).setFont("helvetica", "normal").setFontSize(11).text(fit(doc, pos, 240), 92, y + 14);
    let x = 335;
    for (const c of color.split(",").map((v) => v.trim()).filter(Boolean).slice(0, 3)) {
      const hex = colorHex(c) ?? "#999999";
      doc.setFillColor(hex);
      doc.setDrawColor(LINE);
      doc.rect(x, y + 2, 80, BH_H - 3, hex.toLowerCase() === "#ffffff" ? "FD" : "F");
      const light = ["#ffffff", "#ffd83d"].includes(hex.toLowerCase());
      doc.setTextColor(light ? "#000000" : "#ffffff").setFontSize(6.5).text(c.charAt(0).toUpperCase() + c.slice(1), x + 40, y + BH_H - 6, { align: "center" });
      x += 80;
    }
    return y + BH_H + 6;
  };
  const tableHead = (y: number) => {
    doc.setTextColor(GREY).setFont("helvetica", "normal").setFontSize(7.5);
    HEADS.forEach((h, i) => (i ? doc.text(h, mid(i), y + 12, { align: "center" }) : doc.text(h, COLS[0] + 6, y + 12)));
    return y + TH_H;
  };

  const render = (total: number) => {
    let pg = 0;
    let y = 0;
    const newPage = () => {
      if (pg) {
        footer(pg, total);
        doc.addPage(s.page);
      }
      pg += 1;
      header();
    };
    for (const [type, positions] of grouped(rows)) {
      newPage();
      const first = [...positions.values()][0][0];
      y = banner(type, first.mode, 62);
      for (const [pos, recs] of positions) {
        const color = recs.find((r) => r.color)?.color ?? positionColor(rows, pos);
        let i = 0;
        while (i < recs.length) {
          const need = BH_H + 6 + TH_H + ROW_H * Math.min(3, recs.length - i);
          if (y + need > BOTTOM) {
            newPage();
            y = 56;
          }
          y = block(pos, color, y);
          y = tableHead(y);
          const top = y;
          let n = 0;
          while (i < recs.length && y + ROW_H <= BOTTOM) {
            const r = recs[i];
            if (n % 2) doc.setFillColor(LGREY).rect(85, y, R - 85, ROW_H, "F");
            doc.setTextColor("#000000").setFont("helvetica", "normal").setFontSize(7.5).text(fit(doc, r.type, COLS[1] - COLS[0] - 10), COLS[0] + 6, y + 12);
            doc.setFontSize(9).text(fit(doc, r.mode, COLS[2] - COLS[1] - 6), mid(1), y + 12.5, { align: "center" });
            doc.setFont("helvetica", "bold").text(fit(doc, r.fid, COLS[3] - COLS[2] - 4), mid(2), y + 12.5, { align: "center" });
            doc.setFont("helvetica", "normal");
            const foot = footOf(r, s.types);
            doc.text(r.u, mid(3), y + 12.5, { align: "center" }).text(r.a, mid(4), y + 12.5, { align: "center" }).text(foot ? String(foot) : "", mid(5), y + 12.5, { align: "center" });
            if (r.notes) doc.setFontSize(6).text(fit(doc, r.notes, COLS[7] - COLS[6] - 4), mid(6), y + 12, { align: "center" });
            y += ROW_H;
            i += 1;
            n += 1;
          }
          doc.setDrawColor(LINE).setLineWidth(0.6).roundedRect(85, top, R - 85, y - top, 3, 3, "S");
          y += GAP + 4;
        }
      }
    }
    if (pg) footer(pg, total);
    return pg;
  };
  // "Page n of N": the page count comes from the same layout walk, without drawing
  render(countPages(rows, H));
  doc.setProperties({ title: `Address Patch By Fixture ${s.job}`.trim() });
  return doc.output("arraybuffer");
}

/** How many pages the report takes: the same layout walk as the drawing, without drawing. */
function countPages(rows: PatchRow[], H: number) {
  const ROW_H = 18,
    TH_H = 18,
    BH_H = 19,
    GAP = 8;
  const BOTTOM = H - 62;
  let pg = 0;
  for (const [, positions] of grouped(rows)) {
    pg += 1;
    let y = 98;
    for (const [, recs] of positions) {
      let i = 0;
      while (i < recs.length) {
        const need = BH_H + 6 + TH_H + ROW_H * Math.min(3, recs.length - i);
        if (y + need > BOTTOM) {
          pg += 1;
          y = 56;
        }
        y += BH_H + 6 + TH_H;
        while (i < recs.length && y + ROW_H <= BOTTOM) {
          y += ROW_H;
          i += 1;
        }
        y += GAP + 4;
      }
    }
  }
  return Math.max(1, pg);
}

// ---------- stickers ----------

/** Avery 22822: 3 × 2 in, 8 per US Letter. Margins centred: confirm with the alignment test. */
export const STICKER_SHEETS: Sheet[] = [
  { id: "22822", name: "Avery 22822 · 3 × 2 in · 8", paper: "letter", w: 3, h: 2, top: 1.125, left: 1.125, gapX: 0.25, gapY: 0.25, cols: 2, rows: 4 },
  ...SHEETS.filter((x) => x.w >= 2.5 && x.h >= 1.3 && x.cols * x.rows > 1),
];
export const stickerSheet = (id: string) => STICKER_SHEETS.find((x) => x.id === id) ?? STICKER_SHEETS[0];

const ES_COLOR: Record<string, string> = { red: "Rojo", green: "Verde", violet: "Violeta", purple: "Violeta", grey: "Gris", gray: "Gris", brown: "Marrón", orange: "Naranja", yellow: "Amarillo", blue: "Azul", white: "Blanco", pink: "Rosa", cyan: "Cian" };

/** Rows grouped by their position color (first color), in order of appearance. */
function byColor(rows: PatchRow[]) {
  const out = new Map<string, PatchRow[]>();
  for (const r of rows) {
    const c = (r.color || positionColor(rows, r.pos)).split(",")[0].trim().toLowerCase();
    out.set(c, [...(out.get(c) ?? []), r]);
  }
  return out;
}

/** The label sheet's cell i, top left, in points (with the printer nudge). */
function cell(sheet: Sheet, i: number, s: PatchSettings) {
  const c = i % sheet.cols;
  const r = Math.floor(i / sheet.cols);
  return { x: (sheet.left + c * (sheet.w + sheet.gapX)) * 72 + s.offX, y: (sheet.top + r * (sheet.h + sheet.gapY)) * 72 + s.offY, w: sheet.w * 72, h: sheet.h * 72 };
}

export async function stickersPdf(s: PatchSettings, rows = s.rows, footerText: (color: string) => string): Promise<ArrayBuffer> {
  const { jsPDF } = await import("jspdf");
  const sheet = stickerSheet(s.sheetId);
  const paper = PAPER[sheet.paper];
  const size: [number, number] = [paper.w * 72, paper.h * 72];
  const doc = new jsPDF({ unit: "pt", format: size });
  const logoBlack = await loadLogo(s.logo, !s.fill);
  const per = sheet.cols * sheet.rows;
  const p3 = (v: string) => (s.pad && /^\d+$/.test(v) ? v.padStart(3, "0") : v);
  let first = true;
  for (const [color, list] of byColor(rows)) {
    for (let p = 0; p < list.length; p += per) {
      if (!first) doc.addPage(size);
      first = false;
      list.slice(p, p + per).forEach((f, i) => {
        const { x, y, w, h } = cell(sheet, i, s);
        const k = Math.min(w / 216, h / 144);
        const hex = colorHex(color);
        let ink = "#000000";
        if (s.fill && hex) {
          doc.setFillColor(hex).roundedRect(x, y, w, h, 7, 7, "F");
          const n = parseInt(hex.slice(1), 16);
          const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
          ink = lum > 0.55 ? "#000000" : "#ffffff";
        }
        const pad = 14 * k;
        doc.setTextColor(ink).setFont("helvetica", "bold").setFontSize(46 * k);
        const id = fit(doc, f.fid, w * 0.62);
        doc.text(id, x + pad, y + pad + 33 * k);
        const room = w - 2 * pad - doc.getTextWidth(id) - 10 * k;
        let fs = 26 * k;
        doc.setFont("helvetica", "normal");
        while (fs > 9 * k && doc.setFontSize(fs).getTextWidth(f.pos) > room) fs -= 1;
        if (f.pos) doc.setFontSize(fs).text(fit(doc, f.pos, room), x + w - pad, y + pad + 0.72 * fs, { align: "right" });
        doc.setFontSize(9.5 * k);
        doc.text(fit(doc, f.type, w - 2 * pad), x + pad, y + pad + 51 * k);
        doc.text(fit(doc, f.mode, w - 2 * pad), x + pad, y + pad + 63 * k);
        doc.setFontSize(10.5 * k);
        if (f.u) doc.text(`U: ${p3(f.u)}`, x + pad, y + h - 16 * k);
        if (f.a) doc.text(`A: ${p3(f.a)}`, x + pad + 66 * k, y + h - 16 * k);
        if (logoBlack) {
          const lh = 18 * k;
          const lw = Math.min(lh * logoBlack.ratio, w * 0.4);
          doc.addImage(logoBlack.data, "PNG", x + w - pad - lw, y + h - 12 * k - lw / logoBlack.ratio, lw, lw / logoBlack.ratio);
        }
      });
      doc.setTextColor("#888888").setFont("helvetica", "normal").setFontSize(8).text(footerText(ES_COLOR[color] ?? color), 36, size[1] - 20);
    }
  }
  doc.setProperties({ title: "Fixture stickers" });
  return doc.output("arraybuffer");
}

/** Outlines only, on plain paper, to hold over the label sheet before printing on it. */
export async function alignmentPdf(s: PatchSettings, note: string): Promise<ArrayBuffer> {
  const { jsPDF } = await import("jspdf");
  const sheet = stickerSheet(s.sheetId);
  const paper = PAPER[sheet.paper];
  const doc = new jsPDF({ unit: "pt", format: [paper.w * 72, paper.h * 72] });
  doc.setDrawColor("#000000").setLineWidth(0.5).setFont("helvetica", "normal").setFontSize(8);
  for (let i = 0; i < sheet.cols * sheet.rows; i++) {
    const { x, y, w, h } = cell(sheet, i, s);
    doc.roundedRect(x, y, w, h, 7, 7, "S");
    doc.text(`${i + 1}`, x + 6, y + 12);
  }
  doc.text(note, 36, paper.h * 72 - 24);
  return doc.output("arraybuffer");
}

/**
 * "Download all" for a project: every tool's work as files in one folder named after the project, zipped.
 * Runs in the browser: PDFs with jsPDF, the test pattern drawn on a canvas, the rider as CSV.
 */
import type { jsPDF as JsPDF } from "jspdf";
import type { Dict } from "./i18n/en";
import { fmt } from "./i18n/config";
import { PAPER, buildLabels, inkFor, sheetOf, type LabelSettings } from "./labels";
import { patternPng, type PatternSettings } from "./pattern";
import type { EstimateRow, RiderLine } from "./rider";
import { caseNumbers, fmtLen, fmtWeight, footprint, groupSummary, position, stats, type TruckPlan } from "./truck";

export interface ProjectData {
  rider?: { lines: RiderLine[]; source: string; mode: string };
  truck?: TruckPlan;
  pattern?: PatternSettings;
  labels?: LabelSettings;
}

/** A name that works as a file or folder name on any computer. */
export const safeName = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "ShowGrid";

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The rider list, with the estimate for each line when one could be worked out. */
export function riderCsv(lines: RiderLine[], rows: EstimateRow[] | null, cur: string) {
  const byKey = new Map((rows ?? []).map((r) => [r.line.key, r]));
  const out = [["Qty", "Item", "Day rate", "Days charged", "Subtotal", "Price from", "Currency"]];
  for (const l of lines.filter((x) => x.on)) {
    const r = byKey.get(l.key);
    out.push([
      String(l.qty),
      l.name,
      r && r.rate ? String(r.rate) : "",
      r ? String(+r.factor.toFixed(2)) : "",
      r && r.subtotal ? String(Math.round(r.subtotal)) : "",
      r ? (r.source === "published" ? `published (${r.co})` : r.source === "estimated" ? `4% of ~${r.value} purchase` : "no price") : "",
      cur,
    ]);
  }
  // a BOM so Excel opens accents correctly
  return "﻿" + out.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

// ---------- truck pack ----------

/** Draws a logo inside a box, keeping its shape, aligned right. */
async function putLogo(doc: JsPDF, src: string | null | undefined, x: number, y: number, maxW: number, maxH: number) {
  if (!src) return;
  const img = await new Promise<HTMLImageElement | null>((done) => {
    const i = new Image();
    i.onload = () => done(i);
    i.onerror = () => done(null);
    i.src = src;
  });
  if (!img) return;
  const k = Math.min(maxW / img.width, maxH / img.height);
  doc.addImage(src, "PNG", x + maxW - img.width * k, y + (maxH - img.height * k) / 2, img.width * k, img.height * k);
}

/** Where a case goes, in the words printed on its label. */
function whereWords(t: Dict["truck"], pos: ReturnType<typeof position>) {
  const words = [t.words[pos.zone], t.words[pos.side], pos.level > 1 ? fmt(t.words.stack, { n: pos.level }) : t.words.floor];
  if (pos.tilt === 90) words.push(t.words.tilt90);
  if (pos.tilt === 180) words.push(t.words.tilt180);
  return words;
}

/** The plan on a landscape page: views from above, the side and the doors, then the load list. */
export async function truckPlanPdf(plan: TruckPlan, t: Dict["truck"], date: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "in", format: "letter", orientation: "landscape" });
  const types = new Map(plan.types.map((x) => [x.id, x]));
  const placed = plan.placed.filter((p) => types.has(p.type));
  const truck = plan.truck;
  const metric = plan.metric;
  const num = caseNumbers(placed, types, plan.fromDoors ?? true);
  const st = stats(truck, placed, types);
  const len = (n: number) => fmtLen(n, metric);
  const feet = truck.key === "custom" ? Math.round(truck.l / 12) : truck.key;

  await putLogo(doc, plan.logo, 8.2, 0.3, 2.3, 0.7);
  doc.setFont("helvetica", "bold").setFontSize(18).text(`${t.planTitle} · ${fmt(t.feet, { n: feet })}`, 0.5, 0.65);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor("#555555");
  doc.text(
    `${t.inside}: ${len(truck.l)} × ${len(truck.w)} × ${len(truck.h)} · ${t.totalWeight}: ${fmtWeight(st.weight, metric)}${truck.payload ? ` / ${fmtWeight(truck.payload, metric)}` : ""} · ${t.floorUsed} ${Math.round(st.floor * 100)}% · ${t.volUsed} ${Math.round(st.volume * 100)}% · ${fmt(t.printed, { date })}`,
    0.5,
    0.9,
  );

  // a rectangle view: (a, b) in truck inches mapped onto the page from (x0, y0) at scale k
  const view = (
    title: string,
    x0: number,
    y0: number,
    k: number,
    W: number,
    H: number,
    boxes: { a: number; b: number; w: number; h: number; uid: string; color: string }[],
  ) => {
    doc.setFont("helvetica", "bold").setFontSize(8).setTextColor("#000000").text(title.toUpperCase(), x0, y0 - 0.08);
    doc.setDrawColor("#000000").setLineWidth(0.012).rect(x0, y0, W * k, H * k);
    for (const b of boxes) {
      doc.setFillColor(b.color).setLineWidth(0.006).rect(x0 + b.a * k, y0 + b.b * k, b.w * k, b.h * k, "FD");
      const size = Math.min(10, b.w * k * 30, b.h * k * 40);
      if (size >= 4) doc.setFont("helvetica", "bold").setFontSize(size).text(String(num.get(b.uid) ?? ""), x0 + (b.a + b.w / 2) * k, y0 + (b.b + b.h / 2) * k, { align: "center", baseline: "middle" });
    }
  };

  const byZ = [...placed].sort((a, b) => a.z - b.z);
  const kTop = Math.min(10 / truck.l, 2.7 / truck.w);
  view(
    t.topView,
    0.5,
    1.3,
    kTop,
    truck.l,
    truck.w,
    byZ.map((p) => {
      const f = footprint(p, types.get(p.type)!);
      return { a: f.x, b: f.y, w: f.l, h: f.w, uid: p.uid, color: types.get(p.type)!.color };
    }),
  );
  const kSide = Math.min(6.6 / truck.l, 2.6 / truck.h);
  const y2 = 1.3 + truck.w * kTop + 0.55;
  view(
    t.sideView,
    0.5,
    y2,
    kSide,
    truck.l,
    truck.h,
    [...placed].sort((a, b) => a.y - b.y || a.z - b.z).map((p) => {
      const f = footprint(p, types.get(p.type)!);
      return { a: f.x, b: truck.h - p.z - f.h, w: f.l, h: f.h, uid: p.uid, color: types.get(p.type)!.color };
    }),
  );
  if (truck.bar && truck.bar.clear < truck.h) {
    doc.setFillColor("#ffb3b3").setDrawColor("#ff3b3b").setLineWidth(0.01);
    doc.rect(0.5 + (truck.l - truck.bar.from - truck.bar.depth) * kSide, y2, Math.max(0.02, truck.bar.depth * kSide), (truck.h - truck.bar.clear) * kSide, "FD");
    doc.setDrawColor("#000000");
  }
  const kBack = Math.min(2.8 / truck.w, 2.6 / truck.h);
  view(
    t.backView,
    0.5 + truck.l * kSide + 0.5,
    y2,
    kBack,
    truck.w,
    truck.h,
    [...placed].sort((a, b) => a.x - b.x || a.z - b.z).map((p) => {
      const f = footprint(p, types.get(p.type)!);
      return { a: truck.w - f.y - f.w, b: truck.h - p.z - f.h, w: f.w, h: f.h, uid: p.uid, color: types.get(p.type)!.color };
    }),
  );

  // load list
  doc.addPage("letter", "landscape");
  doc.setFont("helvetica", "bold").setFontSize(14).text(t.loadList, 0.5, 0.65);
  doc.setFont("helvetica", "normal").setFontSize(9).text(plan.fromDoors ?? true ? t.loadListNote : t.loadListNoteFront, 0.5, 0.88);
  const cols = [0.5, 1.0, 4.2, 6.2, 7.2];
  let y = 1.2;
  // the summary by department first
  if (plan.groups?.length) {
    const rows = groupSummary(plan);
    const total = rows.reduce((a, r) => a + r.weight, 0);
    doc.setFont("helvetica", "bold").setFontSize(8);
    [t.groupCol, t.cases, t.weight, t.volUsed, t.colShare].forEach((h, i) => doc.text(h.toUpperCase(), [0.5, 3, 4.2, 5.6, 7][i], y));
    y += 0.22;
    doc.setFont("helvetica", "normal").setFontSize(9);
    for (const r of rows) {
      doc.setFillColor(r.color).rect(0.5, y - 0.11, 0.12, 0.12, "F");
      doc.text(r.name || t.groupNone, 0.7, y);
      doc.text(`${r.loaded}${r.listed > r.loaded ? ` / ${r.listed}` : ""}`, 3, y);
      doc.text(fmtWeight(r.weight, plan.metric), 4.2, y);
      doc.text(plan.metric ? `${(r.volume * 1.6387e-5).toFixed(1)} m³` : `${Math.round(r.volume / 1728)} ft³`, 5.6, y);
      doc.text(`${total ? Math.round((r.weight / total) * 100) : 0}%`, 7, y);
      y += 0.24;
    }
    y += 0.3;
  }
  const headRow = () => {
    doc.setFont("helvetica", "bold").setFontSize(8);
    ["#", t.caseName, `${t.length} × ${t.width} × ${t.height}`, t.weight, t.colWhere].forEach((h, i) => doc.text(h.toUpperCase(), cols[i], y));
    y += 0.22;
  };
  headRow();
  doc.setFont("helvetica", "normal").setFontSize(9);
  for (const p of [...placed].sort((a, b) => (num.get(a.uid) ?? 0) - (num.get(b.uid) ?? 0))) {
    if (y > 8) {
      doc.addPage("letter", "landscape");
      y = 0.7;
      headRow();
      doc.setFont("helvetica", "normal").setFontSize(9);
    }
    const ty = types.get(p.type)!;
    const pos = position(p, ty, truck, placed, types);
    const where = whereWords(t, pos).join(" · ") + (pos.on ? ` (${fmt(t.onCase, { n: num.get(pos.on) ?? "?" })})` : "");
    doc.setFillColor(ty.color).rect(cols[0], y - 0.11, 0.12, 0.12, "F");
    doc.setFont("helvetica", "bold").text(String(num.get(p.uid)), cols[0] + 0.18, y);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(ty.name, 3)[0] ?? "", cols[1], y);
    doc.text(`${len(ty.l)} × ${len(ty.w)} × ${len(ty.h)}`, cols[2], y);
    doc.text(ty.wt ? fmtWeight(ty.wt, metric) : "–", cols[3], y);
    doc.text(where, cols[4], y);
    doc.setDrawColor("#cccccc").setLineWidth(0.005).line(0.5, y + 0.08, 10.5, y + 0.08);
    y += 0.27;
  }
  return doc.output("arraybuffer");
}

/** One label per case, six to a letter page: number, color, name, size, weight and where it goes. */
export async function truckLabelsPdf(plan: TruckPlan, t: Dict["truck"]) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "in", format: "letter" });
  const types = new Map(plan.types.map((x) => [x.id, x]));
  const placed = plan.placed.filter((p) => types.has(p.type));
  const num = caseNumbers(placed, types, plan.fromDoors ?? true);
  const feet = plan.truck.key === "custom" ? Math.round(plan.truck.l / 12) : plan.truck.key;
  const rows = [...placed].sort((a, b) => (num.get(a.uid) ?? 0) - (num.get(b.uid) ?? 0));
  const W = 3.85;
  const H = 3.3;
  const logo = plan.logo
    ? await new Promise<{ src: string; ratio: number } | null>((done) => {
        const i = new Image();
        i.onload = () => done({ src: plan.logo!, ratio: i.width / i.height });
        i.onerror = () => done(null);
        i.src = plan.logo!;
      })
    : null;
  rows.forEach((p, i) => {
    if (i && i % 6 === 0) doc.addPage();
    const x = 0.3 + (i % 2) * (W + 0.2);
    const y = 0.3 + Math.floor((i % 6) / 2) * (H + 0.2);
    const ty = types.get(p.type)!;
    const pos = position(p, ty, plan.truck, placed, types);
    doc.setDrawColor("#000000").setLineWidth(0.02).roundedRect(x, y, W, H, 0.1, 0.1);
    doc.setFillColor(ty.color).rect(x + 0.01, y + 0.01, 0.5, H - 0.02, "F");
    const tx = x + 0.68;
    doc.setTextColor("#000000").setFont("helvetica", "bold").setFontSize(44).text(`#${num.get(p.uid)}`, tx, y + 0.75);
    doc.setFontSize(8).setTextColor("#555555").text(fmt(t.feet, { n: feet }).toUpperCase(), x + W - 0.15, y + 0.4, { align: "right" });
    const group = plan.groups?.find((g) => g.id === ty.group);
    if (group) doc.setTextColor("#333333").setFontSize(9).text(group.name.toUpperCase(), tx, y + 0.95);
    doc.setTextColor("#000000").setFont("helvetica", "bold").setFontSize(16).text(doc.splitTextToSize(ty.name, W - 0.85).slice(0, 2), tx, y + 1.2);
    doc.setFont("helvetica", "normal").setFontSize(10).text(`${fmtLen(ty.l, plan.metric)} × ${fmtLen(ty.w, plan.metric)} × ${fmtLen(ty.h, plan.metric)}${ty.wt ? ` · ${fmtWeight(ty.wt, plan.metric)}` : ""}`, tx, y + 1.75);
    const words = whereWords(t, pos);
    let wy = y + 2.15;
    let wx = tx;
    doc.setFont("helvetica", "bold").setFontSize(12);
    words.forEach((w, k) => {
      const bw = doc.getTextWidth(w) + 0.16;
      if (wx + bw > x + W - 0.1) {
        wx = tx;
        wy += 0.34;
      }
      const stack = (k === 2 && pos.level > 1) || k > 2;
      doc.setFillColor(stack ? "#000000" : "#ffffff").setLineWidth(0.015).roundedRect(wx, wy - 0.2, bw, 0.27, 0.04, 0.04, stack ? "FD" : "S");
      doc.setTextColor(stack ? "#ffffff" : "#000000").text(w, wx + 0.08, wy);
      wx += bw + 0.08;
    });
    if (pos.on) doc.setTextColor("#000000").setFontSize(10).text(fmt(t.onCase, { n: num.get(pos.on) ?? "?" }), tx, wy + 0.38);
    if (logo) {
      const lh = 0.45;
      const lw = Math.min(lh * logo.ratio, 1.3);
      doc.addImage(logo.src, "PNG", x + W - 0.15 - lw, y + H - 0.15 - lw / logo.ratio, lw, lw / logo.ratio);
    }
  });
  return doc.output("arraybuffer");
}

// ---------- label maker ----------

/** Fits text on one line at the largest size up to max points, cutting it with … when it can't fit. */
function fitText(doc: JsPDF, text: string, maxW: number, maxPt: number, minPt = 5) {
  let pt = maxPt;
  doc.setFontSize(pt);
  while (doc.getTextWidth(text) > maxW && pt > minPt) doc.setFontSize((pt -= 0.5));
  let s = text;
  while (doc.getTextWidth(s) > maxW && s.length > 1) s = s.slice(0, -2) + "…";
  return s;
}

/** The label maker's sheet, at the real sticker positions, ready to print on the chosen sheet. */
export async function labelsPdf(s: LabelSettings) {
  const { jsPDF } = await import("jspdf");
  const sheet = sheetOf(s);
  const paper = PAPER[sheet.paper];
  const doc = new jsPDF({ unit: "in", format: [paper.w, paper.h] });
  const per = sheet.cols * sheet.rows;
  const skip = Math.max(0, Math.min(per - 1, s.startAt - 1));
  const labels = buildLabels(s);
  let logo: { data: string; ratio: number } | null = null;
  if (s.logo) {
    const img = await new Promise<HTMLImageElement | null>((done) => {
      const i = new Image();
      i.onload = () => done(i);
      i.onerror = () => done(null);
      i.src = s.logo!;
    });
    if (img) logo = { data: s.logo, ratio: img.width / img.height };
  }
  labels.forEach((l, n) => {
    const slot = n + skip;
    if (slot && slot % per === 0) doc.addPage([paper.w, paper.h]);
    const i = slot % per;
    const x = sheet.left + (i % sheet.cols) * (sheet.w + sheet.gapX);
    const y = sheet.top + Math.floor(i / sheet.cols) * (sheet.h + sheet.gapY);
    const w = sheet.w;
    const h = sheet.h;
    if (l.fx) {
      // fixture sticker: big ID, position, type and mode, U: and A:, logo
      const fill = s.fxFill !== false;
      const ink = fill ? inkFor(l.band) : s.ink;
      doc.setFillColor(fill ? l.band : s.bg).roundedRect(x, y, w, h, 0.06, 0.06, "F");
      if (!fill) doc.setFillColor(l.band).rect(x, y, 0.12, h, "F");
      const px = x + w * 0.06 + (fill ? 0 : 0.12);
      const pw = w - w * 0.12 - (fill ? 0 : 0.12);
      const pt = (inches: number) => inches * 72;
      doc.setTextColor(ink).setFont("helvetica", "bold");
      const ts = s.textScale ?? 1;
      const idPt = pt(Math.min(h * 0.44, w * 0.26) * ts);
      doc.setFontSize(idPt).text(fitText(doc, l.fx.id, pw * 0.6, idPt), px, y + h * 0.06 + (idPt / 72) * 0.8);
      if (l.fx.pos) {
        const posPt = pt(Math.min(h * 0.2, w * 0.12) * ts);
        const posText = fitText(doc, l.fx.pos, pw * 0.42, posPt);
        doc.text(posText, px + pw, y + h * 0.06 + (posPt / 72) * 0.85, { align: "right" });
      }
      doc.setFont("helvetica", "normal");
      let ty = y + h * 0.56;
      for (const line of [l.fx.type, l.fx.mode].filter(Boolean)) {
        doc.text(fitText(doc, line, pw, pt(Math.min(h * 0.105, w * 0.065) * ts)), px, ty);
        ty += h * 0.13;
      }
      doc.setFont("helvetica", "bold").setFontSize(pt(Math.min(h * 0.11, w * 0.06) * ts));
      const by2 = y + h * 0.9;
      if (l.fx.u) doc.text(`U: ${l.fx.u}`, px, by2);
      if (l.fx.a) doc.text(`A: ${l.fx.a}`, px + pw * 0.35, by2);
      if (logo) {
        const lh = h * (s.logoSize ?? 0.22);
        const lw = Math.min(lh * logo.ratio, w * 0.7);
        const lhh = lw / logo.ratio;
        if (s.logoPos) doc.addImage(logo.data, "PNG", x + s.logoPos.x * w - lw / 2, y + s.logoPos.y * h - lhh / 2, lw, lhh);
        else doc.addImage(logo.data, "PNG", px + pw - lw, y + h * 0.94 - lhh, lw, lhh);
      } else if (s.extra.trim()) doc.text(fitText(doc, s.extra, pw * 0.4, pt(h * 0.13)), px + pw, by2, { align: "right" });
      if (s.outline) doc.setDrawColor("#888888").setLineWidth(0.005).rect(x, y, w, h);
      return;
    }
    doc.setFillColor(s.bg).rect(x, y, w, h, "F");
    let bx = x + w * 0.06;
    let by = y + h * 0.05;
    let bw = w * 0.88;
    let bh = h * 0.9;
    if (s.band === "left") {
      doc.setFillColor(l.band).rect(x, y, w * 0.07, h, "F");
      bx += w * 0.07;
      bw -= w * 0.07;
    } else if (s.band === "top") {
      doc.setFillColor(l.band).rect(x, y, w, h * 0.14, "F");
      by += h * 0.14;
      bh -= h * 0.14;
    }
    if (logo && s.logoPos) {
      // dragged: on top of the label, not taking room from the text
      const lh = h * (s.logoSize ?? 0.5);
      const lw = Math.min(lh * logo.ratio, w * 0.7);
      const lhh = lw / logo.ratio;
      doc.addImage(logo.data, "PNG", x + s.logoPos.x * w - lw / 2, y + s.logoPos.y * h - lhh / 2, lw, lhh);
    } else if (logo) {
      const lh = s.logoSide === "top" ? bh * 0.34 : (s.logoSize ? h * s.logoSize : bh * 0.7);
      const lw = Math.min(lh * logo.ratio, s.logoSide === "top" ? bw * 0.7 : bw * 0.32);
      const lhh = lw / logo.ratio;
      const lx = s.logoSide === "left" ? bx : s.logoSide === "right" ? bx + bw - lw : bx + (bw - lw) / 2;
      const ly = s.logoSide === "top" ? by : by + (bh - lhh) / 2;
      doc.addImage(logo.data, "PNG", lx, ly, lw, lhh);
      if (s.logoSide === "left") {
        bx += lw + w * 0.04;
        bw -= lw + w * 0.04;
      } else if (s.logoSide === "right") bw -= lw + w * 0.04;
      else {
        by += lhh + h * 0.03;
        bh -= lhh + h * 0.03;
      }
    }
    // text block, vertically centred: big first line, smaller details, then the extra text
    const pt = (inches: number) => inches * 72;
    const ts = s.textScale ?? 1;
    const sizes = l.lines.map((_, k) => (k === 0 ? Math.min(pt(h * 0.26), pt(w * 0.13)) : Math.min(pt(h * 0.14), pt(w * 0.075))) * ts);
    if (s.extra.trim()) sizes.push(Math.min(pt(h * 0.1), pt(w * 0.055)) * ts);
    const texts = [...l.lines, ...(s.extra.trim() ? [s.extra] : [])];
    const total = sizes.reduce((a, z) => a + (z / 72) * 1.15, 0);
    let ty = by + Math.max(0, (bh - total) / 2);
    doc.setTextColor(s.ink);
    texts.forEach((text, k) => {
      doc.setFont("helvetica", k === 0 ? "bold" : "normal");
      const line = fitText(doc, text, bw, sizes[k]);
      const size = doc.getFontSize();
      ty += (size / 72) * 0.95;
      doc.text(line, s.align === "center" ? bx + bw / 2 : bx, ty, { align: s.align === "center" ? "center" : "left" });
      ty += (size / 72) * 0.2;
    });
    if (s.outline) doc.setDrawColor("#888888").setLineWidth(0.005).rect(x, y, w, h);
  });
  return doc.output("arraybuffer");
}

/** Builds the zip: Project name/rider, truck, pattern and labels, plus the project data for backup. */
export async function projectZip(
  name: string,
  data: ProjectData,
  dict: Dict,
  opts: { date: string; riderEstimate?: { rows: EstimateRow[]; cur: string } | null },
) {
  const { zipSync, strToU8 } = await import("fflate");
  const root = safeName(name);
  const files: Record<string, Uint8Array> = {};
  const add = (path: string, content: ArrayBuffer | Uint8Array | string) =>
    (files[`${root}/${path}`] = typeof content === "string" ? strToU8(content) : content instanceof Uint8Array ? content : new Uint8Array(content));

  if (data.rider?.lines?.length) add(`Rider/${safeName((data.rider.source || "rider").replace(/\.[a-z0-9]+$/i, ""))}.csv`, riderCsv(data.rider.lines, opts.riderEstimate?.rows ?? null, opts.riderEstimate?.cur ?? "USD"));
  if (data.truck?.placed?.length) {
    add("Truck/truck-plan.pdf", await truckPlanPdf(data.truck, dict.truck, opts.date));
    add("Truck/case-labels.pdf", await truckLabelsPdf(data.truck, dict.truck));
  }
  if (data.pattern) {
    const png = await patternPng(data.pattern);
    if (png) add(`Pattern/${safeName(data.pattern.name || "led-test-pattern")}-${data.pattern.cols * data.pattern.pw}x${data.pattern.rows * data.pattern.ph}.png`, new Uint8Array(await png.arrayBuffer()));
  }
  if (data.labels && buildLabels(data.labels).length) add("Labels/labels.pdf", await labelsPdf(data.labels));
  add("project.json", JSON.stringify({ name, exported: new Date().toISOString(), data }, null, 2));
  return zipSync(files, { level: 6 });
}

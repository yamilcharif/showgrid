"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { AccountNeeded, useSignedIn } from "@/components/AccountGate";
import { useT } from "@/components/I18n";
import { fmt, plural } from "@/lib/i18n/config";
import { PAPER, SHEETS, customSheet, parseTable, readTable, type Sheet } from "@/lib/labels";

const STORE_KEY = "sg_labels";
const BAND_COLORS = ["#e4572e", "#4c9be8", "#f2c14e", "#59c9a5", "#b07fe0", "#ff8fab", "#90be6d", "#f3a712", "#5dd9c1", "#8d99ae"];
const MAX_ROWS = 3000;

type Band = "none" | "left" | "top";
type Side = "left" | "right" | "top";

interface Settings {
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
  logoSide: Side;
  sheetId: string;
  custom: Omit<Sheet, "id" | "name" | "cols" | "rows">;
  metric: boolean;
  startAt: number;
  outline: boolean;
}

const START: Settings = {
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

/** Shrinks an uploaded logo so the settings stay small enough to keep on this device. */
function readLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 800 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

interface Label {
  key: string;
  lines: string[];
  band: string;
}

export function LabelTool() {
  const t = useT().labels;
  const [s, setS] = useState<Settings>(START);
  const [loaded, setLoaded] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [paste, setPaste] = useState("");
  const [printing, setPrinting] = useState(false);
  const [askAccount, setAskAccount] = useState(false);
  const signedIn = useSignedIn();
  const fileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewW, setPreviewW] = useState(600);
  const set = (patch: Partial<Settings>) => setS((x) => ({ ...x, ...patch }));

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time load from localStorage
      if (saved && typeof saved === "object") setS({ ...START, ...saved, custom: { ...START.custom, ...saved.custom } });
    } catch {
      // storage blocked: defaults
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(s));
    } catch {
      // too big or blocked: the list just won't be kept
    }
  }, [loaded, s]);

  // the preview scales the real-size sheet to the width available
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPreviewW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // print the sheet, then put the page back
  useEffect(() => {
    if (!printing) return;
    document.body.dataset.print = "sheet";
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    const id = setTimeout(() => window.print(), 150);
    return () => {
      clearTimeout(id);
      window.removeEventListener("afterprint", done);
      delete document.body.dataset.print;
    };
  }, [printing]);

  const loadRows = (rows: string[][]) => {
    const clean = rows.filter((r) => r.some((c) => c.trim())).slice(0, MAX_ROWS);
    const width = Math.max(0, ...clean.map((r) => r.length));
    set({ rows: clean, fields: Array.from({ length: Math.min(3, width) }, (_, i) => i), qtyCol: -1, colorBy: -1, headers: clean.length > 1 && width > 1 });
    setError("");
  };

  const open = async (f: File) => {
    if (/\.xls$/i.test(f.name)) return setError(t.errOldExcel);
    setReading(true);
    try {
      loadRows(await readTable(f));
    } catch {
      setError(t.errRead);
    } finally {
      setReading(false);
    }
  };

  // ---------- labels ----------

  const width = Math.max(0, ...s.rows.map((r) => r.length));
  const head = s.headers ? s.rows[0] ?? [] : [];
  const body = s.headers ? s.rows.slice(1) : s.rows;
  const colName = (i: number) => head[i]?.trim() || fmt(t.column, { n: i + 1 });
  const sheet = s.sheetId === "custom" ? customSheet(s.custom) : SHEETS.find((x) => x.id === s.sheetId) ?? SHEETS[1];
  const perSheet = sheet.cols * sheet.rows;

  const labels = useMemo<Label[]>(() => {
    const values = s.colorBy >= 0 ? [...new Set(body.map((r) => r[s.colorBy] ?? ""))] : [];
    const out: Label[] = [];
    body.forEach((r, i) => {
      const lines = s.fields.map((c) => r[c] ?? "").filter((v) => v.trim());
      if (!lines.length) return;
      const band = s.colorBy >= 0 ? BAND_COLORS[values.indexOf(r[s.colorBy] ?? "") % BAND_COLORS.length] : s.accent;
      const n = s.qtyCol >= 0 ? Math.max(0, Math.min(500, Math.round(Number(String(r[s.qtyCol]).replace(/[^\d.]/g, "")) || 0))) : s.copies;
      for (let k = 0; k < n; k++) out.push({ key: `${i}-${k}`, lines, band });
    });
    return out;
  }, [body, s.fields, s.colorBy, s.accent, s.qtyCol, s.copies]);

  // empty spots at the start, for a sheet that's partly used
  const skip = Math.max(0, Math.min(perSheet - 1, s.startAt - 1));
  const slots = [...Array<Label | null>(skip).fill(null), ...labels];
  const pages = Math.max(1, Math.ceil(slots.length / perSheet));
  const paper = PAPER[sheet.paper];

  const unit = s.metric ? "mm" : "in";
  const shown = (inches: number) => (s.metric ? Math.round(inches * 254) / 10 : Math.round(inches * 1000) / 1000);
  const fromShown = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? (s.metric ? n / 25.4 : n) : 0;
  };
  const setCustom = (patch: Partial<Settings["custom"]>) => set({ sheetId: "custom", custom: { ...s.custom, ...patch } });

  const sheetPage = (p: number) => (
    <div key={p} className="lab-page" style={{ width: `${paper.w}in`, height: `${paper.h}in` }}>
      {slots.slice(p * perSheet, (p + 1) * perSheet).map((l, i) => {
        if (!l) return null;
        const c = i % sheet.cols;
        const r = Math.floor(i / sheet.cols);
        const style: CSSProperties = {
          left: `${sheet.left + c * (sheet.w + sheet.gapX)}in`,
          top: `${sheet.top + r * (sheet.h + sheet.gapY)}in`,
          width: `${sheet.w}in`,
          height: `${sheet.h}in`,
          background: s.bg,
          color: s.ink,
          ["--band" as string]: l.band,
        };
        return (
          <div key={l.key} className={`lab ${s.outline ? "outline" : ""} band-${s.band} logo-${s.logo ? s.logoSide : "none"} align-${s.align}`} style={style}>
            {s.band !== "none" && <span className="lab-band" />}
            {/* eslint-disable-next-line @next/next/no-img-element -- an uploaded logo, printed as is */}
            {s.logo && <img className="lab-logo" src={s.logo} alt="" />}
            <div className="lab-text">
              {l.lines.map((line, k) => (
                <span key={k} className={k === 0 ? "l1" : "ln"}>
                  {line}
                </span>
              ))}
              {s.extra.trim() && <span className="lx">{s.extra}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );

  const print = () => {
    if (!signedIn) return setAskAccount(true);
    setPrinting(true);
  };
  const zoom = Math.min(1, previewW / (paper.w * 96));

  return (
    <div className="lab-tool">
      <aside className="auth-form lab-side">
        <h2>{t.data}</h2>
        <div className="inv-actions">
          <button type="button" className="btn primary" disabled={reading} onClick={() => fileRef.current?.click()}>
            {reading ? t.reading : `📄 ${t.upload}`}
          </button>
          {body.length > 0 && <span className="muted small">{plural(body.length, t.rowsLoaded)}</span>}
        </div>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept=".xlsx,.xls,.csv,.tsv,.txt,.pdf,application/pdf,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) open(f);
          }}
        />
        {error && <p className="auth-err">{error}</p>}
        <details open={!s.rows.length}>
          <summary>{t.paste}</summary>
          <textarea className="note lab-paste" rows={5} placeholder={t.pastePlaceholder} value={paste} onChange={(e) => setPaste(e.target.value)} />
          <button type="button" className="btn sm" disabled={!paste.trim()} onClick={() => loadRows(parseTable(paste))}>
            {t.usePaste}
          </button>
        </details>

        {width > 0 && (
          <>
            <label className="pat-check">
              <input type="checkbox" checked={s.headers} onChange={(e) => set({ headers: e.target.checked })} />
              {t.headers}
            </label>
            <h2>{t.content}</h2>
            <p className="muted small">{t.contentHint}</p>
            <div className="lab-fields">
              {Array.from({ length: width }, (_, i) => {
                const on = s.fields.includes(i);
                return (
                  <label key={i} className={on ? "on" : undefined}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => set({ fields: e.target.checked ? [...s.fields, i] : s.fields.filter((x) => x !== i) })}
                    />
                    {on && <b>{s.fields.indexOf(i) + 1}</b>}
                    <span>{colName(i)}</span>
                    <small className="muted">{body[0]?.[i]}</small>
                  </label>
                );
              })}
            </div>
            <label className="field">
              <span>{t.extra}</span>
              <input value={s.extra} maxLength={80} placeholder={t.extraPlaceholder} onChange={(e) => set({ extra: e.target.value })} />
            </label>
            <div className="pat-two">
              <label className="field">
                <span>{t.copiesEach}</span>
                <input type="number" min={1} max={100} disabled={s.qtyCol >= 0} value={s.copies} onChange={(e) => set({ copies: Math.max(1, Math.min(100, Math.round(Number(e.target.value) || 1))) })} />
              </label>
              <label className="field">
                <span>{t.copiesFrom}</span>
                <select value={s.qtyCol} onChange={(e) => set({ qtyCol: Number(e.target.value) })}>
                  <option value={-1}>{t.none}</option>
                  {Array.from({ length: width }, (_, i) => (
                    <option key={i} value={i}>
                      {colName(i)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
        )}

        <h2>{t.look}</h2>
        <div className="pat-colors">
          {(
            [
              ["bg", t.bg],
              ["ink", t.ink],
              ["accent", t.accent],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="pat-color">
              <input type="color" value={s[k]} onChange={(e) => set({ [k]: e.target.value } as Partial<Settings>)} />
              {label}
            </label>
          ))}
        </div>
        <div className="pat-two">
          <label className="field">
            <span>{t.band}</span>
            <select value={s.band} onChange={(e) => set({ band: e.target.value as Band })}>
              <option value="left">{t.bandLeft}</option>
              <option value="top">{t.bandTop}</option>
              <option value="none">{t.bandNone}</option>
            </select>
          </label>
          <label className="field">
            <span>{t.align}</span>
            <select value={s.align} onChange={(e) => set({ align: e.target.value as Settings["align"] })}>
              <option value="left">{t.alignLeft}</option>
              <option value="center">{t.alignCenter}</option>
            </select>
          </label>
        </div>
        {width > 0 && (
          <label className="field">
            <span>{t.colorBy}</span>
            <select value={s.colorBy} onChange={(e) => set({ colorBy: Number(e.target.value) })}>
              <option value={-1}>{t.colorByNone}</option>
              {Array.from({ length: width }, (_, i) => (
                <option key={i} value={i}>
                  {colName(i)}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="pat-logo">
          <label className="btn sm">
            {s.logo ? t.logoChange : t.logoAdd}
            <input
              type="file"
              hidden
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) readLogo(f).then((logo) => set({ logo }), () => {});
              }}
            />
          </label>
          {s.logo && (
            <>
              <select value={s.logoSide} aria-label={t.logoSide} onChange={(e) => set({ logoSide: e.target.value as Side })}>
                {(["left", "right", "top"] as const).map((k) => (
                  <option key={k} value={k}>
                    {t.sides[k]}
                  </option>
                ))}
              </select>
              <button type="button" className="link small" onClick={() => set({ logo: null })}>
                {t.remove}
              </button>
            </>
          )}
        </div>

        <h2>{t.sheet}</h2>
        <select value={s.sheetId} onChange={(e) => set({ sheetId: e.target.value })}>
          {SHEETS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
          <option value="custom">{t.custom}</option>
        </select>
        <div className="pat-two">
          <label className="field">
            <span>{t.paper}</span>
            <select value={sheet.paper} onChange={(e) => setCustom({ ...sheet, paper: e.target.value as Sheet["paper"] })}>
              <option value="letter">{t.letter}</option>
              <option value="a4">{t.a4}</option>
            </select>
          </label>
          <label className="field">
            <span>{t.units}</span>
            <select value={unit} onChange={(e) => set({ metric: e.target.value === "mm" })}>
              <option value="in">in</option>
              <option value="mm">mm</option>
            </select>
          </label>
          {(
            [
              ["w", t.lw],
              ["h", t.lh],
              ["gapX", t.gapX],
              ["gapY", t.gapY],
              ["top", t.top],
              ["left", t.left],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="field">
              <span>
                {label} ({unit})
              </span>
              <input
                type="number"
                min={0}
                step={s.metric ? 0.5 : 0.0625}
                value={shown(sheet[k])}
                onChange={(e) => setCustom({ paper: sheet.paper, w: sheet.w, h: sheet.h, top: sheet.top, left: sheet.left, gapX: sheet.gapX, gapY: sheet.gapY, [k]: fromShown(e.target.value) })}
              />
            </label>
          ))}
        </div>
        <p className="muted small">{fmt(t.perSheet, { cols: sheet.cols, rows: sheet.rows, n: perSheet })}</p>
        <label className="field">
          <span>{t.startAt}</span>
          <input type="number" min={1} max={perSheet} value={s.startAt} onChange={(e) => set({ startAt: Math.max(1, Math.min(perSheet, Math.round(Number(e.target.value) || 1))) })} />
        </label>
        <p className="muted small">{t.startHint}</p>
        <label className="pat-check">
          <input type="checkbox" checked={s.outline} onChange={(e) => set({ outline: e.target.checked })} />
          {t.outline}
        </label>
      </aside>

      <section className="lab-main">
        <div className="pat-head">
          <div>
            <strong className="num">{plural(labels.length, t.total)}</strong>
            <span className="muted small"> · {plural(pages, t.pages)}</span>
          </div>
          <button type="button" className="btn primary" disabled={!labels.length} onClick={print}>
            🖨 {t.print}
          </button>
        </div>
        {askAccount && !signedIn && <AccountNeeded />}
        <div ref={previewRef} className="lab-preview">
          {labels.length ? (
            <>
              {[0, 1].filter((p) => p < pages).map((p) => (
                <div key={p} className="lab-zoom" style={{ zoom }}>
                  {sheetPage(p)}
                </div>
              ))}
              {pages > 2 && <p className="muted small">{plural(pages - 2, t.morePages)}</p>}
            </>
          ) : (
            <p className="muted">{t.empty}</p>
          )}
        </div>
      </section>

      {printing &&
        createPortal(
          <div className="print-root lab-print">
            <style>{`@page { size: ${sheet.paper === "a4" ? "A4" : "letter"}; margin: 0; }`}</style>
            {Array.from({ length: pages }, (_, p) => sheetPage(p))}
          </div>,
          document.body,
        )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { AccountNeeded, useSignedIn } from "@/components/AccountGate";
import { useT } from "@/components/I18n";
import { ProjectBar, useToolState } from "@/components/Projects";
import { ToolFiles } from "@/components/ToolFiles";
import { useI18n } from "@/components/I18n";
import { fmt, plural } from "@/lib/i18n/config";
import { LABELS_START as START, MAX_ROWS, PAPER, SHEETS, buildLabels, colorKey, partSize, type LabelPart, customSheet, detectFixture, inkFor, parseTable, readTable, type Band, type FixtureCols, type Label, type LabelSettings as Settings, type LabelSide as Side, type Sheet } from "@/lib/labels";

const STORE_KEY = "sg_labels";
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

export function LabelTool() {
  const t = useT().labels;
  const { t: T } = useI18n();
  // kept in the open project, or on this device
  const { state: s, setState: setS, project, saving } = useToolState("labels", STORE_KEY, START, (v) => {
    const saved = v as Partial<Settings> | null;
    return saved && typeof saved === "object" ? { ...START, ...saved, custom: { ...START.custom, ...saved.custom } } : START;
  });
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [paste, setPaste] = useState("");
  // the part of the labels whose text size is being changed; null changes all the text
  const [part, setPart] = useState<LabelPart | null>(null);
  // what a plot PDF gave: how many fixtures and motors, and which set is loaded
  const [plot, setPlot] = useState<{ fixtures: number; motors: number; kind: "fixtures" | "motors"; rows: { fixtures: string[][]; motors: string[][] } } | null>(null);
  const [printing, setPrinting] = useState(false);
  const [askAccount, setAskAccount] = useState(false);
  const signedIn = useSignedIn();
  const fileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewW, setPreviewW] = useState(600);
  const set = (patch: Partial<Settings>) => setS((x) => ({ ...x, ...patch }));


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
    const headers = clean.length > 1 && width > 1;
    // a patch list or plot report: make fixture stickers, colored by position
    const fx = headers ? detectFixture(clean[0]) : null;
    const fixture = !!fx && fx.id >= 0 && (fx.addr >= 0 || fx.pos >= 0);
    set({
      rows: clean,
      fields: Array.from({ length: Math.min(3, width) }, (_, i) => i),
      qtyCol: -1,
      headers,
      template: fixture ? "fixture" : "general",
      fx: fx ?? undefined,
      colorBy: fixture ? fx!.pos : -1,
    });
    setError("");
  };

  const open = async (f: File) => {
    if (/\.xls$/i.test(f.name)) return setError(t.errOldExcel);
    setReading(true);
    setPlot(null);
    try {
      // a plot is a drawing: read fixtures and motors from where the words sit; a report or list reads as a table
      if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") {
        const { readPlot, fixtureRows, motorRows } = await import("@/lib/plotReader");
        const found = await readPlot(f);
        if (!found.words) return setError(t.errNoText);
        if (found.fixtures.length >= 2 || found.motors.length >= 2) {
          const kind = found.fixtures.length >= 2 ? "fixtures" : "motors";
          setPlot({ fixtures: found.fixtures.length, motors: found.motors.length, kind, rows: { fixtures: fixtureRows(found.fixtures), motors: motorRows(found.motors) } });
          return loadRows(kind === "fixtures" ? fixtureRows(found.fixtures) : motorRows(found.motors));
        }
      }
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

  const labels = useMemo(() => buildLabels(s), [s]);

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
  /** Puts one value in a column's empty cells (all of them if none are empty), like a fixture type for every ID. */
  const fillColumn = (c: number) => {
    const v = window.prompt(fmt(t.fillPrompt, { col: colName(c) }));
    if (v == null) return;
    const start = s.headers ? 1 : 0;
    const anyEmpty = s.rows.some((r, k) => k >= start && !(r[c] ?? "").trim());
    set({ rows: s.rows.map((r, k) => (k >= start && (!anyEmpty || !(r[c] ?? "").trim()) ? Object.assign([...r], { [c]: v }) : r)) });
  };
  const editCell = (r: number, c: number, v: string) =>
    set({ rows: s.rows.map((row, k) => (k === r ? Object.assign([...row], { [c]: v }) : row)) });
  const fmtSize = (inches: number) => (s.metric ? `${Math.round(inches * 25.4)} mm` : `${Math.round(inches * 100) / 100}"`);
  const setCustom = (patch: Partial<Settings["custom"]>) => set({ sheetId: "custom", custom: { ...s.custom, ...patch } });

  // the logo: in the layout's place, or wherever it was dragged, at the chosen size
  const logoStyle = (fixture: boolean): CSSProperties | undefined => {
    const size = s.logoSize;
    if (s.logoPos) return { position: "absolute", left: `${s.logoPos.x * 100}%`, top: `${s.logoPos.y * 100}%`, transform: "translate(-50%, -50%)", maxHeight: `${(size ?? (fixture ? 0.24 : 0.5)) * 100}cqh`, maxWidth: "70cqw" };
    return size ? { maxHeight: `${size * 100}cqh`, maxWidth: "70cqw" } : undefined;
  };
  // dragging the logo on any label moves it on all of them
  const dragLogo = (e: React.PointerEvent<HTMLImageElement>) => {
    const box = e.currentTarget.parentElement?.getBoundingClientRect();
    if (!box) return;
    e.preventDefault();
    const move = (ev: PointerEvent) =>
      set({ logoPos: { x: Math.min(1, Math.max(0, (ev.clientX - box.left) / box.width)), y: Math.min(1, Math.max(0, (ev.clientY - box.top) / box.height)) } });
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // click a part of any label to size that part on all of them
  const pick = (k: LabelPart) => ({
    "data-part": k,
    className: part === k ? "part-sel" : undefined,
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      setPart(part === k ? null : k);
    },
  });

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
          ...Object.fromEntries((["id", "pos", "type", "mode", "patch", "extra", "l1", "ln"] as const).map((k) => [`--ts-${k}`, partSize(s, k)])),
        };
        if (l.fx) {
          const fill = s.fxFill !== false;
          return (
            <div
              key={l.key}
              className={`lab lab-fx ${s.outline ? "outline" : ""}`}
              style={{ ...style, background: fill ? l.band : s.bg, color: fill ? inkFor(l.band) : s.ink, borderLeft: fill ? undefined : `0.12in solid ${l.band}` }}
            >
              <span className="fx-id">
                <span {...pick("id")}>{l.fx.id}</span>
              </span>
              <span className="fx-pos">
                <span {...pick("pos")}>{l.fx.pos}</span>
              </span>
              <span className="fx-type">
                {l.fx.type && <span {...pick("type")}>{l.fx.type}</span>}
                {l.fx.mode && (
                  <span className={`fx-mode${part === "mode" ? " part-sel" : ""}`} data-part="mode" onClick={pick("mode").onClick}>
                    {l.fx.mode}
                  </span>
                )}
              </span>
              <span className={`fx-patch${part === "patch" ? " part-sel" : ""}`} data-part="patch" onClick={pick("patch").onClick}>
                {l.fx.u && <span>U: {l.fx.u}</span>}
                {l.fx.a && <span>A: {l.fx.a}</span>}
              </span>
              {s.logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- an uploaded logo, printed as is
                <img className="fx-logo lab-drag" src={s.logo} alt="" style={logoStyle(true)} onPointerDown={dragLogo} draggable={false} />
              ) : s.extra.trim() ? (
                <span className="fx-extra">
                  <span {...pick("extra")}>{s.extra}</span>
                </span>
              ) : null}
            </div>
          );
        }
        return (
          <div key={l.key} className={`lab ${s.outline ? "outline" : ""} band-${s.band} logo-${s.logo ? s.logoSide : "none"} align-${s.align}`} style={style}>
            {s.band !== "none" && <span className="lab-band" />}
            {/* eslint-disable-next-line @next/next/no-img-element -- an uploaded logo, printed as is */}
            {s.logo && <img className="lab-logo lab-drag" src={s.logo} alt="" style={logoStyle(false)} onPointerDown={dragLogo} draggable={false} />}
            <div className="lab-text">
              {l.lines.map((line, k) => (
                <span key={k} className={`${k === 0 ? "l1" : "ln"}${part === (k === 0 ? "l1" : "ln") ? " part-sel" : ""}`} data-part={k === 0 ? "l1" : "ln"} onClick={pick(k === 0 ? "l1" : "ln").onClick}>
                  {line}
                </span>
              ))}
              {s.extra.trim() && (
                <span className={`lx${part === "extra" ? " part-sel" : ""}`} data-part="extra" onClick={pick("extra").onClick}>
                  {s.extra}
                </span>
              )}
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
      <ProjectBar project={project} saving={saving} />
      <ToolFiles
        tool="labels"
        name={`${project?.name ?? t.metaTitle.split(" · ")[0]}`}
        data={s}
        onOpen={(v) => {
          const saved = v as Partial<Settings> | null;
          if (saved && typeof saved === "object") setS({ ...START, ...saved, custom: { ...START.custom, ...saved.custom } });
        }}
        downloadLabel={T.files.labelsPdf}
        download={
          labels.length
            ? async () => {
                const { labelsPdf } = await import("@/lib/projectExport");
                return { blob: new Blob([await labelsPdf(s)], { type: "application/pdf" }), name: `${project?.name ?? "labels"}.pdf`.replace(/[\\/:*?"<>|]+/g, "-") };
              }
            : undefined
        }
      />
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
        {plot && (
          <div className="lab-plot">
            <p className="small">{fmt(t.plotFound, { f: plot.fixtures, m: plot.motors })}</p>
            {plot.fixtures > 0 && plot.motors > 0 && (
              <div className="seg seg2" role="radiogroup">
                {(["fixtures", "motors"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={plot.kind === k}
                    className={plot.kind === k ? "on" : undefined}
                    onClick={() => {
                      setPlot({ ...plot, kind: k });
                      loadRows(plot.rows[k]);
                    }}
                  >
                    {k === "fixtures" ? fmt(t.plotFixtures, { n: plot.fixtures }) : fmt(t.plotMotors, { n: plot.motors })}
                  </button>
                ))}
              </div>
            )}
            <p className="muted small">{t.plotHint}</p>
          </div>
        )}
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
            <div className="seg seg2 lab-template" role="radiogroup" aria-label={t.template}>
              {(["general", "fixture"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={(s.template ?? "general") === k}
                  className={(s.template ?? "general") === k ? "on" : undefined}
                  onClick={() => set(k === "fixture" && !s.fx ? { template: k, fx: detectFixture(head) } : { template: k })}
                >
                  {k === "general" ? t.templateGeneral : t.templateFixture}
                </button>
              ))}
            </div>
            {s.template === "fixture" ? (
              <>
                <p className="muted small">{t.fxHint}</p>
                <div className="pat-two">
                  {(["id", "pos", "type", "mode", "uni", "addr"] as const).map((k) => (
                    <label key={k} className="field">
                      <span>{t.fxCols[k]}</span>
                      <select
                        value={s.fx?.[k] ?? -1}
                        onChange={(e) => set({ fx: { ...(s.fx ?? { id: -1, pos: -1, type: -1, mode: -1, uni: -1, addr: -1 }), [k]: Number(e.target.value) } as FixtureCols })}
                      >
                        <option value={-1}>{t.none}</option>
                        {Array.from({ length: width }, (_, i) => (
                          <option key={i} value={i}>
                            {colName(i)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <label className="pat-check">
                  <input type="checkbox" checked={s.fxFill !== false} onChange={(e) => set({ fxFill: e.target.checked })} />
                  {t.fxFill}
                </label>
              </>
            ) : (
              <>
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
              </>
            )}
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
        <label className="field">
          <span>
            {t.textSize} · {part ? t.parts[part] : t.allText} · {Math.round((part ? s.partScale?.[part] ?? 1 : s.textScale ?? 1) * 100)}%
          </span>
          <input
            type="range"
            min={part ? 0.3 : 0.5}
            max={part ? 3 : 2.5}
            step={0.05}
            value={part ? s.partScale?.[part] ?? 1 : s.textScale ?? 1}
            onChange={(e) => set(part ? { partScale: { ...s.partScale, [part]: Number(e.target.value) } } : { textScale: Number(e.target.value) })}
          />
        </label>
        <div className="lab-partbar">
          <span className="muted small">{part ? fmt(t.partPicked, { part: t.parts[part] }) : t.partHint}</span>
          {part && (
            <>
              <button type="button" className="link small" onClick={() => set({ partScale: { ...s.partScale, [part]: 1 } })}>
                {t.partReset}
              </button>
              <button type="button" className="link small" onClick={() => setPart(null)}>
                {t.allText}
              </button>
            </>
          )}
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
        {s.colorBy >= 0 && (
          <div className="lab-colorkey">
            {colorKey(s).slice(0, 40).map(({ value, color }) => (
              <label key={value} className="pat-color">
                <input type="color" value={color} onChange={(e) => set({ valueColors: { ...s.valueColors, [value]: e.target.value } })} />
                {value || "—"}
              </label>
            ))}
          </div>
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
              <select value={s.logoPos ? "free" : s.logoSide} aria-label={t.logoSide} onChange={(e) => e.target.value !== "free" && set({ logoSide: e.target.value as Side, logoPos: null })}>
                {s.logoPos && <option value="free">{t.logoFree}</option>}
                {(["left", "right", "top"] as const).map((k) => (
                  <option key={k} value={k}>
                    {t.sides[k]}
                  </option>
                ))}
              </select>
              <button type="button" className="link small" onClick={() => set({ logo: null, logoPos: null })}>
                {t.remove}
              </button>
            </>
          )}
        </div>
        {s.logo && (
          <>
            <label className="field">
              <span>{t.logoSize}</span>
              <input type="range" min={0.08} max={0.9} step={0.01} value={s.logoSize ?? (s.template === "fixture" ? 0.24 : 0.7)} onChange={(e) => set({ logoSize: Number(e.target.value) })} />
            </label>
            <p className="muted small">{t.logoDragHint}</p>
          </>
        )}

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
        <div className="lab-per">
          {(["cols", "rows"] as const).map((k) => (
            <label key={k} className="field">
              <span>{k === "cols" ? t.perRow : t.perCol}</span>
              <input
                type="number"
                min={1}
                max={30}
                value={sheet[k]}
                onChange={(e) => {
                  // the sticker size is worked out so that many fit between the margins
                  const n = Math.max(1, Math.min(30, Math.round(Number(e.target.value) || 1)));
                  const cols = k === "cols" ? n : sheet.cols;
                  const rows = k === "rows" ? n : sheet.rows;
                  const pg = PAPER[sheet.paper];
                  setCustom({
                    paper: sheet.paper,
                    top: sheet.top,
                    left: sheet.left,
                    gapX: sheet.gapX,
                    gapY: sheet.gapY,
                    w: Math.max(0.25, (pg.w - 2 * sheet.left - (cols - 1) * sheet.gapX) / cols),
                    h: Math.max(0.25, (pg.h - 2 * sheet.top - (rows - 1) * sheet.gapY) / rows),
                  });
                }}
              />
            </label>
          ))}
        </div>
        <p className="muted small">{fmt(t.perSheet, { cols: sheet.cols, rows: sheet.rows, n: perSheet })} · {fmtSize(sheet.w)} × {fmtSize(sheet.h)}</p>
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
        <div ref={previewRef} className="lab-preview" onClick={() => setPart(null)}>
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

      {width > 0 && (
        <details className="auth-form lab-data" open={body.length <= 60}>
          <summary>
            {t.editData} <span className="muted small">· {plural(body.length, t.rowsLoaded)}</span>
          </summary>
          <p className="muted small">{t.editHint}</p>
          <div className="lab-grid">
            <table>
              {s.headers && (
                <thead>
                  <tr>
                    <th />
                    {Array.from({ length: width }, (_, c) => (
                      <th key={c}>
                        <span className="lab-th">
                          <input value={head[c] ?? ""} aria-label={colName(c)} onChange={(e) => editCell(0, c, e.target.value)} />
                          <button type="button" className="link small" title={t.fillCol} aria-label={`${t.fillCol}: ${colName(c)}`} onClick={() => fillColumn(c)}>
                            ⇣
                          </button>
                        </span>
                      </th>
                    ))}
                    <th />
                  </tr>
                </thead>
              )}
              <tbody>
                {body.slice(0, 500).map((r, i) => {
                  const ri = i + (s.headers ? 1 : 0);
                  return (
                    <tr key={ri}>
                      <td className="muted small">{i + 1}</td>
                      {Array.from({ length: width }, (_, c) => (
                        <td key={c}>
                          <input value={r[c] ?? ""} aria-label={`${colName(c)} ${i + 1}`} onChange={(e) => editCell(ri, c, e.target.value)} />
                        </td>
                      ))}
                      <td>
                        <button type="button" className="link small" aria-label={t.delRow} onClick={() => set({ rows: s.rows.filter((_, k) => k !== ri) })}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="inv-actions">
            <button type="button" className="btn sm" onClick={() => set({ rows: [...s.rows, Array(width).fill("")] })}>
              {t.addRow}
            </button>
            <button type="button" className="btn sm" onClick={() => set({ rows: s.rows.map((r, k) => (k === 0 && s.headers ? [...r, fmt(t.column, { n: width + 1 })] : [...r, ""])) })}>
              {t.addCol}
            </button>
          </div>
        </details>
      )}

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

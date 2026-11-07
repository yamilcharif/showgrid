"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { AccountNeeded, useSignedIn } from "@/components/AccountGate";
import { useI18n, useT } from "@/components/I18n";
import { ProjectBar, useToolState } from "@/components/Projects";
import { ToolFiles } from "@/components/ToolFiles";
import { fmt, plural } from "@/lib/i18n/config";
import {
  COLOR_NAMES,
  PATCH_START as START,
  blankRow,
  byId,
  byPatch,
  colorHex,
  conflicts,
  footOf,
  readGdtf,
  readPatchFile,
  repatch,
  typeFor,
  type FixtureType,
  type PatchRow,
  type PatchSettings as Settings,
} from "@/lib/patch";
import { STICKER_SHEETS, alignmentPdf, patchReportPdf, stickersPdf } from "@/lib/patchPdf";

const STORE_KEY = "sg_patch";
type Field = "fid" | "type" | "mode" | "pos" | "color" | "u" | "a" | "foot" | "notes";
const FIELDS: Field[] = ["fid", "type", "mode", "pos", "color", "u", "a", "foot", "notes"];

const merge = (v: unknown): Settings => (v && typeof v === "object" ? { ...START, ...(v as Partial<Settings>) } : START);

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

function saveBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function PatchTool() {
  const t = useT().patch;
  const { t: T } = useI18n();
  const { state: s, setState: setS, project, saving } = useToolState("patch", STORE_KEY, START, merge);
  const set = (patch: Partial<Settings>) => setS((x) => ({ ...x, ...patch }));
  const setRows = (f: (rows: PatchRow[]) => PatchRow[]) => setS((x) => ({ ...x, rows: f(x.rows) }));
  const signedIn = useSignedIn();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [append, setAppend] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [bulk, setBulk] = useState({ pos: "", color: "", type: "", mode: "", u: "1", a: "1" });
  const fileRef = useRef<HTMLInputElement>(null);
  const gdtfRef = useRef<HTMLInputElement>(null);

  const clash = useMemo(() => conflicts(s.rows, s.types), [s.rows, s.types]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? s.rows.filter((r) => FIELDS.some((k) => r[k].toLowerCase().includes(q))) : s.rows;
  }, [s.rows, query]);
  const positions = useMemo(() => [...new Set(s.rows.map((r) => r.pos).filter(Boolean))], [s.rows]);
  const typeNames = useMemo(() => [...new Set([...s.types.map((x) => x.name), ...s.rows.map((r) => r.type)].filter(Boolean))], [s.rows, s.types]);
  const chosen = s.rows.filter((r) => sel.has(r.key));

  // ---------- loading ----------

  const load = async (f: File) => {
    setBusy(true);
    setMsg(null);
    try {
      const got = await readPatchFile(f, s.types);
      if (!got.rows.length) return setMsg({ ok: false, text: fmt(t.readNone, { file: f.name }) });
      const known = new Set(s.types.map((x) => x.name));
      setS((x) => ({ ...x, rows: append ? [...x.rows, ...got.rows] : got.rows, types: [...x.types, ...got.types.filter((y) => !known.has(y.name))] }));
      setSel(new Set());
      setMsg({ ok: true, text: `${fmt(t.read, { n: got.rows.length, file: f.name })}${got.types.length ? ` ${fmt(t.readTypes, { n: got.types.length })}` : ""}` });
    } catch {
      setMsg({ ok: false, text: t.errRead });
    } finally {
      setBusy(false);
    }
  };

  const addGdtf = async (files: FileList) => {
    setBusy(true);
    const added: string[] = [];
    try {
      for (const f of Array.from(files)) {
        const ft = await readGdtf(f).catch(() => null);
        if (!ft) {
          setMsg({ ok: false, text: `${f.name}: ${t.errRead}` });
          continue;
        }
        setS((x) => ({ ...x, types: [...x.types.filter((y) => y.name !== ft.name), ft] }));
        added.push(fmt(t.gdtfAdded, { name: ft.name, n: ft.modes.length }));
      }
      if (added.length) setMsg({ ok: true, text: added.join(" ") });
    } finally {
      setBusy(false);
    }
  };

  // ---------- editing ----------

  const edit = (key: string, k: Field, v: string) =>
    setS((x) => {
      const row = x.rows.find((r) => r.key === key);
      if (!row) return x;
      // a position's color is the same on all its fixtures
      if (k === "color" && row.pos) return { ...x, rows: x.rows.map((r) => (r.pos === row.pos ? { ...r, color: v } : r)) };
      const next = { ...row, [k]: v };
      // a GDTF mode brings its footprint
      if (k === "mode") {
        const m = typeFor(x.types, row.type)?.modes.find((mm) => mm.name === v);
        if (m) next.foot = String(m.foot);
      }
      return { ...x, rows: x.rows.map((r) => (r.key === key ? next : r)) };
    });

  const applyBulk = (k: "pos" | "color" | "type" | "mode") => {
    const v = bulk[k].trim();
    setS((x) => {
      const color = k === "color" ? new Set(x.rows.filter((r) => sel.has(r.key)).map((r) => r.pos).filter(Boolean)) : null;
      return {
        ...x,
        rows: x.rows.map((r) => {
          if (color) return sel.has(r.key) || (r.pos && color.has(r.pos)) ? { ...r, color: v } : r;
          if (!sel.has(r.key)) return r;
          if (k === "mode") {
            const m = typeFor(x.types, r.type)?.modes.find((mm) => mm.name === v);
            return { ...r, mode: v, foot: m ? String(m.foot) : r.foot };
          }
          if (k === "type") {
            const ft = typeFor(x.types, v);
            const keep = ft?.modes.find((mm) => mm.name === r.mode);
            const m = keep ?? ft?.modes[0];
            return { ...r, type: v, mode: m ? m.name : r.mode, foot: m ? String(m.foot) : r.foot };
          }
          return { ...r, [k]: v };
        }),
      };
    });
  };

  const toggle = (key: string) => setSel((x) => {
    const n = new Set(x);
    if (n.has(key)) n.delete(key);
    else n.add(key);
    return n;
  });

  // ---------- printing ----------

  const pdf = async (build: () => Promise<ArrayBuffer>, name: string) => {
    if (!signedIn) return setAsk(true);
    setBusy(true);
    try {
      saveBlob(new Blob([await build()], { type: "application/pdf" }), name);
    } catch {
      setMsg({ ok: false, text: T.files.downloadError });
    } finally {
      setBusy(false);
    }
  };
  const base = (s.show || project?.name || "patch").replace(/[\\/:*?"<>|]+/g, "-").trim();
  const paperText = (c: string) => (c ? fmt(t.paperColor, { c }) : t.noColor);

  const modesFor = (r: PatchRow) => typeFor(s.types, r.type)?.modes ?? [];
  const allSel = shown.length > 0 && shown.every((r) => sel.has(r.key));

  return (
    <div className="ptc-tool">
      <ProjectBar project={project} saving={saving} />
      <ToolFiles
        tool="patch"
        name={base}
        data={s}
        onOpen={(v) => setS(merge(v))}
        downloadLabel={t.report}
        download={s.rows.length ? async () => ({ blob: new Blob([await patchReportPdf(s)], { type: "application/pdf" }), name: `${base} - Address Patch By Fixture.pdf` }) : undefined}
        more={
          s.rows.length
            ? [
                { label: t.stickers, build: async () => ({ blob: new Blob([await stickersPdf(s, s.rows, paperText)], { type: "application/pdf" }), name: `${base} - Fixture Stickers.pdf` }) },
                { label: t.alignment, build: async () => ({ blob: new Blob([await alignmentPdf(s, t.alignNote)], { type: "application/pdf" }), name: "Sticker Alignment Test.pdf" }) },
              ]
            : undefined
        }
      />

      <section className="auth-form ptc-load">
        <h2>{t.import}</h2>
        <div className="inv-actions">
          <button type="button" className="btn primary" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? t.reading : `📄 ${t.upload}`}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => gdtfRef.current?.click()}>
            ＋ {t.gdtf}
          </button>
          {s.rows.length > 0 && (
            <label className="pat-check">
              <input type="checkbox" checked={append} onChange={(e) => setAppend(e.target.checked)} />
              {t.append}
            </label>
          )}
        </div>
        <p className="muted small">
          {t.uploadHint} {t.gdtfHint.split("gdtf-share.com")[0]}
          <a href="https://gdtf-share.com" target="_blank" rel="noreferrer">
            gdtf-share.com
          </a>
          {t.gdtfHint.split("gdtf-share.com")[1]}
        </p>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept=".mvr,.xml,.pdf,.xlsx,.csv,.tsv,.txt,application/pdf,text/csv,text/xml,application/xml"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) load(f);
          }}
        />
        <input
          ref={gdtfRef}
          type="file"
          hidden
          multiple
          accept=".gdtf"
          onChange={(e) => {
            const f = e.target.files;
            if (f?.length) addGdtf(f).finally(() => (e.target.value = ""));
          }}
        />
        {msg && <p className={msg.ok ? "small" : "auth-err"}>{msg.text}</p>}
        {s.types.length > 0 && (
          <div className="ptc-types">
            <span className="muted small">{t.types}:</span>
            {s.types.map((ft: FixtureType) => (
              <span key={ft.name} className="ptc-chip" title={ft.modes.map((m) => `${m.name} · ${m.foot}ch`).join("\n")}>
                {ft.maker ? `${ft.maker} ` : ""}
                {ft.name} <span className="muted">· {plural(ft.modes.length, t.modes)}</span>
                <button type="button" className="link small" aria-label={`${t.removeType} ${ft.name}`} onClick={() => set({ types: s.types.filter((x) => x.name !== ft.name) })}>
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="auth-form ptc-table">
        <div className="pat-head">
          <div>
            <h2>{t.table}</h2>
            <span className="muted small">
              {plural(s.rows.length, t.fixtures)}
              {clash.size > 0 && <strong className="ptc-bad"> · {plural(clash.size, t.conflicts)}</strong>}
            </span>
          </div>
          <div className="inv-actions">
            <input className="ptc-find" value={query} placeholder={t.filter} aria-label={t.filter} onChange={(e) => setQuery(e.target.value)} />
            <button type="button" className="link small" onClick={() => setRows((r) => [...r].sort(byId))}>
              {t.sortId}
            </button>
            <button type="button" className="link small" onClick={() => setRows((r) => [...r].sort((x, y) => x.pos.localeCompare(y.pos, undefined, { numeric: true }) || byId(x, y)))}>
              {t.sortPos}
            </button>
            <button type="button" className="link small" onClick={() => setRows((r) => [...r].sort(byPatch))}>
              {t.sortPatch}
            </button>
          </div>
        </div>

        {chosen.length > 0 && (
          <div className="ptc-bulk">
            <strong className="small">{plural(chosen.length, t.selected)}</strong>
            {(
              [
                ["pos", t.setPos, "ptc-pos-list"],
                ["color", t.setColor, "ptc-color-list"],
                ["type", t.setType, "ptc-type-list"],
                ["mode", t.setMode, "ptc-bulk-modes"],
              ] as const
            ).map(([k, label, list]) => (
              <form
                key={k}
                className="ptc-bulk-field"
                onSubmit={(e) => {
                  e.preventDefault();
                  applyBulk(k);
                }}
              >
                <input value={bulk[k]} placeholder={label} aria-label={label} list={list} onChange={(e) => setBulk({ ...bulk, [k]: e.target.value })} />
                <button className="btn sm">{t.apply}</button>
              </form>
            ))}
            <form
              className="ptc-bulk-field"
              onSubmit={(e) => {
                e.preventDefault();
                setS((x) => ({ ...x, rows: repatch(x.rows, sel, x.types, Number(bulk.u) || 1, Number(bulk.a) || 1) }));
              }}
            >
              <span className="small">{t.repatch}</span>
              <input className="ptc-num" type="number" min={1} max={32768} value={bulk.u} aria-label={t.cols.u} onChange={(e) => setBulk({ ...bulk, u: e.target.value })} />
              <span>/</span>
              <input className="ptc-num" type="number" min={1} max={512} value={bulk.a} aria-label={t.cols.a} onChange={(e) => setBulk({ ...bulk, a: e.target.value })} />
              <button className="btn sm">{t.repatchGo}</button>
            </form>
            <button type="button" className="btn sm" disabled={busy} onClick={() => pdf(() => stickersPdf(s, chosen, paperText), `${base} - Stickers (${chosen.length}).pdf`)}>
              🖨 {t.stickersSel}
            </button>
            <button
              type="button"
              className="link small ptc-bad"
              onClick={() => {
                setRows((r) => r.filter((x) => !sel.has(x.key)));
                setSel(new Set());
              }}
            >
              {t.delete}
            </button>
            <datalist id="ptc-bulk-modes">
              {[...new Set(chosen.flatMap((r) => modesFor(r).map((m) => m.name)))].map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
        )}
        {ask && !signedIn && <AccountNeeded />}

        <datalist id="ptc-pos-list">
          {positions.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <datalist id="ptc-type-list">
          {typeNames.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <datalist id="ptc-color-list">
          {COLOR_NAMES.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>

        {s.rows.length ? (
          <div className="lab-grid ptc-grid">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label={t.selectAll}
                      checked={allSel}
                      onChange={() => setSel(allSel ? new Set() : new Set(shown.map((r) => r.key)))}
                    />
                  </th>
                  {FIELDS.map((k) => (
                    <th key={k} className={`ptc-c-${k}`}>
                      {t.cols[k]}
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, 1500).map((r) => {
                  const bad = clash.get(r.key);
                  const foot = footOf(r, s.types);
                  const modes = modesFor(r);
                  return (
                    <tr key={r.key} className={sel.has(r.key) ? "on" : undefined}>
                      <td>
                        <input type="checkbox" checked={sel.has(r.key)} aria-label={r.fid} onChange={() => toggle(r.key)} />
                      </td>
                      {FIELDS.map((k) => {
                        const common = { value: r[k], "aria-label": `${t.cols[k]} ${r.fid}`, onChange: (e: React.ChangeEvent<HTMLInputElement>) => edit(r.key, k, e.target.value) };
                        if (k === "mode")
                          return (
                            <td key={k} className="ptc-c-mode">
                              <input {...common} list={modes.length ? `ptc-m-${r.key}` : undefined} />
                              {modes.length > 0 && (
                                <datalist id={`ptc-m-${r.key}`}>
                                  {modes.map((m) => (
                                    <option key={m.name} value={m.name}>
                                      {m.foot}ch
                                    </option>
                                  ))}
                                </datalist>
                              )}
                            </td>
                          );
                        if (k === "color") {
                          const hex = colorHex(r.color);
                          return (
                            <td key={k} className="ptc-c-color" title={t.colorHint}>
                              <span className="ptc-swatch" style={{ background: hex ?? "transparent" }} />
                              <input {...common} list="ptc-color-list" />
                            </td>
                          );
                        }
                        if (k === "u" || k === "a")
                          return (
                            <td key={k} className={`ptc-c-${k}${bad ? " ptc-clash" : ""}`} title={bad ? (bad === "> 512" ? t.over512 : fmt(t.conflictWith, { id: bad })) : undefined}>
                              <input {...common} inputMode="numeric" />
                            </td>
                          );
                        if (k === "foot")
                          return (
                            <td key={k} className="ptc-c-foot">
                              <input {...common} inputMode="numeric" placeholder={foot ? String(foot) : ""} />
                            </td>
                          );
                        return (
                          <td key={k} className={`ptc-c-${k}`}>
                            <input {...common} list={k === "pos" ? "ptc-pos-list" : k === "type" ? "ptc-type-list" : undefined} />
                          </td>
                        );
                      })}
                      <td>
                        <button type="button" className="link small" aria-label={t.delete} onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">{t.empty}</p>
        )}
        <div className="inv-actions">
          <button type="button" className="btn sm" onClick={() => setRows((r) => [...r, blankRow()])}>
            {t.addRow}
          </button>
          {s.rows.length > 0 && (
            <button
              type="button"
              className="link small"
              onClick={() => {
                if (window.confirm(t.clearAsk)) {
                  set({ rows: [] });
                  setSel(new Set());
                }
              }}
            >
              {t.clear}
            </button>
          )}
        </div>
      </section>

      <section className="auth-form ptc-print">
        <h2>{t.print}</h2>
        <div className="ptc-print-cols">
          <div className="ptc-print-col">
            <h3>{t.report}</h3>
            <label className="field">
              <span>{t.show}</span>
              <input value={s.show} maxLength={60} placeholder={t.showPh} onChange={(e) => set({ show: e.target.value })} />
            </label>
            <label className="field">
              <span>{t.job}</span>
              <input value={s.job} maxLength={90} placeholder={t.jobPh} onChange={(e) => set({ job: e.target.value })} />
            </label>
            <div className="pat-two">
              <label className="field">
                <span>{t.by}</span>
                <input value={s.by} maxLength={60} onChange={(e) => set({ by: e.target.value })} />
              </label>
              <label className="field">
                <span>{t.rev}</span>
                <input value={s.rev} maxLength={20} placeholder="V1.0" onChange={(e) => set({ rev: e.target.value })} />
              </label>
            </div>
            <label className="field">
              <span>{t.page}</span>
              <select value={s.page} onChange={(e) => set({ page: e.target.value as Settings["page"] })}>
                <option value="a4">{t.a4}</option>
                <option value="letter">{t.letter}</option>
              </select>
            </label>
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
                  {/* eslint-disable-next-line @next/next/no-img-element -- an uploaded logo */}
                  <img src={s.logo} alt="" className="ptc-logo" />
                  <button type="button" className="link small" onClick={() => set({ logo: null })}>
                    {t.remove}
                  </button>
                </>
              )}
            </div>
            <button type="button" className="btn primary" disabled={!s.rows.length || busy} onClick={() => pdf(() => patchReportPdf(s), `${base} - Address Patch By Fixture.pdf`)}>
              🖨 {t.report}
            </button>
          </div>

          <div className="ptc-print-col">
            <h3>{t.stickers}</h3>
            <label className="field">
              <span>{t.sheet}</span>
              <select value={s.sheetId} onChange={(e) => set({ sheetId: e.target.value })}>
                {STICKER_SHEETS.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="pat-check">
              <input type="checkbox" checked={s.pad} onChange={(e) => set({ pad: e.target.checked })} />
              {t.pad}
            </label>
            <label className="pat-check">
              <input type="checkbox" checked={s.fill} onChange={(e) => set({ fill: e.target.checked })} />
              {t.fill}
            </label>
            <p className="muted small">{t.stickersNote}</p>
            <div className="pat-two">
              <label className="field">
                <span>{t.offX}</span>
                <input type="number" step={1} min={-72} max={72} value={s.offX} onChange={(e) => set({ offX: Math.max(-72, Math.min(72, Number(e.target.value) || 0)) })} />
              </label>
              <label className="field">
                <span>{t.offY}</span>
                <input type="number" step={1} min={-72} max={72} value={s.offY} onChange={(e) => set({ offY: Math.max(-72, Math.min(72, Number(e.target.value) || 0)) })} />
              </label>
            </div>
            <p className="muted small">{t.offHint}</p>
            <div className="inv-actions">
              <button type="button" className="btn primary" disabled={!s.rows.length || busy} onClick={() => pdf(() => stickersPdf(s, s.rows, paperText), `${base} - Fixture Stickers.pdf`)}>
                🖨 {t.stickers}
              </button>
              <button type="button" className="btn sm" disabled={busy} onClick={() => pdf(() => alignmentPdf(s, t.alignNote), "Sticker Alignment Test.pdf")}>
                {t.alignment}
              </button>
            </div>
          </div>
        </div>
        {ask && !signedIn && <AccountNeeded />}
        <p className="muted small">
          <Link href="/tools/labels">{t.labelsLink}</Link>
        </p>
      </section>
    </div>
  );
}

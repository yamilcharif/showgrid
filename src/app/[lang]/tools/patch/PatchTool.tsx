"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { AccountNeeded, useSignedIn } from "@/components/AccountGate";
import { useI18n, useT } from "@/components/I18n";
import { ProjectBar, useToolState } from "@/components/Projects";
import { ToolFiles } from "@/components/ToolFiles";
import { fmt, plural } from "@/lib/i18n/config";
import {
  COLOR_NAMES,
  PATCH_START as START,
  blankRow,
  colorHex,
  conflicts,
  footOf,
  readGdtf,
  readPatchFile,
  repatch,
  sortRows,
  typeFor,
  type SortKey,
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

/** A row with another fixture type: a GDTF type brings its mode (the same one if it has it, else its first) and channels. */
function withType(r: PatchRow, v: string, types: FixtureType[]): PatchRow {
  const ft = typeFor(types, v);
  const m = ft?.modes.find((mm) => mm.name === r.mode) ?? ft?.modes[0];
  return { ...r, type: v, mode: m ? m.name : r.mode, foot: m ? String(m.foot) : r.foot };
}
/** A row in another mode: a GDTF mode brings its channels. */
function withMode(r: PatchRow, v: string, types: FixtureType[]): PatchRow {
  const m = typeFor(types, r.type)?.modes.find((mm) => mm.name === v);
  return { ...r, mode: v, foot: m ? String(m.foot) : r.foot };
}
const OTHER = "\u0000other";
/** Columns where a change on one selected fixture goes to every selected one. */
const MULTI: Field[] = ["type", "mode", "pos", "color", "notes", "foot"];

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
  // the column the table was last sorted by, and which way
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  // the row last clicked, for shift-click ranges
  const anchor = useRef<string | null>(null);
  // the right-click menu, where it opened
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  // fixtures a GDTF picked from the menu goes to
  const gdtfFor = useRef<Set<string> | null>(null);
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

  /** Adds GDTF types; given fixtures, the (first) type goes on them too, with its mode and channels. */
  const addGdtf = async (files: FileList | File[], targets?: Set<string> | null) => {
    setBusy(true);
    const added: string[] = [];
    try {
      for (const f of Array.from(files)) {
        const ft = await readGdtf(f).catch(() => null);
        if (!ft) {
          setMsg({ ok: false, text: `${f.name}: ${t.errRead}` });
          continue;
        }
        const on = targets?.size ? targets : null;
        targets = null;
        setS((x) => {
          const types = [...x.types.filter((y) => y.name !== ft.name), ft];
          return { ...x, types, rows: on ? x.rows.map((r) => (on.has(r.key) ? withType(r, ft.name, types) : r)) : x.rows };
        });
        added.push(on ? fmt(t.gdtfApplied, { name: ft.name, n: on.size }) : fmt(t.gdtfAdded, { name: ft.name, n: ft.modes.length }));
      }
      if (added.length) setMsg({ ok: true, text: added.join(" ") });
    } finally {
      setBusy(false);
    }
  };

  // ---------- editing ----------

  /** A cell change; on a selected fixture (with others selected) it goes to all of them, like a spreadsheet. */
  const edit = (key: string, k: Field, v: string) =>
    setS((x) => {
      const on = sel.has(key) && sel.size > 1 && MULTI.includes(k) ? sel : new Set([key]);
      // a position's color is the same on all its fixtures
      if (k === "color") {
        const poss = new Set(x.rows.filter((r) => on.has(r.key)).map((r) => r.pos).filter(Boolean));
        return { ...x, rows: x.rows.map((r) => (on.has(r.key) || (r.pos && poss.has(r.pos)) ? { ...r, color: v } : r)) };
      }
      const change = (r: PatchRow) => (k === "type" ? withType(r, v, x.types) : k === "mode" ? withMode(r, v, x.types) : { ...r, [k]: v });
      return { ...x, rows: x.rows.map((r) => (on.has(r.key) ? change(r) : r)) };
    });
  /** Changes the chosen fixtures (all selected) with one function. */
  const changeChosen = (f: (r: PatchRow, types: FixtureType[]) => PatchRow) => setS((x) => ({ ...x, rows: x.rows.map((r) => (sel.has(r.key) ? f(r, x.types) : r)) }));

  const applyBulk = (k: "pos" | "color" | "type" | "mode") => {
    const v = bulk[k].trim();
    setS((x) => {
      const color = k === "color" ? new Set(x.rows.filter((r) => sel.has(r.key)).map((r) => r.pos).filter(Boolean)) : null;
      return {
        ...x,
        rows: x.rows.map((r) => {
          if (color) return sel.has(r.key) || (r.pos && color.has(r.pos)) ? { ...r, color: v } : r;
          if (!sel.has(r.key)) return r;
          if (k === "mode") return withMode(r, v, x.types);
          if (k === "type") return withType(r, v, x.types);
          return { ...r, [k]: v };
        }),
      };
    });
  };

  /** Selects or unselects fixtures; the first ones chosen set where a re-patch starts (their own patch). */
  const choose = (keys: string[], on: boolean, base: Set<string> = sel) => {
    const n = new Set(base);
    for (const k of keys) {
      if (on) n.add(k);
      else n.delete(k);
    }
    // a re-patch starts where the lowest of the chosen fixtures is patched now
    const low = s.rows
      .filter((r) => n.has(r.key) && Number(r.u) > 0 && Number(r.a) > 0)
      .sort((x, y) => (Number(x.u) - Number(y.u)) * 512 + Number(x.a) - Number(y.a))[0];
    if (low) setBulk((b) => ({ ...b, u: low.u, a: low.a }));
    setSel(n);
  };
  /** A click on a row's box; with Shift, every row between it and the last one clicked. */
  const toggle = (key: string, shift: boolean) => {
    const on = !sel.has(key);
    const from = anchor.current ? shown.findIndex((r) => r.key === anchor.current) : -1;
    const to = shown.findIndex((r) => r.key === key);
    anchor.current = key;
    if (shift && from >= 0 && to >= 0) {
      const [a, b] = from < to ? [from, to] : [to, from];
      return choose(shown.slice(a, b + 1).map((r) => r.key), true);
    }
    choose([key], on);
  };
  /** Shift+click or Cmd/Ctrl+click anywhere on a row selects, without starting to edit the cell. */
  const rowDown = (e: React.MouseEvent, key: string) => {
    if (e.button !== 0 || !(e.shiftKey || e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    toggle(key, e.shiftKey);
  };
  /** Right click: the menu, for the selection (or just this fixture when it isn't selected). */
  const rowMenu = (e: React.MouseEvent, key: string) => {
    e.preventDefault();
    if (!sel.has(key)) {
      anchor.current = key;
      choose([key], true, new Set());
    }
    setMenu({ x: Math.min(e.clientX, window.innerWidth - 300), y: Math.min(e.clientY, window.innerHeight - 380) });
  };
  useEffect(() => {
    if (!menu) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    const away = () => setMenu(null);
    window.addEventListener("keydown", close);
    window.addEventListener("scroll", away, true);
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("scroll", away, true);
    };
  }, [menu]);

  /** Files dropped on the table: a GDTF on a fixture becomes its type (or the selection's); a patch file loads. */
  const drop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    const key = (e.target as HTMLElement).closest("tr[data-key]")?.getAttribute("data-key");
    const targets = key ? (sel.has(key) ? new Set(sel) : new Set([key])) : null;
    const gdtf = files.filter((f) => /\.gdtf$/i.test(f.name));
    if (gdtf.length) addGdtf(gdtf, targets);
    const other = files.find((f) => !/\.gdtf$/i.test(f.name));
    if (other) load(other);
  };
  /** Click a column's name: sorted up; click again: down. Rows stay in their console groups. */
  const sortBy = (key: SortKey) => {
    const dir: 1 | -1 = sort?.key === key && sort.dir === 1 ? -1 : 1;
    setSort({ key, dir });
    setS((x) => ({ ...x, rows: sortRows(x.rows, key, dir, x.types) }));
  };
  const grouped = s.rows.some((r) => r.group);
  const noFoot = chosen.filter((r) => !footOf(r, s.types)).length;
  /** "Other…" in a list: type a value that isn't in the GDTF. */
  const pickOr = (v: string, then: (v: string) => void, label: string) => {
    if (v !== OTHER) return then(v);
    const typed = window.prompt(label);
    if (typed != null && typed.trim()) then(typed.trim());
  };

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
  // the modes the chosen fixtures' GDTF types have (each once)
  const bulkModes = [...new Map(chosen.flatMap((r) => modesFor(r)).map((m) => [m.name, m])).values()];
  const allSel = shown.length > 0 && shown.every((r) => sel.has(r.key));
  // the menu's modes, per fixture type among the chosen ones
  const menuTypes = [...new Set(chosen.map((r) => r.type))].map((type) => ({ type, ft: typeFor(s.types, type), n: chosen.filter((r) => r.type === type).length }));

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
            const on = gdtfFor.current;
            gdtfFor.current = null;
            if (f?.length) addGdtf(f, on).finally(() => (e.target.value = ""));
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

      <section
        className={`auth-form ptc-table${dragging ? " ptc-drop" : ""}`}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
        }}
        onDrop={drop}
      >
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
          </div>
        </div>
        {s.rows.length > 0 && <p className="muted small ptc-tip">{t.tableHint}</p>}

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
                {(k === "type" && s.types.length > 0) || (k === "mode" && bulkModes.length > 0) ? (
                  <select value={bulk[k]} aria-label={label} onChange={(e) => setBulk({ ...bulk, [k]: e.target.value })}>
                    <option value="">{label}…</option>
                    {k === "type"
                      ? s.types.map((ft) => (
                          <option key={ft.name} value={ft.name}>
                            {ft.maker ? `${ft.maker} · ` : ""}
                            {ft.name}
                          </option>
                        ))
                      : bulkModes.map((m) => (
                          <option key={m.name} value={m.name}>
                            {m.name} · {m.foot}ch
                          </option>
                        ))}
                  </select>
                ) : (
                  <input value={bulk[k]} placeholder={label} aria-label={label} list={list} onChange={(e) => setBulk({ ...bulk, [k]: e.target.value })} />
                )}
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
            {noFoot > 0 && <span className="small ptc-bad">{plural(noFoot, t.noFoot)}</span>}
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
                      onChange={() => choose(shown.map((r) => r.key), !allSel)}
                    />
                  </th>
                  {FIELDS.map((k) => (
                    <th key={k} className={`ptc-c-${k}`} aria-sort={sort?.key === k ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
                      <button type="button" className="ptc-sort" title={t.sortHint} onClick={() => sortBy(k)}>
                        {t.cols[k]}
                        <span aria-hidden="true">{sort?.key === k ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</span>
                      </button>
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, 1500).map((r, i) => {
                  const bad = clash.get(r.key);
                  const foot = footOf(r, s.types);
                  const modes = modesFor(r);
                  // the console's folder, with its color, above its first fixture
                  const newGroup = grouped && (i === 0 || (shown[i - 1].group ?? "") !== (r.group ?? ""));
                  const members = newGroup ? shown.filter((x) => (x.group ?? "") === (r.group ?? "")) : [];
                  const allIn = members.length > 0 && members.every((x) => sel.has(x.key));
                  return (
                    <Fragment key={r.key}>
                      {newGroup && (
                        <tr className="ptc-group" style={{ ["--g" as string]: r.gcolor || "var(--line)" }}>
                          <td>
                            <input type="checkbox" checked={allIn} aria-label={fmt(t.selectGroup, { g: r.group || t.noGroup })} onChange={() => choose(members.map((x) => x.key), !allIn)} />
                          </td>
                          <td colSpan={FIELDS.length + 1}>
                            <strong>{r.group || t.noGroup}</strong> <span className="muted small">· {plural(members.length, t.fixtures)}</span>
                          </td>
                        </tr>
                      )}
                    <tr
                      data-key={r.key}
                      className={sel.has(r.key) ? "on" : undefined}
                      style={r.gcolor ? { ["--g" as string]: r.gcolor } : undefined}
                      onMouseDown={(e) => rowDown(e, r.key)}
                      onContextMenu={(e) => rowMenu(e, r.key)}
                    >
                      <td className={r.gcolor ? "ptc-gbar" : undefined}>
                        <input type="checkbox" checked={sel.has(r.key)} aria-label={r.fid} onChange={() => {}} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => toggle(r.key, e.shiftKey)} />
                      </td>
                      {FIELDS.map((k) => {
                        const common = { value: r[k], "aria-label": `${t.cols[k]} ${r.fid}`, onChange: (e: React.ChangeEvent<HTMLInputElement>) => edit(r.key, k, e.target.value) };
                        if (k === "mode" && modes.length)
                          return (
                            <td key={k} className="ptc-c-mode">
                              <select value={r.mode} aria-label={common["aria-label"]} onChange={(e) => pickOr(e.target.value, (v) => edit(r.key, "mode", v), t.cols.mode)}>
                                {!modes.some((m) => m.name === r.mode) && <option value={r.mode}>{r.mode || "—"}</option>}
                                {modes.map((m) => (
                                  <option key={m.name} value={m.name}>
                                    {m.name} · {m.foot}ch
                                  </option>
                                ))}
                                <option value={OTHER}>{t.other}</option>
                              </select>
                            </td>
                          );
                        if (k === "type" && s.types.length)
                          return (
                            <td key={k} className="ptc-c-type">
                              <select value={r.type} aria-label={common["aria-label"]} onChange={(e) => pickOr(e.target.value, (v) => edit(r.key, "type", v), t.cols.type)}>
                                {!s.types.some((ft) => ft.name === r.type) && <option value={r.type}>{r.type || "—"}</option>}
                                {s.types.map((ft) => (
                                  <option key={ft.name} value={ft.name}>
                                    {ft.maker ? `${ft.maker} · ` : ""}
                                    {ft.name}
                                  </option>
                                ))}
                                <option value={OTHER}>{t.other}</option>
                              </select>
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
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted ptc-empty">{t.empty} {t.dropEmpty}</p>
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

      {menu && chosen.length > 0 && (
        <div
          className="ptc-menu-back"
          onMouseDown={() => setMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu(null);
          }}
        >
          <div className="ptc-menu" role="menu" style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()}>
            <strong className="small">{plural(chosen.length, t.fixtures)}</strong>
            <form
              className="ptc-menu-patch"
              onSubmit={(e) => {
                e.preventDefault();
                setS((x) => ({ ...x, rows: repatch(x.rows, sel, x.types, Number(bulk.u) || 1, Number(bulk.a) || 1) }));
                setMenu(null);
              }}
            >
              <span className="small">{t.menuPatch}</span>
              <input className="ptc-num" type="number" min={1} max={32768} value={bulk.u} aria-label={t.cols.u} autoFocus onChange={(e) => setBulk({ ...bulk, u: e.target.value })} />
              <span>.</span>
              <input className="ptc-num" type="number" min={1} max={512} value={bulk.a} aria-label={t.cols.a} onChange={(e) => setBulk({ ...bulk, a: e.target.value })} />
              <button className="btn sm primary">{t.repatchGo}</button>
            </form>
            {noFoot > 0 && <span className="small ptc-bad">{plural(noFoot, t.noFoot)}</span>}
            {menuTypes.map(({ type, ft, n }) => (
              <div key={type} className="ptc-menu-sec">
                <span className="muted small">
                  {t.menuModes} · {type || "—"}
                  {menuTypes.length > 1 ? ` (${n})` : ""}
                </span>
                {ft?.modes.length ? (
                  ft.modes.map((m) => {
                    const on = chosen.filter((r) => r.type === type).every((r) => r.mode === m.name);
                    return (
                      <button
                        key={m.name}
                        type="button"
                        role="menuitem"
                        className={`ptc-menu-item${on ? " on" : ""}`}
                        onClick={() => {
                          changeChosen((r, types) => (r.type === type ? withMode(r, m.name, types) : r));
                          setMenu(null);
                        }}
                      >
                        {m.name} <span className="muted">{m.foot}ch</span>
                      </button>
                    );
                  })
                ) : (
                  <span className="small muted">
                    {fmt(t.menuNoGdtf, { type: type || "—" })}{" "}
                    <button
                      type="button"
                      className="link small"
                      onClick={() => {
                        gdtfFor.current = new Set(chosen.filter((r) => r.type === type).map((r) => r.key));
                        setMenu(null);
                        gdtfRef.current?.click();
                      }}
                    >
                      {t.menuAddGdtf}
                    </button>
                  </span>
                )}
              </div>
            ))}
            {s.types.length > 0 && (
              <div className="ptc-menu-sec">
                <span className="muted small">{t.menuType}</span>
                {s.types.map((ft) => (
                  <button
                    key={ft.name}
                    type="button"
                    role="menuitem"
                    className="ptc-menu-item"
                    onClick={() => {
                      changeChosen((r, types) => withType(r, ft.name, types));
                      setMenu(null);
                    }}
                  >
                    {ft.maker ? `${ft.maker} · ` : ""}
                    {ft.name}
                  </button>
                ))}
              </div>
            )}
            <div className="ptc-menu-sec">
              <button
                type="button"
                role="menuitem"
                className="ptc-menu-item"
                onClick={() => {
                  setMenu(null);
                  pdf(() => stickersPdf(s, chosen, paperText), `${base} - Stickers (${chosen.length}).pdf`);
                }}
              >
                🖨 {t.stickersSel}
              </button>
              <button
                type="button"
                role="menuitem"
                className="ptc-menu-item ptc-bad"
                onClick={() => {
                  setRows((r) => r.filter((x) => !sel.has(x.key)));
                  setSel(new Set());
                  setMenu(null);
                }}
              >
                {t.delete}
              </button>
            </div>
          </div>
        </div>
      )}

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
            {grouped && (
              <label className="field">
                <span>{t.reportBy}</span>
                <select value={s.reportBy ?? "type"} onChange={(e) => set({ reportBy: e.target.value as Settings["reportBy"] })}>
                  <option value="type">{t.reportByType}</option>
                  <option value="group">{t.reportByGroup}</option>
                </select>
              </label>
            )}
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

"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccountNeeded, useSignedIn } from "@/components/AccountGate";
import { useT } from "@/components/I18n";
import { shrinkImage } from "@/lib/image";
import { ProjectBar, useToolState } from "@/components/Projects";
import { ToolFiles } from "@/components/ToolFiles";
import { useI18n } from "@/components/I18n";
import { fmt, plural } from "@/lib/i18n/config";
import {
  CASE_COLORS,
  CASE_PRESETS,
  TRUCKS,
  fmtLen,
  fmtWeight,
  footprint,
  GROUP_PRESETS,
  barLoss,
  tooHigh,
  restingZ,
  settle,
  snap,
  stats,
  type CaseType,
  type Placed,
  caseNumbers,
  type TruckPlan as Saved,
} from "@/lib/truck";
import { GroupTable } from "./GroupTable";
import { TruckPrint, type PrintMode } from "./TruckPrint";

// three.js is only loaded in the browser, and only on this page
const Truck3D = dynamic(() => import("./Truck3D").then((m) => m.Truck3D), { ssr: false });

const STORE_KEY = "sg_truck";
const CAB = 64;
const PAD = 14;


const uid = () => Math.random().toString(36).slice(2, 10);

const START: Saved = {
  truck: TRUCKS[2],
  types: CASE_PRESETS.slice(0, 3).map((p, i) => ({ ...p, id: uid(), qty: [8, 1, 6][i], color: CASE_COLORS[i] })),
  placed: [],
  metric: false,
};

interface Drag {
  /** moving a case already in the truck; null when it comes from the list */
  uid: string | null;
  type: string;
  rot: boolean;
  tilt: 0 | 90 | 180;
  /** where in the case it was grabbed, in inches */
  gx: number;
  gy: number;
  x: number;
  y: number;
  over: boolean;
}

export function TruckPlanner() {
  const t = useT().truck;
  const { t: T, locale } = useI18n();
  const tf = T.files;
  // kept in the open project, or on this device
  const { state, setState, project, saving } = useToolState("truck", STORE_KEY, START, (v) => {
    const saved = v as Saved;
    return saved?.truck && Array.isArray(saved.types) && Array.isArray(saved.placed) ? saved : START;
  });
  const [sel, setSel] = useState<string | null>(null);
  const [drag, setDragState] = useState<Drag | null>(null);
  const [printing, setPrinting] = useState<{ mode: PrintMode; shot: string | null } | null>(null);
  // using the planner is open to everyone; printing needs an account
  const signedIn = useSignedIn();
  const [askAccount, setAskAccount] = useState(false);
  const print = (mode: PrintMode) => {
    if (!signedIn) return setAskAccount(true);
    setPrinting({ mode, shot: mode === "plan" ? (shotRef.current?.() ?? null) : null });
  };
  const shotRef = useRef<(() => string | null) | null>(null);
  // the pointer handlers read the drag from here, so a drop is handled once
  const dragRef = useRef<Drag | null>(null);
  const setDrag = useCallback((d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  }, []);
  const svgRef = useRef<SVGSVGElement>(null);
  const { truck, types, placed, metric } = state;
  const fromDoors = state.fromDoors ?? true;
  const typeMap = useMemo(() => new Map(types.map((ty) => [ty.id, ty])), [types]);

  // print what was asked for, then put the page back
  useEffect(() => {
    if (!printing) return;
    document.body.dataset.print = printing.mode;
    const done = () => setPrinting(null);
    window.addEventListener("afterprint", done);
    const id = setTimeout(() => window.print(), 150);
    return () => {
      clearTimeout(id);
      window.removeEventListener("afterprint", done);
      delete document.body.dataset.print;
    };
  }, [printing]);


  const update = useCallback((fn: (s: Saved) => Saved) => setState((s) => {
    const next = fn(s);
    const map = new Map(next.types.map((ty) => [ty.id, ty]));
    return { ...next, placed: settle(next.placed.filter((p) => map.has(p.type)), map) };
  }), [setState]);

  const len = (n: number) => fmtLen(n, metric);
  // inputs show inches or centimetres; the plan is kept in inches
  const toShown = (n: number) => (metric ? Math.round(n * 2.54) : Math.round(n));
  const toShownWt = (lb: number | undefined) => (lb ? (metric ? Math.round(lb * 0.4536) : Math.round(lb)) : "");
  const fromShownWt = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.min(100000, metric ? n / 0.4536 : n) : 0;
  };
  const fromShown = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.min(2000, metric ? n / 2.54 : n) : 1;
  };

  // ---------- dragging ----------

  const toTruck = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: pt.x - CAB, y: pt.y };
  };

  const startDrag = (e: React.PointerEvent, d: Omit<Drag, "x" | "y" | "over">) => {
    e.preventDefault();
    const p = toTruck(e);
    setSel(d.uid);
    setDrag({ ...d, x: p ? p.x - d.gx : -9999, y: p ? p.y - d.gy : -9999, over: false });
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      const p = toTruck(e);
      if (!d || !p) return;
      const over = p.x > -CAB * 0.3 && p.x < truck.l + 20 && p.y > -20 && p.y < truck.w + 20;
      setDrag({ ...d, x: p.x - d.gx, y: p.y - d.gy, over });
    };
    const up = () => {
      const d = dragRef.current;
      setDrag(null);
      const ty = d && typeMap.get(d.type);
      if (!d || !ty) return;
      if (!d.over) {
        // dropped off the truck: back to the list
        if (d.uid) update((s) => ({ ...s, placed: s.placed.filter((p) => p.uid !== d.uid) }));
        setSel(null);
        return;
      }
      const f = footprint({ uid: "", type: d.type, x: d.x, y: d.y, z: 0, rot: d.rot, tilt: d.tilt }, ty);
      const at = snap(f, truck, placed, typeMap, d.uid ?? undefined);
      const id = d.uid ?? uid();
      // a high z settles it on top of whatever is under it
      const next: Placed = { uid: id, type: d.type, x: at.x, y: at.y, z: 1e6, rot: d.rot, tilt: d.tilt };
      update((s) => ({ ...s, placed: [...s.placed.filter((p) => p.uid !== id), next] }));
      setSel(id);
    };
    const key = (e: KeyboardEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (e.key === "r" || e.key === "R") setDrag({ ...d, rot: !d.rot, gx: d.gy, gy: d.gx });
      if (e.key === "Escape") setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key);
    };
    // the listeners only need re-binding when a drag starts or ends, or the plan changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null, truck, placed, typeMap, update, setDrag]);

  const rotate = useCallback(
    (id: string) =>
      update((s) => {
        const p = s.placed.find((x) => x.uid === id);
        const ty = p && s.types.find((x) => x.id === p.type);
        if (!p || !ty) return s;
        const f = footprint({ ...p, rot: !p.rot }, ty);
        const map = new Map(s.types.map((x) => [x.id, x]));
        const at = snap(f, s.truck, s.placed, map, id, 0);
        return { ...s, placed: s.placed.map((x) => (x.uid === id ? { ...x, rot: !x.rot, x: at.x, y: at.y, z: 1e6 } : x)) };
      }),
    [update],
  );
  /** Tips a case: 0° on its wheels, 90° standing on its end, 180° upside down. */
  const tilt = useCallback(
    (id: string, deg: 0 | 90 | 180) =>
      update((s) => {
        const p = s.placed.find((x) => x.uid === id);
        const ty = p && s.types.find((x) => x.id === p.type);
        if (!p || !ty) return s;
        const f = footprint({ ...p, tilt: deg }, ty);
        const map = new Map(s.types.map((x) => [x.id, x]));
        const at = snap(f, s.truck, s.placed, map, id, 0);
        return { ...s, placed: s.placed.map((x) => (x.uid === id ? { ...x, tilt: deg, x: at.x, y: at.y, z: 1e6 } : x)) };
      }),
    [update],
  );
  const unload = useCallback((id: string) => {
    update((s) => ({ ...s, placed: s.placed.filter((p) => p.uid !== id) }));
    setSel(null);
  }, [update]);

  // keyboard on the selected case
  useEffect(() => {
    if (!sel || drag) return;
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === "r" || e.key === "R") rotate(sel);
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        unload(sel);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [sel, drag, rotate, unload]);

  // ---------- derived ----------

  const shown = drag?.uid ? placed.filter((p) => p.uid !== drag.uid) : placed;
  const left = types.map((ty) => ({ ty, n: Math.max(0, ty.qty - placed.filter((p) => p.type === ty.id).length) }));
  const st = stats(truck, placed, typeMap);
  const ghost = (() => {
    if (!drag) return null;
    const ty = typeMap.get(drag.type);
    if (!ty) return null;
    const f = footprint({ uid: "", type: drag.type, x: drag.x, y: drag.y, z: 0, rot: drag.rot, tilt: drag.tilt }, ty);
    const at = drag.over ? snap(f, truck, shown, typeMap, drag.uid ?? undefined) : { x: f.x, y: f.y };
    const z = drag.over ? restingZ({ ...f, ...at }, shown, typeMap, drag.uid ?? undefined) : 0;
    return { ...f, ...at, z, ty, tall: tooHigh({ ...f, ...at }, z, truck) };
  })();
  const boxes3d = useMemo(
    () =>
      placed.map((p) => {
        const ty = typeMap.get(p.type)!;
        const f = footprint(p, ty);
        return { id: p.uid, ...f, z: p.z, color: ty.color, bad: tooHigh(f, p.z, truck), sel: p.uid === sel };
      }),
    [placed, typeMap, truck, sel],
  );

  const vbW = CAB + truck.l + PAD;
  const vbH = truck.w;
  const selCase = sel ? placed.find((p) => p.uid === sel) : null;
  const sorted = [...shown].sort((a, b) => a.z - b.z);
  const nums = caseNumbers(placed, typeMap, fromDoors);

  return (
    <div className="truck-tool">
      <ProjectBar project={project} saving={saving} />
      <ToolFiles
        tool="truck"
        name={`${project?.name ?? t.planTitle} · ${truck.key === "custom" ? Math.round(truck.l / 12) : truck.key}'`}
        data={state}
        onOpen={(v) => {
          const saved = v as Saved;
          if (saved?.truck && Array.isArray(saved.types) && Array.isArray(saved.placed)) update(() => saved);
        }}
        downloadLabel={tf.truckPdf}
        download={
          placed.length
            ? async () => {
                // the plan and the case labels, together
                const [{ truckPlanPdf, truckLabelsPdf, safeName }, { zipSync }] = await Promise.all([import("@/lib/projectExport"), import("fflate")]);
                const date = new Date().toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
                const base = safeName(`${project?.name ?? t.planTitle} ${truck.key}'`);
                const zip = zipSync({
                  [`${base} - plan.pdf`]: new Uint8Array(await truckPlanPdf(state, t, date)),
                  [`${base} - case labels.pdf`]: new Uint8Array(await truckLabelsPdf(state, t)),
                });
                return { blob: new Blob([zip as BlobPart], { type: "application/zip" }), name: `${base}.zip` };
              }
            : undefined
        }
      />
      <aside className="auth-form truck-side">
        <div className="field">
          <label htmlFor="truckSize">{t.truck}</label>
          <div className="seg" role="radiogroup" id="truckSize">
            {TRUCKS.map((tr) => (
              <button
                key={tr.key}
                type="button"
                role="radio"
                aria-checked={truck.key === tr.key}
                className={truck.key === tr.key ? "on" : undefined}
                onClick={() => update((s) => ({ ...s, truck: tr }))}
              >
                {tr.key}&apos;
              </button>
            ))}
          </div>
        </div>
        <div className="truck-dims">
          {(["l", "w", "h"] as const).map((k) => (
            <label key={k} className="field">
              <span>{k === "l" ? t.length : k === "w" ? t.width : t.height}</span>
              <input
                type="number"
                min={1}
                value={toShown(truck[k])}
                onChange={(e) => update((s) => ({ ...s, truck: { ...s.truck, key: "custom", [k]: fromShown(e.target.value) } }))}
              />
            </label>
          ))}
          <label className="field">
            <span>{t.units}</span>
            <select value={metric ? "cm" : "in"} onChange={(e) => update((s) => ({ ...s, metric: e.target.value === "cm" }))}>
              <option value="in">in</option>
              <option value="cm">cm</option>
            </select>
          </label>
          <label className="field truck-payload">
            <span>
              {t.payload} ({metric ? "kg" : "lb"})
            </span>
            <input
              type="number"
              min={0}
              value={toShownWt(truck.payload)}
              onChange={(e) => update((s) => ({ ...s, truck: { ...s.truck, payload: fromShownWt(e.target.value) } }))}
            />
          </label>
        </div>
        <label className="pat-check">
          <input
            type="checkbox"
            checked={!!truck.bar}
            onChange={(e) => update((s) => ({ ...s, truck: { ...s.truck, bar: e.target.checked ? { clear: Math.round(s.truck.h * 0.85), from: 0, depth: 12 } : null } }))}
          />
          {t.lowBar}
        </label>
        {truck.bar && (
          <div className="truck-dims truck-bar">
            {(
              [
                ["clear", t.barClear],
                ["from", t.barFrom],
                ["depth", t.barDepth],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="field">
                <span>{label}</span>
                <input
                  type="number"
                  min={0}
                  value={toShown(truck.bar![k])}
                  onChange={(e) => update((s) => ({ ...s, truck: { ...s.truck, bar: { ...s.truck.bar!, [k]: k === "depth" || k === "clear" ? fromShown(e.target.value) : Math.max(0, Number(e.target.value) ? fromShown(e.target.value) : 0) } } }))}
                />
              </label>
            ))}
            <p className="muted small">{fmt(t.barLost, { v: metric ? `${(barLoss(truck) * 1.6387e-5).toFixed(2)} m³` : `${Math.round(barLoss(truck) / 1728)} ft³` })}</p>
          </div>
        )}
        <p className="muted small">
          {t.inside}: {len(truck.l)} × {len(truck.w)} × {len(truck.h)}
        </p>

        <div className="field">
          <span>{t.logo}</span>
          <div className="pat-logo">
            {/* eslint-disable-next-line @next/next/no-img-element -- an uploaded logo */}
            {state.logo && <img className="truck-logo-thumb" src={state.logo} alt="" />}
            <label className="btn sm">
              {state.logo ? t.logoChange : t.logoAdd}
              <input
                type="file"
                hidden
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) shrinkImage(f, 800).then((logo) => update((s) => ({ ...s, logo })), () => {});
                }}
              />
            </label>
            {state.logo && (
              <button type="button" className="link small" onClick={() => update((s) => ({ ...s, logo: null }))}>
                {t.logoRemove}
              </button>
            )}
          </div>
          <span className="muted small">{t.logoHint}</span>
        </div>

        <h2>{t.groups}</h2>
        <p className="muted small">{t.groupsHint}</p>
        {(state.groups ?? []).map((g) => (
          <div key={g.id} className="truck-group">
            <input
              type="color"
              className="swatch-pick"
              value={g.color}
              aria-label={t.changeColor}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  groups: (s.groups ?? []).map((x) => (x.id === g.id ? { ...x, color: e.target.value } : x)),
                  // every case in the department takes its color
                  types: s.types.map((x) => (x.group === g.id ? { ...x, color: e.target.value } : x)),
                }))
              }
            />
            <input value={g.name} maxLength={40} aria-label={t.groupName} onChange={(e) => update((s) => ({ ...s, groups: (s.groups ?? []).map((x) => (x.id === g.id ? { ...x, name: e.target.value } : x)) }))} />
            <button
              type="button"
              className="link small"
              onClick={() => update((s) => ({ ...s, groups: (s.groups ?? []).filter((x) => x.id !== g.id), types: s.types.map((x) => (x.group === g.id ? { ...x, group: null } : x)) }))}
            >
              {t.remove}
            </button>
          </div>
        ))}
        <div className="inv-actions">
          <select
            value=""
            aria-label={t.addGroup}
            onChange={(e) => {
              const i = Number(e.target.value);
              if (e.target.value === "") return;
              const name = i >= 0 ? t.groupNames[i] ?? GROUP_PRESETS[i].name : t.newGroup;
              const color = i >= 0 ? GROUP_PRESETS[i].color : CASE_COLORS[(state.groups?.length ?? 0) % CASE_COLORS.length];
              update((s) => ({ ...s, groups: [...(s.groups ?? []), { id: uid(), name, color }] }));
            }}
          >
            <option value="">{t.addGroup}</option>
            {GROUP_PRESETS.map((g, i) => (
              <option key={g.name} value={i} disabled={(state.groups ?? []).some((x) => x.name === (t.groupNames[i] ?? g.name))}>
                {t.groupNames[i] ?? g.name}
              </option>
            ))}
            <option value={-1}>{t.newGroup}</option>
          </select>
        </div>

        <h2>{t.cases}</h2>
        <table className="truck-cases">
          <thead>
            <tr>
              <th />
              <th>{t.caseName}</th>
              <th>{metric ? "L cm" : "L in"}</th>
              <th>{metric ? "W cm" : "W in"}</th>
              <th>{metric ? "H cm" : "H in"}</th>
              <th>{metric ? "kg" : "lb"}</th>
              <th>{t.qty}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {types.map((ty) => {
              const set = (patch: Partial<CaseType>) => update((s) => ({ ...s, types: s.types.map((x) => (x.id === ty.id ? { ...x, ...patch } : x)) }));
              return (
                <tr key={ty.id}>
                  <td>
                    <input type="color" className="swatch-pick" value={ty.color} aria-label={t.changeColor} title={t.changeColor} onChange={(e) => set({ color: e.target.value })} />
                  </td>
                  <td>
                    <input value={ty.name} maxLength={60} aria-label={t.caseName} onChange={(e) => set({ name: e.target.value })} />
                    {(state.groups?.length ?? 0) > 0 && (
                      <select
                        className="case-group"
                        value={ty.group ?? ""}
                        aria-label={t.groupCol}
                        onChange={(e) => {
                          const g = state.groups?.find((x) => x.id === e.target.value);
                          set(g ? { group: g.id, color: g.color } : { group: null });
                        }}
                      >
                        <option value="">{t.groupNone}</option>
                        {state.groups!.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  {(["l", "w", "h"] as const).map((k) => (
                    <td key={k}>
                      <input type="number" min={1} aria-label={k} value={toShown(ty[k])} onChange={(e) => set({ [k]: fromShown(e.target.value) })} />
                    </td>
                  ))}
                  <td>
                    <input type="number" min={0} aria-label={t.weight} value={toShownWt(ty.wt)} onChange={(e) => set({ wt: fromShownWt(e.target.value) })} />
                  </td>
                  <td>
                    <input type="number" min={0} max={500} aria-label={t.qty} value={ty.qty} onChange={(e) => set({ qty: Math.max(0, Math.min(500, Math.round(Number(e.target.value) || 0))) })} />
                  </td>
                  <td>
                    <button type="button" className="link small" onClick={() => update((s) => ({ ...s, types: s.types.filter((x) => x.id !== ty.id) }))}>
                      {t.remove}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="inv-actions">
          <button
            type="button"
            className="btn sm"
            onClick={() => update((s) => ({ ...s, types: [...s.types, { id: uid(), name: t.newCase, l: 48, w: 24, h: 30, qty: 1, color: CASE_COLORS[s.types.length % CASE_COLORS.length] }] }))}
          >
            {t.addCase}
          </button>
          <select
            value=""
            aria-label={t.preset}
            onChange={(e) => {
              const p = CASE_PRESETS[Number(e.target.value)];
              if (p) update((s) => ({ ...s, types: [...s.types, { ...p, id: uid(), qty: 1, color: CASE_COLORS[s.types.length % CASE_COLORS.length] }] }));
            }}
          >
            <option value="">{t.preset}</option>
            {CASE_PRESETS.map((p, i) => (
              <option key={p.name} value={i}>
                {p.name} · {len(p.l)} × {len(p.w)} × {len(p.h)}
              </option>
            ))}
          </select>
        </div>
      </aside>

      <section className="truck-main">
        <div className="truck-stats">
          <div>
            <strong className="num">{Math.round(st.floor * 100)}%</strong>
            {t.floorUsed}
          </div>
          <div>
            <strong className="num">{Math.round(st.volume * 100)}%</strong>
            {t.volUsed}
          </div>
          <div>
            <strong className="num">{len(st.depth)}</strong>
            {t.depth}
          </div>
          <div>
            <strong className="num">
              {fmtWeight(st.weight, metric)}
              {truck.payload ? <small> / {fmtWeight(truck.payload, metric)}</small> : null}
            </strong>
            {st.weight ? fmt(t.split, { f: Math.round(st.frontShare * 100), b: 100 - Math.round(st.frontShare * 100) }) : t.totalWeight}
          </div>
          {st.over > 0 && <div className="bad">{fmt(t.overPayload, { n: fmtWeight(st.over, metric) })}</div>}
          {st.tooTall > 0 && <div className="bad">{plural(st.tooTall, t.tooTall)}</div>}
          <button
            type="button"
            className="link small"
            disabled={!placed.length}
            onClick={() => window.confirm(t.confirmClear) && update((s) => ({ ...s, placed: [] }))}
          >
            {t.clear}
          </button>
        </div>

        {(state.groups?.length ?? 0) > 0 && placed.length > 0 && <GroupTable plan={state} t={t} metric={metric} />}

        <div className="truck-tray" aria-label={t.toLoad}>
          <strong>{t.toLoad}</strong>
          {left.some((x) => x.n) ? (
            left
              .filter((x) => x.n)
              .map(({ ty, n }) => (
                <button
                  key={ty.id}
                  type="button"
                  className="tray-case"
                  style={{ borderColor: ty.color }}
                  onPointerDown={(e) => startDrag(e, { uid: null, type: ty.id, rot: false, tilt: 0, gx: ty.l / 2, gy: ty.w / 2 })}
                >
                  <span className="swatch" style={{ background: ty.color }} />
                  {ty.name} <span className="muted">{fmt(t.left, { n })}</span>
                </button>
              ))
          ) : (
            <span className="muted small">{placed.length ? t.allLoaded : t.toLoadHint}</span>
          )}
        </div>

        {/* turn and tilt, always in sight: they act on the case clicked in the plan */}
        <div className={selCase ? "case-tools on" : "case-tools"}>
          <strong className="small">{selCase ? typeMap.get(selCase.type)?.name : t.pickCase}</strong>
          <button type="button" className="btn sm" disabled={!selCase} onClick={() => selCase && rotate(selCase.uid)} title={t.rotateHint}>
            ⟳ {t.rotate} 90°
          </button>
          <span className="case-tools-lbl small">{t.tilt}</span>
          <span className="seg seg3 tilt-seg" role="radiogroup" aria-label={t.tilt}>
            {([0, 90, 180] as const).map((deg) => (
              <button
                key={deg}
                type="button"
                role="radio"
                disabled={!selCase}
                aria-checked={!!selCase && (selCase.tilt ?? 0) === deg}
                className={selCase && (selCase.tilt ?? 0) === deg ? "on" : undefined}
                title={t.tilts[deg]}
                onClick={() => selCase && tilt(selCase.uid, deg)}
              >
                {deg}°
              </button>
            ))}
          </span>
          <button type="button" className="btn sm" disabled={!selCase} onClick={() => selCase && unload(selCase.uid)}>
            {t.unload}
          </button>
        </div>

        <svg
          ref={svgRef}
          className={drag ? "truck-svg dragging" : "truck-svg"}
          viewBox={`0 ${-PAD} ${vbW} ${vbH + PAD * 2}`}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setSel(null);
          }}
        >
          {/* cab, floor and walls */}
          <rect className="cab" x={6} y={truck.w * 0.08} width={CAB - 10} height={truck.w * 0.84} rx={14} />
          <text className="lbl" x={CAB / 2} y={truck.w / 2} textAnchor="middle" dominantBaseline="middle" transform={`rotate(-90 ${CAB / 2} ${truck.w / 2})`}>
            {t.front}
          </text>
          <rect className="floor" x={CAB} y={0} width={truck.l} height={truck.w} />
          {truck.bar && (
            <g className="lowbar">
              <rect x={CAB + truck.l - truck.bar.from - truck.bar.depth} y={0} width={Math.max(1, truck.bar.depth)} height={truck.w} />
              <text x={CAB + truck.l - truck.bar.from - truck.bar.depth / 2} y={truck.w / 2} textAnchor="middle" dominantBaseline="middle" transform={`rotate(-90 ${CAB + truck.l - truck.bar.from - truck.bar.depth / 2} ${truck.w / 2})`}>
                {t.lowBarShort} {len(truck.bar.clear)}
              </text>
            </g>
          )}
          {Array.from({ length: Math.floor(truck.l / 12) }, (_, i) => (
            <line key={i} className={(i + 1) % 4 ? "ft" : "ft four"} x1={CAB + (i + 1) * 12} x2={CAB + (i + 1) * 12} y1={0} y2={truck.w} />
          ))}
          <text className="lbl" x={CAB + truck.l / 2} y={-4} textAnchor="middle">
            {t.passengerSide}
          </text>
          <text className="lbl" x={CAB + truck.l / 2} y={truck.w + 9} textAnchor="middle">
            {t.driverSide}
          </text>
          <text className="lbl" x={CAB + truck.l + 6} y={truck.w / 2} dominantBaseline="middle" transform={`rotate(90 ${CAB + truck.l + 6} ${truck.w / 2})`} textAnchor="middle">
            {t.doors}
          </text>

          {sorted.map((p) => {
            const ty = typeMap.get(p.type)!;
            const f = footprint(p, ty);
            const tall = tooHigh(f, p.z, truck);
            const level = p.z > 0;
            // the label goes on the top case of a stack only
            const covered = shown.some((o) => {
              if (o.uid === p.uid || o.z <= p.z) return false;
              const g = footprint(o, typeMap.get(o.type)!);
              return g.x < f.x + f.l && f.x < g.x + g.l && g.y < f.y + f.w && f.y < g.y + g.w;
            });
            const height = shown.filter((o) => {
              const g = footprint(o, typeMap.get(o.type)!);
              return g.x < f.x + f.l && f.x < g.x + g.l && g.y < f.y + f.w && f.y < g.y + g.w;
            }).length;
            return (
              <g
                key={p.uid}
                className={`case${p.uid === sel ? " sel" : ""}${tall ? " tall" : ""}${level ? " up" : ""}`}
                onPointerDown={(e) => {
                  const at = toTruck(e);
                  startDrag(e, { uid: p.uid, type: p.type, rot: p.rot, tilt: p.tilt ?? 0, gx: at ? at.x - p.x : f.l / 2, gy: at ? at.y - p.y : f.w / 2 });
                }}
                onDoubleClick={() => rotate(p.uid)}
              >
                <rect x={CAB + f.x} y={f.y} width={f.l} height={f.w} fill={ty.color} />
                {!covered && f.l > 14 && f.w > 8 && (
                  <text x={CAB + f.x + f.l / 2} y={f.y + f.w / 2} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: Math.min(9, f.w / 2.6, f.l / 6) }}>
                    #{nums.get(p.uid)} {level ? `▲${height > 1 ? ` ×${height}` : ""} ${ty.name}` : ty.name}
                  </text>
                )}
              </g>
            );
          })}

          {ghost && (
            <g className={ghost.tall ? "ghost tall" : "ghost"}>
              <rect x={CAB + ghost.x} y={ghost.y} width={ghost.l} height={ghost.w} fill={ghost.ty.color} />
              {ghost.z > 0 && (
                <text x={CAB + ghost.x + ghost.l / 2} y={ghost.y + ghost.w / 2} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: Math.min(9, ghost.w / 2.6) }}>
                  {fmt(t.stackOn, { h: len(ghost.z) })}
                </text>
              )}
            </g>
          )}
        </svg>

        <p className="muted small truck-help">{t.help}</p>

        <div className="truck-print-bar">
          <label className="truck-numbering">
            {t.numbering}
            <select value={fromDoors ? "doors" : "front"} onChange={(e) => update((s) => ({ ...s, fromDoors: e.target.value === "doors" }))}>
              <option value="doors">{t.numberDoors}</option>
              <option value="front">{t.numberFront}</option>
            </select>
          </label>
          <button type="button" className="btn primary" disabled={!placed.length} onClick={() => print("plan")}>
            🖨 {t.printPlan}
          </button>
          <button type="button" className="btn" disabled={!placed.length} onClick={() => print("labels")}>
            🏷 {t.printLabels}
          </button>
          {!placed.length && <span className="muted small">{t.nothingToPrint}</span>}
        </div>
        {askAccount && !signedIn && <AccountNeeded />}

        <h2 className="truck-3d-title">{t.view3d}</h2>
        <Truck3D truck={truck} boxes={boxes3d} hint={t.orbit} reset={t.resetView} shotRef={shotRef} />
        {printing && (
          <TruckPrint mode={printing.mode} truck={truck} placed={placed} types={typeMap} metric={metric} fromDoors={fromDoors} shot={printing.shot} logo={state.logo ?? null} groups={state.groups ?? []} />
        )}
      </section>
    </div>
  );
}


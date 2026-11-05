"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/components/I18n";
import { fmt, plural } from "@/lib/i18n/config";
import {
  CASE_COLORS,
  CASE_PRESETS,
  TRUCKS,
  fmtLen,
  footprint,
  restingZ,
  settle,
  snap,
  stats,
  type CaseType,
  type Placed,
  type TruckSize,
} from "@/lib/truck";

// three.js is only loaded in the browser, and only on this page
const Truck3D = dynamic(() => import("./Truck3D").then((m) => m.Truck3D), { ssr: false });

const STORE_KEY = "sg_truck";
const CAB = 64;
const PAD = 14;

interface Saved {
  truck: TruckSize;
  types: CaseType[];
  placed: Placed[];
  metric: boolean;
}

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
  /** where in the case it was grabbed, in inches */
  gx: number;
  gy: number;
  x: number;
  y: number;
  over: boolean;
}

export function TruckPlanner() {
  const t = useT().truck;
  const [state, setState] = useState<Saved>(START);
  const [loaded, setLoaded] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [drag, setDragState] = useState<Drag | null>(null);
  // the pointer handlers read the drag from here, so a drop is handled once
  const dragRef = useRef<Drag | null>(null);
  const setDrag = useCallback((d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  }, []);
  const svgRef = useRef<SVGSVGElement>(null);
  const { truck, types, placed, metric } = state;
  const typeMap = useMemo(() => new Map(types.map((ty) => [ty.id, ty])), [types]);

  // the plan is kept per device
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null") as Saved | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time load from localStorage
      if (saved?.truck && Array.isArray(saved.types) && Array.isArray(saved.placed)) setState(saved);
    } catch {
      // storage blocked: start fresh
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      // storage blocked: the plan just won't be kept
    }
  }, [loaded, state]);

  const update = useCallback((fn: (s: Saved) => Saved) => setState((s) => {
    const next = fn(s);
    const map = new Map(next.types.map((ty) => [ty.id, ty]));
    return { ...next, placed: settle(next.placed.filter((p) => map.has(p.type)), map) };
  }), []);

  const len = (n: number) => fmtLen(n, metric);
  // inputs show inches or centimetres; the plan is kept in inches
  const toShown = (n: number) => (metric ? Math.round(n * 2.54) : Math.round(n));
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
      const f = { x: d.x, y: d.y, l: d.rot ? ty.w : ty.l, w: d.rot ? ty.l : ty.w };
      const at = snap(f, truck, placed, typeMap, d.uid ?? undefined);
      const id = d.uid ?? uid();
      // a high z settles it on top of whatever is under it
      const next: Placed = { uid: id, type: d.type, x: at.x, y: at.y, z: 1e6, rot: d.rot };
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
    const f = { x: drag.x, y: drag.y, l: drag.rot ? ty.w : ty.l, w: drag.rot ? ty.l : ty.w };
    const at = drag.over ? snap(f, truck, shown, typeMap, drag.uid ?? undefined) : { x: f.x, y: f.y };
    const z = drag.over ? restingZ({ ...f, ...at }, shown, typeMap, drag.uid ?? undefined) : 0;
    return { ...f, ...at, z, ty, tall: z + ty.h > truck.h + 0.01 };
  })();
  const boxes3d = useMemo(
    () =>
      placed.map((p) => {
        const ty = typeMap.get(p.type)!;
        const f = footprint(p, ty);
        return { id: p.uid, ...f, z: p.z, color: ty.color, bad: p.z + ty.h > truck.h + 0.01, sel: p.uid === sel };
      }),
    [placed, typeMap, truck.h, sel],
  );

  const vbW = CAB + truck.l + PAD;
  const vbH = truck.w;
  const selCase = sel ? placed.find((p) => p.uid === sel) : null;
  const sorted = [...shown].sort((a, b) => a.z - b.z);

  return (
    <div className="truck-tool">
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
        </div>
        <p className="muted small">
          {t.inside}: {len(truck.l)} × {len(truck.w)} × {len(truck.h)}
        </p>

        <h2>{t.cases}</h2>
        <table className="truck-cases">
          <thead>
            <tr>
              <th />
              <th>{t.caseName}</th>
              <th>{metric ? "L cm" : "L in"}</th>
              <th>{metric ? "W cm" : "W in"}</th>
              <th>{metric ? "H cm" : "H in"}</th>
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
                    <span className="swatch" style={{ background: ty.color }} />
                  </td>
                  <td>
                    <input value={ty.name} maxLength={60} aria-label={t.caseName} onChange={(e) => set({ name: e.target.value })} />
                  </td>
                  {(["l", "w", "h"] as const).map((k) => (
                    <td key={k}>
                      <input type="number" min={1} aria-label={k} value={toShown(ty[k])} onChange={(e) => set({ [k]: fromShown(e.target.value) })} />
                    </td>
                  ))}
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
                  onPointerDown={(e) => startDrag(e, { uid: null, type: ty.id, rot: false, gx: ty.l / 2, gy: ty.w / 2 })}
                >
                  <span className="swatch" style={{ background: ty.color }} />
                  {ty.name} <span className="muted">{fmt(t.left, { n })}</span>
                </button>
              ))
          ) : (
            <span className="muted small">{placed.length ? t.allLoaded : t.toLoadHint}</span>
          )}
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
          {Array.from({ length: Math.floor(truck.l / 12) }, (_, i) => (
            <line key={i} className={(i + 1) % 4 ? "ft" : "ft four"} x1={CAB + (i + 1) * 12} x2={CAB + (i + 1) * 12} y1={0} y2={truck.w} />
          ))}
          <text className="lbl" x={CAB + truck.l + 6} y={truck.w / 2} dominantBaseline="middle" transform={`rotate(90 ${CAB + truck.l + 6} ${truck.w / 2})`} textAnchor="middle">
            {t.doors}
          </text>

          {sorted.map((p) => {
            const ty = typeMap.get(p.type)!;
            const f = footprint(p, ty);
            const tall = p.z + ty.h > truck.h + 0.01;
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
                  startDrag(e, { uid: p.uid, type: p.type, rot: p.rot, gx: at ? at.x - p.x : f.l / 2, gy: at ? at.y - p.y : f.w / 2 });
                }}
                onDoubleClick={() => rotate(p.uid)}
              >
                <rect x={CAB + f.x} y={f.y} width={f.l} height={f.w} fill={ty.color} />
                {!covered && f.l > 14 && f.w > 8 && (
                  <text x={CAB + f.x + f.l / 2} y={f.y + f.w / 2} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: Math.min(9, f.w / 2.6, f.l / 6) }}>
                    {level ? `▲${height > 1 ? ` ×${height}` : ""} ${ty.name}` : ty.name}
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

        <div className="truck-help">
          <span className="muted small">{t.help}</span>
          {selCase && (
            <span className="inv-actions">
              <strong className="small">{typeMap.get(selCase.type)?.name}</strong>
              <button type="button" className="btn sm" onClick={() => rotate(selCase.uid)}>
                ⟳ {t.rotate}
              </button>
              <button type="button" className="btn sm" onClick={() => unload(selCase.uid)}>
                {t.unload}
              </button>
            </span>
          )}
        </div>

        <h2 className="truck-3d-title">{t.view3d}</h2>
        <Truck3D truck={truck} boxes={boxes3d} hint={t.orbit} reset={t.resetView} />
      </section>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/components/I18n";
import { ProjectBar, useToolState } from "@/components/Projects";
import { ToolFiles } from "@/components/ToolFiles";
import { SignalView, signalFiles } from "./SignalView";
import { SIGNAL_START } from "@/lib/signal";
import { patternPng } from "@/lib/pattern";
import { BRANDS, LED_PANELS, type LedPanel } from "@/lib/ledPanels";
import { createClient } from "@/lib/supabase/browser";
import { useI18n } from "@/components/I18n";
import { fmt } from "@/lib/i18n/config";
import { OUTPUT_SIZES, PATTERN_START as START, colName, drawOutput, drawPattern as draw, offPanels, outputPng, outputProblems, outputRects, screenImages, screenOf, screenSize, wallCurve, wallLen, type OutputMap, type SavedScreen, type Hits, type LogoAt, type PatternSettings as Settings, type Pip, type Rect, BREAKER_LOAD, PORT_1G, fmtWatts, powerOf, powerPlan, type Corner, type PowerData, type Volts } from "@/lib/pattern";
import { NumInput } from "@/components/NumInput";

const MINE_KEY = "sg_led_panels";

/** The member's own panels: kept with their account (and on this device), since a company keeps using the same ones. */
function useMyPanels() {
  const [mine, setMine] = useState<LedPanel[]>([]);
  useEffect(() => {
    try {
      const local = JSON.parse(localStorage.getItem(MINE_KEY) ?? "[]");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from this device
      if (Array.isArray(local)) setMine(local);
    } catch {}
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        const saved = data.user?.user_metadata?.led_panels;
        if (Array.isArray(saved) && saved.length) setMine(saved);
      });
  }, []);
  const save = (list: LedPanel[]) => {
    setMine(list);
    try {
      localStorage.setItem(MINE_KEY, JSON.stringify(list));
    } catch {}
    // signed out, this fails quietly and the panels stay on this device
    createClient().auth.updateUser({ data: { led_panels: list } });
  };
  return [mine, save] as const;
}

const MAX_SIDE = 16384;
const STORE_KEY = "sg_pattern";

const PIP_COLORS = ["#ffcc00", "#ff3b3b", "#35d07f", "#3fa9ff", "#ff7ad9"];
const uid = () => Math.random().toString(36).slice(2, 9);

/** Shrinks an uploaded picture so the settings stay small enough to keep on this device. */
function readImage(file: File, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL(file.type === "image/jpeg" ? "image/jpeg" : "image/png", 0.9));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function PatternTool() {
  const t = useT().pattern;
  const { t: T } = useI18n();
  // kept in the open project, or on this device
  const { state: s, setState: setS, project, saving } = useToolState("pattern", STORE_KEY, START, (v) => (v && typeof v === "object" ? { ...START, ...(v as Partial<Settings>) } : START));
  const [imgTick, setImgTick] = useState(0);
  const images = useRef(new Map<string, HTMLImageElement>());
  const canvas = useRef<HTMLCanvasElement>(null);
  const hits = useRef<Hits | null>(null);
  // what's being dragged on the canvas, and where in it it was grabbed
  const grab = useRef<{ what: "plate" | "logo" | string; dx: number; dy: number } | null>(null);
  const [cursor, setCursor] = useState("default");
  // cutting mode: clicks take panels out of the wall (or put them back)
  const [cutting, setCutting] = useState(false);
  const paint = useRef<{ remove: boolean; done: Set<string> } | null>(null);
  const W = s.cols * s.pw;
  const H = s.rows * s.ph;
  const tooBig = W > MAX_SIDE || H > MAX_SIDE;
  const set = (patch: Partial<Settings>) => setS((x) => ({ ...x, ...patch }));
  const setPip = (id: string, patch: Partial<Pip>) => setS((x) => ({ ...x, pips: x.pips.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const [mine, saveMine] = useMyPanels();
  const [panelName, setPanelName] = useState("");
  const same = (p: LedPanel) => p.w === s.pw && p.h === s.ph && p.mw === s.mw && p.mh === s.mh;
  const mineAt = mine.findIndex(same);
  const off = offPanels(s);
  const curve = wallCurve(s);
  const libAt = LED_PANELS.findIndex(same);
  const preset = mineAt >= 0 ? `mine:${mineAt}` : libAt >= 0 ? `lib:${libAt}` : "custom";
  const wm = wallLen(s.cols * s.mw);
  const hm = wallLen(s.rows * s.mh);
  const pm = { w: wallLen(s.mw), h: wallLen(s.mh) };
  const pw = powerOf(s);
  const plan = powerPlan(s);
  const setPower = (patch: Partial<PowerData>) => setS((x) => ({ ...x, power: { ...x.power, ...patch } }));
  /** A panel picked from the list brings its spec-sheet watts and weight (or clears them when unknown). */
  const applyPanel = (p: LedPanel) => set({ pw: p.w, ph: p.h, mw: p.mw, mh: p.mh, power: { ...s.power, wMax: p.wMax ?? null, wAvg: p.wAvg ?? null, kg: p.kg ?? null } });
  const optNum = (v: string, max: number) => (v.trim() === "" ? null : Math.max(0, Math.min(max, Number(v) || 0)));

  // ---------- saved screens and the output map ----------
  const lib = useMemo(() => s.library ?? [], [s.library]);
  const view = s.view ?? "screen";
  const out: OutputMap = useMemo(() => s.output ?? { name: "Output 1", w: W, h: H, items: [] }, [s.output, W, H]);
  const setOut = (patch: Partial<OutputMap>) => setS((x) => ({ ...x, output: { ...(x.output ?? out), ...patch } }));
  const CW = view === "output" ? out.w : W;
  const CH = view === "output" ? out.h : H;
  const canvasTooBig = view === "output" ? CW > MAX_SIDE || CH > MAX_SIDE : tooBig;
  const [selItem, setSelItem] = useState<string | null>(null);
  // while a screen is dragged on the output, the warning texts stay as they were when the drag started (the red outline
  // on the canvas stays live): text coming and going would move the canvas under the finger
  const [frozen, setFrozen] = useState<ReturnType<typeof outputProblems> | null>(null);
  const problems = view === "output" ? (frozen ?? outputProblems(out, lib)) : new Map();

  // the screen open in the editor stays in sync with its entry in the list
  useEffect(() => {
    if (!s.current) return;
    const entry = lib.find((l) => l.id === s.current);
    if (!entry) return;
    const now = screenOf(s);
    if (JSON.stringify(entry.s) === JSON.stringify(now)) return;
    // keeps the saved copy current while editing
    setS((x) => ({ ...x, library: (x.library ?? []).map((l) => (l.id === x.current ? { ...l, name: now.name.trim() || l.name, s: now } : l)) }));
  }, [s, lib, setS]);

  const saveScreen = () => {
    const id = uid();
    const now = screenOf(s);
    const name = now.name.trim() || `${t.screen} ${lib.length + 1}`;
    setS((x) => ({ ...x, library: [...(x.library ?? []), { id, name, s: { ...now, name: now.name || name } }], current: id, name: x.name || name }));
  };
  const openScreen = (e: SavedScreen) => setS((x) => ({ ...START, ...e.s, library: x.library, output: x.output, signal: x.signal, view: "screen", current: e.id }));
  const duplicate = (e: SavedScreen) => {
    const id = uid();
    const name = `${e.name} (${t.copy})`;
    const copy = { ...e.s, name };
    setS((x) => ({ ...START, ...copy, library: [...(x.library ?? []), { id, name, s: copy }], output: x.output, signal: x.signal, view: "screen", current: id }));
  };
  const removeScreen = (e: SavedScreen) =>
    setS((x) => ({
      ...x,
      library: (x.library ?? []).filter((l) => l.id !== e.id),
      current: x.current === e.id ? null : x.current,
      output: x.output ? { ...x.output, items: x.output.items.filter((it) => it.screen !== e.id) } : x.output,
    }));
  const newScreen = () => setS((x) => ({ ...START, library: x.library, output: x.output, signal: x.signal, view: "screen", current: null }));
  /** Places a saved screen on the output: right of the last one, or below when it doesn't fit. */
  const place = (e: SavedScreen) => {
    const { w } = screenSize(e.s);
    const rects = outputRects(out, lib);
    let x = 0;
    let y = 0;
    if (rects.length) {
      const last = rects[rects.length - 1];
      x = last.x + last.w;
      y = last.y;
      if (x + w > out.w) {
        x = 0;
        y = Math.max(...rects.map((r) => r.y + r.h));
      }
    }
    const id = uid();
    setS((xx) => ({ ...xx, output: { ...(xx.output ?? out), items: [...(xx.output ?? out).items, { id, screen: e.id, x, y }] } }));
    setSelItem(id);
  };
  const showView = (v: "screen" | "output" | "signal") => {
    // the output starts the size of the screen being made, since most outputs carry one wall
    setS((x) => ({ ...x, view: v, output: x.output ?? { name: "Output 1", w: W, h: H, items: [] } }));
    setCutting(false);
  };


  // decode uploaded pictures once; redraw when one is ready
  useEffect(() => {
    for (const src of screenImages([s, ...lib.map((l) => l.s)])) {
      if (!src || images.current.has(src)) continue;
      const img = new Image();
      img.onload = () => setImgTick((n) => n + 1);
      img.src = src;
      images.current.set(src, img);
    }
  }, [s, lib]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || canvasTooBig) return;
    c.width = CW;
    c.height = CH;
    const ready = new Map([...images.current].filter(([, img]) => img.complete && img.naturalWidth));
    const ctx = c.getContext("2d");
    if (!ctx) return;
    if (view === "output") {
      // each placed screen outlined: yellow when picked, red when it overlaps or runs off the output
      const rects = drawOutput(ctx, out, lib, ready);
      const lw = Math.max(3, Math.round(Math.min(CW, CH) / 300));
      for (const r of rects) {
        const bad = outputProblems(out, lib).get(r.item.id);
        if (!bad && r.item.id !== selItem) continue;
        ctx.strokeStyle = bad ? "#ff3b3b" : "#ffcc00";
        ctx.lineWidth = lw;
        ctx.setLineDash(bad ? [lw * 4, lw * 3] : []);
        ctx.strokeRect(r.x + lw / 2, r.y + lw / 2, r.w - lw, r.h - lw);
        ctx.setLineDash([]);
      }
      return;
    }
    hits.current = draw(ctx, s, ready);
    if (cutting) {
      // only on screen: a red cross on every panel taken out, a faint outline on the rest
      const lw = Math.max(2, Math.round(Math.min(s.pw, s.ph) / 40));
      ctx.lineWidth = lw;
      for (let r = 0; r < s.rows; r++)
        for (let c = 0; c < s.cols; c++) {
          const x = c * s.pw, y = r * s.ph;
          if (offPanels(s).has(`${c},${r}`)) {
            ctx.strokeStyle = "rgba(255,59,59,0.9)";
            ctx.beginPath();
            ctx.moveTo(x + lw * 3, y + lw * 3);
            ctx.lineTo(x + s.pw - lw * 3, y + s.ph - lw * 3);
            ctx.moveTo(x + s.pw - lw * 3, y + lw * 3);
            ctx.lineTo(x + lw * 3, y + s.ph - lw * 3);
            ctx.stroke();
            ctx.strokeRect(x + lw / 2, y + lw / 2, s.pw - lw, s.ph - lw);
          }
        }
    }
  }, [s, W, H, CW, CH, canvasTooBig, imgTick, cutting, view, out, lib, selItem]);



  // ---------- dragging on the canvas ----------

  /** Pointer position in wall pixels. */
  // the canvas's place on the page, measured when a drag starts: warnings that appear mid-drag (overlap, off the
  // output) push the canvas down, and measuring again each move made the dragged screen shake on phones
  const dragBox = useRef<DOMRect | null>(null);
  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = (grab.current || paint.current) && dragBox.current ? dragBox.current : e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * CW, y: ((e.clientY - r.top) / r.height) * CH };
  };
  const inside = (p: { x: number; y: number }, r: Rect) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  /** The topmost thing under the pointer: the logo, then the title, then windows from the top one down. */
  const hitTest = (p: { x: number; y: number }) => {
    const h = hits.current;
    if (h?.logo && s.logoAt !== "each" && inside(p, h.logo)) return { what: "logo", r: h.logo };
    if (h && inside(p, h.plate)) return { what: "plate", r: h.plate };
    const pip = [...s.pips].reverse().find((q) => inside(p, q));
    return pip ? { what: pip.id, r: pip } : null;
  };
  // windows land on panel edges when dropped near one
  const snapTo = (v: number, step: number) => (Math.abs(v - Math.round(v / step) * step) < step * 0.12 ? Math.round(v / step) * step : Math.round(v));

  /** The panel under the pointer, as "col,row". */
  const panelAt = (p: { x: number; y: number }) => {
    const c = Math.floor(p.x / s.pw);
    const r = Math.floor(p.y / s.ph);
    return c >= 0 && r >= 0 && c < s.cols && r < s.rows ? `${c},${r}` : null;
  };
  const cut = (k: string) => {
    const g = paint.current;
    if (!g || g.done.has(k)) return;
    g.done.add(k);
    setS((x) => {
      const now = new Set(offPanels(x));
      if (g.remove) now.add(k);
      else now.delete(k);
      return { ...x, off: [...now] };
    });
  };

  /** A screen on the output dropped near the output's edges or another screen's lands on them. */
  const snapOut = (id: string, x: number, y: number, w: number, h: number) => {
    const others = outputRects(out, lib).filter((r) => r.item.id !== id);
    const xs = [0, out.w, ...others.flatMap((r) => [r.x, r.x + r.w])];
    const ys = [0, out.h, ...others.flatMap((r) => [r.y, r.y + r.h])];
    const tol = Math.max(8, Math.round(Math.min(out.w, out.h) / 60));
    const near = (v: number, size: number, lines: number[]) => {
      for (const l of lines) {
        if (Math.abs(v - l) < tol) return l;
        if (Math.abs(v + size - l) < tol) return l - size;
      }
      return Math.round(v);
    };
    return { x: near(x, w, xs), y: near(y, h, ys) };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragBox.current = null;
    const p = at(e);
    dragBox.current = e.currentTarget.getBoundingClientRect();
    if (view === "output") {
      const hit = [...outputRects(out, lib)].reverse().find((r) => inside(p, r));
      setSelItem(hit?.item.id ?? null);
      if (!hit) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      grab.current = { what: hit.item.id, dx: p.x - hit.x, dy: p.y - hit.y };
      setFrozen(outputProblems(out, lib));
      setCursor("grabbing");
      return;
    }
    if (cutting) {
      const k = panelAt(p);
      if (!k) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      // the first panel decides: dragging from a lit panel takes panels out, from a dark one puts them back
      paint.current = { remove: !off.has(k), done: new Set() };
      cut(k);
      return;
    }
    const hit = hitTest(p);
    if (!hit) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    grab.current = { what: hit.what, dx: p.x - hit.r.x, dy: p.y - hit.r.y };
    setCursor("grabbing");
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = at(e);
    if (view === "output") {
      const g = grab.current;
      if (!g) return setCursor(outputRects(out, lib).some((r) => inside(p, r)) ? "grab" : "default");
      const r = outputRects(out, lib).find((x) => x.item.id === g.what);
      if (!r) return;
      const to = snapOut(r.item.id, p.x - g.dx, p.y - g.dy, r.w, r.h);
      setOut({ items: out.items.map((it) => (it.id === r.item.id ? { ...it, ...to } : it)) });
      return;
    }
    if (cutting) {
      const k = paint.current && panelAt(p);
      if (k) cut(k);
      return setCursor("crosshair");
    }
    const g = grab.current;
    if (!g) return setCursor(hitTest(p) ? "grab" : "default");
    if (g.what === "plate" || g.what === "logo") {
      const r = g.what === "plate" ? hits.current?.plate : hits.current?.logo;
      if (!r) return;
      const cx = Math.round(Math.min(W, Math.max(0, p.x - g.dx + r.w / 2)));
      const cy = Math.round(Math.min(H, Math.max(0, p.y - g.dy + r.h / 2)));
      set(g.what === "plate" ? { titleX: cx, titleY: cy } : { logoAt: "custom", logoX: cx, logoY: cy });
    } else {
      const q = s.pips.find((x) => x.id === g.what);
      if (!q) return;
      setPip(q.id, {
        x: Math.min(W - q.w, Math.max(0, snapTo(p.x - g.dx, s.pw))),
        y: Math.min(H - q.h, Math.max(0, snapTo(p.y - g.dy, s.ph))),
      });
    }
  };
  const onUp = () => {
    dragBox.current = null;
    grab.current = null;
    setFrozen(null);
    paint.current = null;
    setCursor("default");
  };

  const num = (v: string, max: number, min = 1) => Math.max(min, Math.min(max, Math.round(Number(v) || 0)));
  const check = (k: keyof Settings, label: string) => (
    <label className="pat-check">
      <input type="checkbox" checked={Boolean(s[k])} onChange={(e) => set({ [k]: e.target.checked } as Partial<Settings>)} />
      {label}
    </label>
  );
  const pick = (max: number, then: (src: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f && /^image\//.test(f.type)) readImage(f, max).then(then, () => {});
  };
  const addPip = () => {
    // a 16:9 window, half the wall wide, in the middle
    const w = Math.min(W, Math.round(W / 2));
    const h = Math.min(H, Math.round((w * 9) / 16));
    set({ pips: [...s.pips, { id: uid(), name: `PIP ${s.pips.length + 1}`, x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h, color: PIP_COLORS[s.pips.length % PIP_COLORS.length], img: null }] });
  };

  const tabs = (
    <div className="seg seg2 pat-views" role="tablist">
      {(["screen", "output", "signal"] as const).map((v) => (
        <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? "on" : undefined} onClick={() => showView(v)}>
          {v === "screen" ? t.viewScreen : v === "output" ? t.viewOutput : T.ledSignal.tab}
        </button>
      ))}
    </div>
  );
  const sigTitle = project?.name ?? "";
  const sigFiles = signalFiles(s.signal ?? SIGNAL_START, lib, s.output, T.ledSignal, sigTitle);

  return (
    <div className="pat-tool">
      <ProjectBar project={project} saving={saving} />
      <ToolFiles
        tool="pattern"
        name={view === "signal" ? `${project?.name || out.name.trim() || "signal"} signal` : view === "output" ? `${out.name.trim() || "output"} ${out.w}x${out.h}` : `${s.name.trim() || project?.name || "led-test-pattern"} ${W}x${H}`}
        data={s}
        onOpen={(v) => v && typeof v === "object" && setS({ ...START, ...(v as Partial<Settings>) })}
        downloadLabel={view === "signal" ? T.ledSignal.dlFlowPng : T.files.patternPng}
        more={view === "signal" ? sigFiles.more : undefined}
        download={
          view === "signal"
            ? sigFiles.download
            : view === "output"
            ? canvasTooBig || !out.items.length
              ? undefined
              : async () => {
                  const blob = await outputPng(out, lib);
                  return blob ? { blob, name: `${(out.name.trim() || "output").replace(/[^\w-]+/g, "-")}-${out.w}x${out.h}.png` } : null;
                }
            : tooBig
            ? undefined
            : async () => {
                const blob = await patternPng(s);
                return blob ? { blob, name: `${(s.name.trim() || "led-test-pattern").replace(/[^\w-]+/g, "-")}-${W}x${H}.png` } : null;
              }
        }
      />
      {view === "signal" ? (
        <SignalView s={s} setS={setS} t={T.ledSignal} library={lib} output={s.output} tabs={tabs} title={sigTitle} />
      ) : view === "output" ? (
        <aside className="auth-form pat-side">
          <h2>{t.outputTitle}</h2>
          <p className="muted small">{t.outputHint}</p>
          <label className="field">
            <span>{t.outputName}</span>
            <input value={out.name} maxLength={60} placeholder="Output 1" onChange={(e) => setOut({ name: e.target.value })} />
          </label>
          <label className="field">
            <span>{t.outputSize}</span>
            <select
              value={OUTPUT_SIZES.find((z) => z.w === out.w && z.h === out.h)?.id ?? "custom"}
              onChange={(e) => {
                const z = OUTPUT_SIZES.find((x) => x.id === e.target.value);
                if (z) setOut({ w: z.w, h: z.h });
              }}
            >
              {OUTPUT_SIZES.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
              <option value="custom">{t.custom}</option>
            </select>
          </label>
          <div className="pat-two">
            <label className="field">
              <span>{t.outputW}</span>
              <NumInput min={16} max={MAX_SIDE} value={out.w} onChange={(e) => setOut({ w: num(e.target.value, MAX_SIDE, 16) })} />
            </label>
            <label className="field">
              <span>{t.outputH}</span>
              <NumInput min={16} max={MAX_SIDE} value={out.h} onChange={(e) => setOut({ h: num(e.target.value, MAX_SIDE, 16) })} />
            </label>
          </div>
          {out.items.length > 0 && (
            <button
              type="button"
              className="link small pat-recenter"
              onClick={() => {
                const rects = outputRects(out, lib);
                setOut({ w: Math.max(16, ...rects.map((r) => r.x + r.w)), h: Math.max(16, ...rects.map((r) => r.y + r.h)) });
              }}
            >
              {t.outputFit}
            </button>
          )}

          <h2>{t.outputScreens}</h2>
          {!out.items.length && <p className="muted small">{lib.length ? t.outputEmpty : t.outputNoScreens}</p>}
          {outputRects(out, lib).map((r) => {
            const bad = problems.get(r.item.id);
            return (
              <div key={r.item.id} className={`pat-pip${selItem === r.item.id ? " on" : ""}`} style={{ borderColor: bad ? "#ff3b3b" : selItem === r.item.id ? "#ffcc00" : undefined }}>
                <div className="pat-pip-head">
                  <button type="button" className="pat-mine-use" onClick={() => setSelItem(r.item.id)}>
                    {r.screen.name}
                    <span className="muted">
                      {r.w} × {r.h} px
                    </span>
                  </button>
                  <button type="button" className="link small" onClick={() => setOut({ items: out.items.filter((it) => it.id !== r.item.id) })}>
                    {t.remove}
                  </button>
                </div>
                <div className="pat-two">
                  {(["x", "y"] as const).map((k) => (
                    <label key={k} className="field">
                      <span>{k.toUpperCase()} px</span>
                      <NumInput
                        value={r.item[k]}
                        onChange={(e) => setOut({ items: out.items.map((it) => (it.id === r.item.id ? { ...it, [k]: Math.round(Number(e.target.value) || 0) } : it)) })}
                      />
                    </label>
                  ))}
                </div>
                {bad && <p className="auth-err small">{bad === "overlap" ? t.outputOverlap : t.outputOutside}</p>}
              </div>
            );
          })}
          {lib.length > 0 && (
            <label className="field">
              <span>{t.outputAdd}</span>
              <select
                value=""
                onChange={(e) => {
                  const sc = lib.find((l) => l.id === e.target.value);
                  if (sc) place(sc);
                }}
              >
                <option value="">—</option>
                {lib.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} · {screenSize(l.s).w} × {screenSize(l.s).h}
                  </option>
                ))}
              </select>
            </label>
          )}
        </aside>
      ) : (
      <aside className="auth-form pat-side">
        <h2>{t.wall}</h2>
        <div className="pat-two">
          <label className="field">
            <span>{t.across}</span>
            <NumInput min={1} max={200} value={s.cols} onChange={(e) => set({ cols: num(e.target.value, 200) })} />
          </label>
          <label className="field">
            <span>{t.down}</span>
            <NumInput min={1} max={200} value={s.rows} onChange={(e) => set({ rows: num(e.target.value, 200) })} />
          </label>
        </div>
        <label className="field">
          <span>{t.preset}</span>
          <select
            value={preset}
            onChange={(e) => {
              const [from, i] = e.target.value.split(":");
              const p = (from === "mine" ? mine : LED_PANELS)[Number(i)];
              if (p) applyPanel(p);
            }}
          >
            {mine.length > 0 && (
              <optgroup label={t.myPanels}>
                {mine.map((p, i) => (
                  <option key={i} value={`mine:${i}`}>
                    {p.name} → {p.w} × {p.h} px
                  </option>
                ))}
              </optgroup>
            )}
            {BRANDS.map((b) => (
              <optgroup key={b} label={b === "Generic" ? t.generic : b}>
                {LED_PANELS.map((p, i) =>
                  p.brand === b ? (
                    <option key={i} value={`lib:${i}`}>
                      {p.name} → {p.w} × {p.h} px
                    </option>
                  ) : null,
                )}
              </optgroup>
            ))}
            <option value="custom">{t.custom}</option>
          </select>
        </label>
        <div className="pat-two">
          <label className="field">
            <span>{t.pxW}</span>
            <NumInput min={1} max={2048} value={s.pw} onChange={(e) => set({ pw: num(e.target.value, 2048) })} />
          </label>
          <label className="field">
            <span>{t.pxH}</span>
            <NumInput min={1} max={2048} value={s.ph} onChange={(e) => set({ ph: num(e.target.value, 2048) })} />
          </label>
          <label className="field">
            <span>{t.mmW}</span>
            <NumInput min={1} max={5000} value={s.mw} onChange={(e) => set({ mw: num(e.target.value, 5000) })} />
          </label>
          <label className="field">
            <span>{t.mmH}</span>
            <NumInput min={1} max={5000} value={s.mh} onChange={(e) => set({ mh: num(e.target.value, 5000) })} />
          </label>
        </div>
        {mine.length > 0 && (
          <ul className="pat-mine" aria-label={t.myPanels}>
            {mine.map((p, i) => (
              <li key={i} className={same(p) ? "on" : undefined}>
                <button type="button" className="pat-mine-use" onClick={() => applyPanel(p)}>
                  ★ {p.name}
                  <span className="muted">
                    {p.w} × {p.h} px · {p.mw} × {p.mh} mm
                  </span>
                </button>
                <button type="button" className="link small" aria-label={fmt(t.removePanel, { name: p.name })} title={fmt(t.removePanel, { name: p.name })} onClick={() => saveMine(mine.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="pat-save-panel"
          onSubmit={(e) => {
            e.preventDefault();
            const name = panelName.trim().slice(0, 60);
            if (!name || mine.some((p) => p.name === name && same(p))) return;
            saveMine([...mine, { brand: "", name, w: s.pw, h: s.ph, mw: s.mw, mh: s.mh, ...(pw.wMax ? { wMax: pw.wMax } : {}), ...(pw.wAvg ? { wAvg: pw.wAvg } : {}), ...(pw.kg ? { kg: pw.kg } : {}) }]);
            setPanelName("");
          }}
        >
          <input value={panelName} maxLength={60} placeholder={t.panelName} aria-label={t.panelName} onChange={(e) => setPanelName(e.target.value)} />
          <button className="btn sm" disabled={!panelName.trim() || mine.some((p) => p.name === panelName.trim() && same(p))}>
            ★ {t.savePanel}
          </button>
        </form>
        <p className="muted small">{t.panelsNote}</p>
        <p className="muted small pat-sizes">
          {fmt(t.panelSize, { m: `${pm.w.m} × ${pm.h.m}`, ft: `${pm.w.ft} × ${pm.h.ft}` })}
          <br />
          <strong>{fmt(t.wallSize, { m: `${wm.m} × ${hm.m}`, ft: `${wm.ft} × ${hm.ft}` })}</strong>
        </p>

        <h2>{t.shape}</h2>
        <p className="muted small">{t.shapeHint}</p>
        <div className="pat-logo">
          <button type="button" className={cutting ? "btn sm primary" : "btn sm"} aria-pressed={cutting} onClick={() => setCutting((v) => !v)}>
            {cutting ? t.shapeDone : t.shapeEdit}
          </button>
          {off.size > 0 && (
            <button type="button" className="link small" onClick={() => set({ off: [] })}>
              {fmt(t.shapeReset, { n: off.size })}
            </button>
          )}
        </div>
        {off.size > 0 && (
          <p className="muted small">
            {fmt(t.shapeOff, {
              list: [...off]
                .map((k) => k.split(",").map(Number))
                .sort((a, b) => a[1] - b[1] || a[0] - b[0])
                .slice(0, 24)
                .map(([c, r]) => `${colName(c)}${r + 1}`)
                .join(", ") + (off.size > 24 ? "…" : ""),
            })}
          </p>
        )}

        <h2>{t.curve}</h2>
        <div className="pat-two">
          <label className="field">
            <span>{t.curveDeg}</span>
            <NumInput
              min={0}
              max={30}
              step={0.5}
              value={s.curve ?? 0}
              onChange={(e) => set({ curve: Math.max(0, Math.min(30, Number(e.target.value) || 0)) })}
            />
          </label>
          {curve && (
            <label className="field">
              <span>{t.curveDir}</span>
              <select value={curve.dir} onChange={(e) => set({ curveDir: e.target.value as "in" | "out" })}>
                <option value="in">{t.curveIn}</option>
                <option value="out">{t.curveOut}</option>
              </select>
            </label>
          )}
        </div>
        <p className="muted small">
          {curve
            ? fmt(t.curveSummary, {
                total: +curve.total.toFixed(1),
                r: `${wallLen(curve.radius).m} · ${wallLen(curve.radius).ft}`,
                chord: curve.chord ? `${wallLen(curve.chord).m} · ${wallLen(curve.chord).ft}` : "—",
              })
            : t.curveHint}
        </p>

        <h2>{t.power}</h2>
        <p className="muted small">{t.powerHint}</p>
        <div className="pat-two">
          <label className="field">
            <span>{t.wMax}</span>
            <NumInput min={0} max={5000} placeholder="—" value={pw.wMax ?? ""} onChange={(e) => setPower({ wMax: optNum(e.target.value, 5000) })} />
          </label>
          <label className="field">
            <span>{t.wAvg}</span>
            <NumInput min={0} max={5000} placeholder="—" value={pw.wAvg ?? ""} onChange={(e) => setPower({ wAvg: optNum(e.target.value, 5000) })} />
          </label>
          <label className="field">
            <span>{t.kg}</span>
            <NumInput min={0} max={500} step={0.01} placeholder="—" value={pw.kg ?? ""} onChange={(e) => setPower({ kg: optNum(e.target.value, 500) })} />
          </label>
          <label className="field">
            <span>{t.volts}</span>
            <select value={pw.volts} onChange={(e) => setPower({ volts: Number(e.target.value) as Volts })}>
              {([110, 120, 208, 230] as const).map((v) => (
                <option key={v} value={v}>
                  {v} V
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t.breaker}</span>
            <NumInput min={1} max={400} value={pw.breaker} onChange={(e) => setPower({ breaker: num(e.target.value, 400) })} />
          </label>
          <label className="field">
            <span>{t.perPower}</span>
            <NumInput min={1} max={200} value={pw.perPower} onChange={(e) => setPower({ perPower: num(e.target.value, 200) })} />
          </label>
          <label className="field">
            <span>{t.portPx}</span>
            <NumInput min={1} max={100000000} step={1} value={pw.portPx} onChange={(e) => setPower({ portPx: num(e.target.value, 100000000) })} />
          </label>
          <label className="field">
            <span>{t.perData}</span>
            <NumInput
              min={1}
              max={1000}
              placeholder={fmt(t.perDataAuto, { n: Math.max(1, plan.fit) })}
              value={pw.perData ?? ""}
              onChange={(e) => setPower({ perData: e.target.value.trim() === "" ? null : num(e.target.value, 1000) })}
            />
          </label>
          <label className="field">
            <span>{t.order}</span>
            <select value={pw.order} onChange={(e) => setPower({ order: e.target.value as "h" | "v" })}>
              <option value="h">{t.orderH}</option>
              <option value="v">{t.orderV}</option>
            </select>
          </label>
          <label className="field">
            <span>{t.start}</span>
            <select value={pw.start} onChange={(e) => setPower({ start: e.target.value as Corner })}>
              {(["tl", "tr", "bl", "br"] as const).map((k) => (
                <option key={k} value={k}>
                  {t.corners[k]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {pw.portPx !== PORT_1G && (
          <button type="button" className="link small" onClick={() => setPower({ portPx: PORT_1G })}>
            {t.port1g}
          </button>
        )}
        <p className="muted small">{t.portHint}</p>
        <label className="pat-check">
          <input type="checkbox" checked={pw.overlay} onChange={(e) => setPower({ overlay: e.target.checked })} />
          {t.overlay}
        </label>
        <ul className="muted small pat-power">
          {plan.totalMax != null ? (
            <>
              <li>
                <strong>{fmt(t.totWatts, { max: fmtWatts(plan.totalMax), avg: plan.totalAvg != null ? fmtWatts(plan.totalAvg) : "—" })}</strong>
              </li>
              <li>{fmt(t.totAmps, { max: plan.ampsMax!.toFixed(1), avg: plan.ampsAvg != null ? plan.ampsAvg.toFixed(1) : "—", v: pw.volts })}</li>
              <li>
                <strong>{fmt(t.circuits, { n: plan.circuits ?? 0, a: pw.breaker, w: fmtWatts(plan.usable), pct: BREAKER_LOAD * 100 })}</strong>
              </li>
            </>
          ) : (
            <li>{t.noWatts}</li>
          )}
          <li>{fmt(t.powerRuns, { n: plan.powerRuns.length, per: plan.perPower })}</li>
          <li>
            <strong>{fmt(t.dataPorts, { n: plan.dataRuns.length, per: plan.perData })}</strong>
          </li>
          <li>{fmt(t.panelPx, { px: (s.pw * s.ph).toLocaleString("en-US"), fit: plan.fit })}</li>
          {plan.kg != null && <li>{fmt(t.weight, { kg: Math.round(plan.kg).toLocaleString("en-US"), lb: Math.round(plan.kg * 2.20462).toLocaleString("en-US") })}</li>}
        </ul>
        {plan.chainOver && <p className="auth-err small">{fmt(t.chainOver, { n: plan.perPower, w: fmtWatts(plan.perPower * pw.wMax!), a: pw.breaker, v: pw.volts })}</p>}
        {plan.fit < 1 ? <p className="auth-err small">{t.portTooSmall}</p> : plan.dataOver && <p className="auth-err small">{fmt(t.dataOver, { n: plan.perData, max: plan.fit })}</p>}

        <h2>{t.style}</h2>
        <div className="seg seg3" role="radiogroup">
          {(["checker", "grid", "solid"] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={s.style === k} className={s.style === k ? "on" : undefined} onClick={() => set({ style: k })}>
              {t.styles[k]}
            </button>
          ))}
        </div>

        <h2>{t.colors}</h2>
        <div className="pat-colors">
          {(
            [
              ["a", t.color1],
              ["b", t.color2],
              ["line", t.lines],
              ["ink", t.text],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="pat-color">
              <input type="color" value={s[k]} onChange={(e) => set({ [k]: e.target.value } as Partial<Settings>)} />
              {label}
            </label>
          ))}
        </div>

        <label className="field">
          <span>{t.name}</span>
          <input value={s.name} maxLength={60} placeholder={t.namePlaceholder} onChange={(e) => set({ name: e.target.value })} />
        </label>
        {s.titleX != null && (
          <button type="button" className="link small pat-recenter" onClick={() => set({ titleX: null, titleY: null })}>
            {t.recenter}
          </button>
        )}

        <h2>{t.show}</h2>
        <div className="pat-checks">
          {check("numbers", t.numbers)}
          {check("borders", t.lines)}
          {check("circle", t.circle)}
          {check("diagonals", t.diagonals)}
          {check("bars", t.colorBars)}
          {check("ramp", t.gradient)}
        </div>

        <h2>{t.logo}</h2>
        <div className="pat-logo">
          <label className="btn sm">
            {s.logo ? t.logoChange : t.logoAdd}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={pick(1024, (src) => set({ logo: src }))} />
          </label>
          {s.logo && (
            <>
              <label className="pat-color" title={t.logoColor}>
                <input type="color" value={s.logoColor ?? "#ffffff"} aria-label={t.logoColor} onChange={(e) => set({ logoColor: e.target.value })} />
                {t.logoColor}
              </label>
              {s.logoColor && (
                <button type="button" className="link small" onClick={() => set({ logoColor: null })}>
                  {t.logoOriginal}
                </button>
              )}
              <button type="button" className="link small" onClick={() => set({ logo: null, logoColor: null })}>
                {t.remove}
              </button>
            </>
          )}
        </div>
        {s.logo && (
          <div className="pat-two">
            <label className="field">
              <span>{t.logoWhere}</span>
              <select value={s.logoAt} onChange={(e) => set({ logoAt: e.target.value as LogoAt })}>
                {(["tl", "tr", "bl", "br", "center", "each", ...(s.logoAt === "custom" ? (["custom"] as const) : [])] as const).map((k) => (
                  <option key={k} value={k}>
                    {t.logoAt[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t.logoSize}</span>
              <input type="range" min={0.05} max={0.5} step={0.01} value={s.logoSize} onChange={(e) => set({ logoSize: Number(e.target.value) })} />
            </label>
          </div>
        )}
        <p className="muted small">{t.logoHint}</p>

        <h2>{t.pip}</h2>
        <p className="muted small">{t.pipHint}</p>
        {s.pips.map((p) => (
          <div key={p.id} className="pat-pip" style={{ borderColor: p.color }}>
            <div className="pat-pip-head">
              <input value={p.name} maxLength={40} aria-label={t.pipName} onChange={(e) => setPip(p.id, { name: e.target.value })} />
              <input type="color" value={p.color} aria-label={t.colors} onChange={(e) => setPip(p.id, { color: e.target.value })} />
              <button type="button" className="link small" onClick={() => set({ pips: s.pips.filter((x) => x.id !== p.id) })}>
                {t.remove}
              </button>
            </div>
            <div className="pat-four">
              {(["x", "y", "w", "h"] as const).map((k) => (
                <label key={k} className="field">
                  <span>{k.toUpperCase()} px</span>
                  <NumInput
                    min={k === "x" || k === "y" ? 0 : 1}
                    max={k === "x" || k === "w" ? W : H}
                    value={p[k]}
                    onChange={(e) => setPip(p.id, { [k]: num(e.target.value, k === "x" || k === "w" ? W : H, k === "x" || k === "y" ? 0 : 1) })}
                  />
                </label>
              ))}
            </div>
            <div className="pat-pip-foot">
              <span className="muted small">
                {fmt(t.pipPanels, { w: +(p.w / s.pw).toFixed(2), h: +(p.h / s.ph).toFixed(2) })} ·{" "}
                {`${wallLen((p.w / s.pw) * s.mw).ft} × ${wallLen((p.h / s.ph) * s.mh).ft}`}
              </span>
              <button type="button" className="link small" onClick={() => setPip(p.id, { h: Math.min(H, Math.round((p.w * 9) / 16)) })}>
                16:9
              </button>
              <label className="link small">
                {p.img ? t.pipImgChange : t.pipImg}
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pick(2048, (src) => setPip(p.id, { img: src }))} />
              </label>
              {p.img && (
                <button type="button" className="link small" onClick={() => setPip(p.id, { img: null })}>
                  {t.pipImgRemove}
                </button>
              )}
            </div>
          </div>
        ))}
        <button type="button" className="btn sm" onClick={addPip} disabled={s.pips.length >= 8}>
          {t.pipAdd}
        </button>
      </aside>
      )}

      {view !== "signal" && (
      <section className="pat-main">
        {tabs}
        <div className="pat-head">
          {view === "output" ? (
            <div>
              <strong className="num">
                {out.name.trim() || "Output"} · {fmt(t.size, { w: out.w.toLocaleString("en-US"), h: out.h.toLocaleString("en-US") })}
              </strong>
              <span className="muted small">
                {" "}
                · {fmt(t.outputCount, { n: out.items.length })}
                {problems.size > 0 && <strong className="ptc-bad"> · {t.outputProblem}</strong>}
              </span>
            </div>
          ) : (
            <div>
              <strong className="num">{fmt(t.size, { w: W.toLocaleString("en-US"), h: H.toLocaleString("en-US") })}</strong>
              <span className="muted small">
                {" "}
                · {fmt(t.panels, { n: s.cols * s.rows - off.size })} · {wm.m} × {hm.m} · {wm.ft} × {hm.ft}
              </span>
            </div>
          )}
        </div>
        {canvasTooBig ? <p className="auth-err">{t.tooBig}</p> : <canvas
            ref={canvas}
            className="pat-canvas"
            style={{ cursor }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />}
        {!canvasTooBig && <p className="muted small">{view === "output" ? t.outputDragHint : cutting ? t.shapeHint : t.dragHint}</p>}
      </section>
      )}

      <aside className="auth-form pat-lib">
        <h2>{t.libTitle}</h2>
        {s.current && lib.some((l) => l.id === s.current) ? (
          <p className="muted small">✓ {t.libSynced}</p>
        ) : (
          <button type="button" className="btn sm primary" onClick={saveScreen}>
            ★ {t.libSave}
          </button>
        )}
        {lib.length ? (
          <ul className="pat-mine">
            {lib.map((l) => {
              const { w, h } = screenSize(l.s);
              return (
                <li key={l.id} className={l.id === s.current && view === "screen" ? "on" : undefined}>
                  <button type="button" className="pat-mine-use" onClick={() => openScreen(l)} title={t.libOpen}>
                    {l.name}
                    <span className="muted">
                      {l.s.cols} × {l.s.rows} · {w} × {h} px
                    </span>
                  </button>
                  <span className="pat-lib-acts">
                    {view === "output" && (
                      <button type="button" className="link small" title={t.outputAdd} aria-label={`${t.outputAdd}: ${l.name}`} onClick={() => place(l)}>
                        ＋
                      </button>
                    )}
                    <button type="button" className="link small" title={t.libDuplicate} aria-label={`${t.libDuplicate}: ${l.name}`} onClick={() => duplicate(l)}>
                      ⧉
                    </button>
                    <button
                      type="button"
                      className="link small"
                      title={t.remove}
                      aria-label={`${t.remove}: ${l.name}`}
                      onClick={() => window.confirm(fmt(t.libRemoveAsk, { name: l.name })) && removeScreen(l)}
                    >
                      ✕
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted small">{t.libEmpty}</p>
        )}
        <button type="button" className="link small" onClick={newScreen}>
          + {t.libNew}
        </button>
      </aside>
    </div>
  );
}

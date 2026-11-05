"use client";

import { useEffect, useRef, useState } from "react";
import { AccountNeeded, useSignedIn } from "@/components/AccountGate";
import { useT } from "@/components/I18n";
import { ProjectBar, useToolState } from "@/components/Projects";
import { fmt } from "@/lib/i18n/config";
import { PATTERN_START as START, drawPattern as draw, wallLen, type Hits, type LogoAt, type PatternSettings as Settings, type Pip, type Rect } from "@/lib/pattern";

/** Common LED panels: pixels and millimetres per cabinet. "Custom" covers the rest. */
const PANELS = [
  { name: "2.6 mm · 500 × 500", w: 192, h: 192, mw: 500, mh: 500 },
  { name: "2.9 mm · 500 × 500", w: 168, h: 168, mw: 500, mh: 500 },
  { name: "ROE BP2 · 500 × 500", w: 176, h: 176, mw: 500, mh: 500 },
  { name: "3.9 mm · 500 × 500", w: 128, h: 128, mw: 500, mh: 500 },
  { name: "3.9 mm · 500 × 1000", w: 128, h: 256, mw: 500, mh: 1000 },
  { name: "4.8 mm · 500 × 500", w: 104, h: 104, mw: 500, mh: 500 },
  { name: "5.9 mm · 600 × 1200", w: 104, h: 208, mw: 600, mh: 1200 },
];

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
  // kept in the open project, or on this device
  const { state: s, setState: setS, project, saving } = useToolState("pattern", STORE_KEY, START, (v) => (v && typeof v === "object" ? { ...START, ...(v as Partial<Settings>) } : START));
  const [imgTick, setImgTick] = useState(0);
  const images = useRef(new Map<string, HTMLImageElement>());
  const canvas = useRef<HTMLCanvasElement>(null);
  const hits = useRef<Hits | null>(null);
  // what's being dragged on the canvas, and where in it it was grabbed
  const grab = useRef<{ what: "plate" | "logo" | string; dx: number; dy: number } | null>(null);
  const [cursor, setCursor] = useState("default");
  const W = s.cols * s.pw;
  const H = s.rows * s.ph;
  const tooBig = W > MAX_SIDE || H > MAX_SIDE;
  const set = (patch: Partial<Settings>) => setS((x) => ({ ...x, ...patch }));
  const setPip = (id: string, patch: Partial<Pip>) => setS((x) => ({ ...x, pips: x.pips.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const preset = PANELS.findIndex((p) => p.w === s.pw && p.h === s.ph && p.mw === s.mw && p.mh === s.mh);
  const wm = wallLen(s.cols * s.mw);
  const hm = wallLen(s.rows * s.mh);
  const pm = { w: wallLen(s.mw), h: wallLen(s.mh) };


  // decode uploaded pictures once; redraw when one is ready
  useEffect(() => {
    for (const src of [s.logo, ...s.pips.map((p) => p.img)]) {
      if (!src || images.current.has(src)) continue;
      const img = new Image();
      img.onload = () => setImgTick((n) => n + 1);
      img.src = src;
      images.current.set(src, img);
    }
  }, [s.logo, s.pips]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || tooBig) return;
    c.width = W;
    c.height = H;
    const ready = new Map([...images.current].filter(([, img]) => img.complete && img.naturalWidth));
    const ctx = c.getContext("2d");
    if (ctx) hits.current = draw(ctx, s, ready);
  }, [s, W, H, tooBig, imgTick]);

  // drawing is open to everyone; downloading needs an account
  const signedIn = useSignedIn();
  const [askAccount, setAskAccount] = useState(false);
  const download = () => {
    if (!signedIn) return setAskAccount(true);
    canvas.current?.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${(s.name.trim() || "led-test-pattern").replace(/[^\w-]+/g, "-")}-${W}x${H}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, "image/png");
  };

  // ---------- dragging on the canvas ----------

  /** Pointer position in wall pixels. */
  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
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

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = at(e);
    const hit = hitTest(p);
    if (!hit) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    grab.current = { what: hit.what, dx: p.x - hit.r.x, dy: p.y - hit.r.y };
    setCursor("grabbing");
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = at(e);
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
    grab.current = null;
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

  return (
    <div className="pat-tool">
      <ProjectBar project={project} saving={saving} />
      <aside className="auth-form pat-side">
        <h2>{t.wall}</h2>
        <div className="pat-two">
          <label className="field">
            <span>{t.across}</span>
            <input type="number" min={1} max={200} value={s.cols} onChange={(e) => set({ cols: num(e.target.value, 200) })} />
          </label>
          <label className="field">
            <span>{t.down}</span>
            <input type="number" min={1} max={200} value={s.rows} onChange={(e) => set({ rows: num(e.target.value, 200) })} />
          </label>
        </div>
        <label className="field">
          <span>{t.preset}</span>
          <select value={preset} onChange={(e) => {
              const p = PANELS[Number(e.target.value)];
              if (p) set({ pw: p.w, ph: p.h, mw: p.mw, mh: p.mh });
            }}>
            {PANELS.map((p, i) => (
              <option key={p.name} value={i}>
                {p.name} → {p.w} × {p.h} px
              </option>
            ))}
            <option value={-1}>{t.custom}</option>
          </select>
        </label>
        <div className="pat-two">
          <label className="field">
            <span>{t.pxW}</span>
            <input type="number" min={1} max={2048} value={s.pw} onChange={(e) => set({ pw: num(e.target.value, 2048) })} />
          </label>
          <label className="field">
            <span>{t.pxH}</span>
            <input type="number" min={1} max={2048} value={s.ph} onChange={(e) => set({ ph: num(e.target.value, 2048) })} />
          </label>
          <label className="field">
            <span>{t.mmW}</span>
            <input type="number" min={1} max={5000} value={s.mw} onChange={(e) => set({ mw: num(e.target.value, 5000) })} />
          </label>
          <label className="field">
            <span>{t.mmH}</span>
            <input type="number" min={1} max={5000} value={s.mh} onChange={(e) => set({ mh: num(e.target.value, 5000) })} />
          </label>
        </div>
        <p className="muted small pat-sizes">
          {fmt(t.panelSize, { m: `${pm.w.m} × ${pm.h.m}`, ft: `${pm.w.ft} × ${pm.h.ft}` })}
          <br />
          <strong>{fmt(t.wallSize, { m: `${wm.m} × ${hm.m}`, ft: `${wm.ft} × ${hm.ft}` })}</strong>
        </p>

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
            <button type="button" className="link small" onClick={() => set({ logo: null })}>
              {t.remove}
            </button>
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
                  <input
                    type="number"
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

      <section className="pat-main">
        <div className="pat-head">
          <div>
            <strong className="num">{fmt(t.size, { w: W.toLocaleString("en-US"), h: H.toLocaleString("en-US") })}</strong>
            <span className="muted small">
              {" "}
              · {fmt(t.panels, { n: s.cols * s.rows })} · {wm.m} × {hm.m} · {wm.ft} × {hm.ft}
            </span>
          </div>
          <button type="button" className="btn primary" onClick={download} disabled={tooBig}>
            ↓ {t.download}
          </button>
        </div>
        {askAccount && !signedIn && <AccountNeeded />}
        {tooBig ? <p className="auth-err">{t.tooBig}</p> : <canvas
            ref={canvas}
            className="pat-canvas"
            style={{ cursor }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />}
        {!tooBig && <p className="muted small">{t.dragHint}</p>}
      </section>
    </div>
  );
}

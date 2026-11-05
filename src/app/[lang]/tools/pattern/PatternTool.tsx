"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/I18n";
import { fmt } from "@/lib/i18n/config";

/** Common LED panels: pixels per cabinet. Pitch and cabinet size decide it, so "Custom" covers the rest. */
const PANELS = [
  { name: "2.6 mm · 500 × 500", w: 192, h: 192 },
  { name: "2.9 mm · 500 × 500", w: 168, h: 168 },
  { name: "ROE BP2 · 500 × 500", w: 176, h: 176 },
  { name: "3.9 mm · 500 × 500", w: 128, h: 128 },
  { name: "3.9 mm · 500 × 1000", w: 128, h: 256 },
  { name: "4.8 mm · 500 × 500", w: 104, h: 104 },
  { name: "5.9 mm · 600 × 1200", w: 104, h: 208 },
];

const MAX_SIDE = 16384;
const STORE_KEY = "sg_pattern";

type Style = "checker" | "grid" | "solid";

interface Settings {
  cols: number;
  rows: number;
  pw: number;
  ph: number;
  style: Style;
  a: string;
  b: string;
  line: string;
  ink: string;
  name: string;
  numbers: boolean;
  borders: boolean;
  circle: boolean;
  diagonals: boolean;
  ramp: boolean;
  bars: boolean;
}

const START: Settings = {
  cols: 16,
  rows: 9,
  pw: 176,
  ph: 176,
  style: "checker",
  a: "#1d3557",
  b: "#2a6f97",
  line: "#ffffff",
  ink: "#ffffff",
  name: "",
  numbers: true,
  borders: true,
  circle: true,
  diagonals: true,
  ramp: true,
  bars: true,
};

/** A1, B1 … Z1, AA1: columns as letters, rows as numbers, the way LED crews call panels. */
const colName = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : colName(Math.floor(i / 26) - 1) + colName(i % 26));

/** Draws the pattern at the wall's exact pixel size: every panel edge falls on a whole pixel. */
function draw(ctx: CanvasRenderingContext2D, s: Settings) {
  const W = s.cols * s.pw;
  const H = s.rows * s.ph;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = s.style === "grid" || s.style === "solid" ? s.a : s.a;
  ctx.fillRect(0, 0, W, H);
  if (s.style === "checker") {
    ctx.fillStyle = s.b;
    for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) if ((r + c) % 2) ctx.fillRect(c * s.pw, r * s.ph, s.pw, s.ph);
  }

  // bands across the middle: color bars above, a gray ramp below, each a third of a panel tall at least
  const band = Math.max(Math.round(H / 12), Math.min(s.ph, 64));
  if (s.bars) {
    const colors = ["#ffffff", "#ffff00", "#00ffff", "#00ff00", "#ff00ff", "#ff0000", "#0000ff", "#000000"];
    const y = Math.round(H / 2 - band * 1.5);
    colors.forEach((c, i) => {
      const x0 = Math.round((W * i) / colors.length);
      const x1 = Math.round((W * (i + 1)) / colors.length);
      ctx.fillStyle = c;
      ctx.fillRect(x0, y, x1 - x0, band);
    });
  }
  if (s.ramp) {
    const y = Math.round(H / 2 + band * 0.5);
    const steps = 11;
    for (let i = 0; i < steps; i++) {
      const v = Math.round((255 * i) / (steps - 1));
      const x0 = Math.round((W * i) / steps);
      const x1 = Math.round((W * (i + 1)) / steps);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x0, y, x1 - x0, band);
    }
  }

  ctx.strokeStyle = s.line;
  ctx.lineWidth = Math.max(1, Math.round(Math.min(W, H) / 540));
  if (s.diagonals) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(W, H);
    ctx.moveTo(W, 0);
    ctx.lineTo(0, H);
    ctx.stroke();
  }
  if (s.circle) {
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, Math.min(W, H) / 2 - ctx.lineWidth, 0, Math.PI * 2);
    ctx.stroke();
  }

  // panel edges as 1-pixel lines inside each panel, so every cabinet shows its own border
  if (s.borders || s.style === "grid") {
    ctx.fillStyle = s.style === "grid" ? s.b : s.line;
    for (let c = 0; c < s.cols; c++) {
      ctx.fillRect(c * s.pw, 0, 1, H);
      ctx.fillRect(c * s.pw + s.pw - 1, 0, 1, H);
    }
    for (let r = 0; r < s.rows; r++) {
      ctx.fillRect(0, r * s.ph, W, 1);
      ctx.fillRect(0, r * s.ph + s.ph - 1, W, 1);
    }
  }

  ctx.fillStyle = s.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (s.numbers) {
    const size = Math.max(8, Math.round(Math.min(s.pw, s.ph) / 5));
    ctx.font = `700 ${size}px system-ui, sans-serif`;
    for (let r = 0; r < s.rows; r++)
      for (let c = 0; c < s.cols; c++) ctx.fillText(`${colName(c)}${r + 1}`, c * s.pw + s.pw / 2, r * s.ph + s.ph / 2);
  }

  // name and size in the middle, on a dark plate so they read over anything
  const lines = [s.name.trim(), `${W} × ${H} px · ${s.cols} × ${s.rows} · ${s.pw} × ${s.ph}`].filter(Boolean);
  const big = Math.max(12, Math.round(Math.min(W / 22, H / 9)));
  ctx.font = `800 ${big}px system-ui, sans-serif`;
  const widths = lines.map((l, i) => {
    ctx.font = `${i === 0 && s.name.trim() ? 800 : 600} ${i === 0 && s.name.trim() ? big : Math.round(big * 0.55)}px system-ui, sans-serif`;
    return ctx.measureText(l).width;
  });
  const plateW = Math.min(W, Math.max(...widths) + big);
  const plateH = (s.name.trim() ? big * 1.25 : 0) + big * 0.9;
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.fillRect(Math.round(W / 2 - plateW / 2), Math.round(H / 2 - plateH / 2), Math.round(plateW), Math.round(plateH));
  ctx.fillStyle = s.ink;
  let y = H / 2 - plateH / 2 + big * 0.2;
  lines.forEach((l, i) => {
    const isName = i === 0 && !!s.name.trim();
    const size = isName ? big : Math.round(big * 0.55);
    ctx.font = `${isName ? 800 : 600} ${size}px system-ui, sans-serif`;
    y += isName ? big * 0.55 : size * 0.8;
    ctx.fillText(l, W / 2, y);
    y += isName ? big * 0.6 : size;
  });
}

export function PatternTool() {
  const t = useT().pattern;
  const [s, setS] = useState<Settings>(START);
  const [loaded, setLoaded] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const W = s.cols * s.pw;
  const H = s.rows * s.ph;
  const tooBig = W > MAX_SIDE || H > MAX_SIDE;
  const set = (patch: Partial<Settings>) => setS((x) => ({ ...x, ...patch }));
  const preset = PANELS.findIndex((p) => p.w === s.pw && p.h === s.ph);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time load from localStorage
      if (saved && typeof saved === "object") setS({ ...START, ...saved });
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
      // storage blocked
    }
  }, [loaded, s]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || tooBig) return;
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    if (ctx) draw(ctx, s);
  }, [s, W, H, tooBig]);

  const download = () =>
    canvas.current?.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${(s.name.trim() || "led-test-pattern").replace(/[^\w-]+/g, "-")}-${W}x${H}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, "image/png");

  const num = (v: string, max: number) => Math.max(1, Math.min(max, Math.round(Number(v) || 1)));
  const check = (k: keyof Settings, label: string) => (
    <label className="pat-check">
      <input type="checkbox" checked={Boolean(s[k])} onChange={(e) => set({ [k]: e.target.checked } as Partial<Settings>)} />
      {label}
    </label>
  );

  return (
    <div className="pat-tool">
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
          <select value={preset} onChange={(e) => Number(e.target.value) >= 0 && set({ pw: PANELS[Number(e.target.value)].w, ph: PANELS[Number(e.target.value)].h })}>
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
        </div>

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

        <h2>{t.show}</h2>
        <div className="pat-checks">
          {check("numbers", t.numbers)}
          {check("borders", t.lines)}
          {check("circle", t.circle)}
          {check("diagonals", t.diagonals)}
          {check("bars", t.colorBars)}
          {check("ramp", t.gradient)}
        </div>
      </aside>

      <section className="pat-main">
        <div className="pat-head">
          <div>
            <strong className="num">{fmt(t.size, { w: W.toLocaleString("en-US"), h: H.toLocaleString("en-US") })}</strong>
            <span className="muted small">
              {" "}
              · {fmt(t.panels, { n: s.cols * s.rows })}
            </span>
          </div>
          <button type="button" className="btn primary" onClick={download} disabled={tooBig}>
            ↓ {t.download}
          </button>
        </div>
        {tooBig ? <p className="auth-err">{t.tooBig}</p> : <canvas ref={canvas} className="pat-canvas" />}
      </section>
    </div>
  );
}

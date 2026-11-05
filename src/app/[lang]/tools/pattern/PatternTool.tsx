"use client";

import { useEffect, useRef, useState } from "react";
import { AccountNeeded, useSignedIn } from "@/components/AccountGate";
import { useT } from "@/components/I18n";
import { fmt } from "@/lib/i18n/config";

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

type Style = "checker" | "grid" | "solid";
type LogoAt = "center" | "tl" | "tr" | "bl" | "br" | "each" | "custom";

/** A window on the wall for a piece of content: camera, IMAG, a video… in wall pixels. */
interface Pip {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  /** a frame of the content, shown inside the window */
  img: string | null;
}

interface Settings {
  cols: number;
  rows: number;
  pw: number;
  ph: number;
  /** panel size in millimetres */
  mw: number;
  mh: number;
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
  pips: Pip[];
  logo: string | null;
  logoAt: LogoAt;
  /** logo height, as a share of the wall height (or of a panel, on every panel) */
  logoSize: number;
  /** where the logo was dragged to (its centre, in wall pixels), for logoAt "custom" */
  logoX?: number;
  logoY?: number;
  /** where the title plate was dragged to (its centre); unset keeps it in the middle */
  titleX?: number | null;
  titleY?: number | null;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What can be grabbed on the canvas, from the last drawing. */
interface Hits {
  plate: Rect;
  logo: Rect | null;
}

const START: Settings = {
  cols: 16,
  rows: 9,
  pw: 176,
  ph: 176,
  mw: 500,
  mh: 500,
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
  pips: [],
  logo: null,
  logoAt: "tr",
  logoSize: 0.18,
};

const PIP_COLORS = ["#ffcc00", "#ff3b3b", "#35d07f", "#3fa9ff", "#ff7ad9"];
const uid = () => Math.random().toString(36).slice(2, 9);

/** A1, B1 … Z1, AA1: columns as letters, rows as numbers, the way LED crews call panels. */
const colName = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : colName(Math.floor(i / 26) - 1) + colName(i % 26));

/** 4.5 m · 14' 9" */
function wallLen(mm: number) {
  const m = mm / 1000;
  const inches = mm / 25.4;
  const ft = Math.floor(inches / 12);
  const inch = Math.round(inches - ft * 12);
  return { m: `${m.toFixed(m < 10 ? 2 : 1)} m`, ft: inch === 12 ? `${ft + 1}'` : `${ft}' ${inch}"` };
}

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

/** Draws the pattern at the wall's exact pixel size: every panel edge falls on a whole pixel. */
function draw(ctx: CanvasRenderingContext2D, s: Settings, images: Map<string, HTMLImageElement>): Hits {
  const W = s.cols * s.pw;
  const H = s.rows * s.ph;
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = s.a;
  ctx.fillRect(0, 0, W, H);
  if (s.style === "checker") {
    ctx.fillStyle = s.b;
    for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) if ((r + c) % 2) ctx.fillRect(c * s.pw, r * s.ph, s.pw, s.ph);
  }

  // bands across the middle: color bars above, a gray ramp below
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

  const stroke = Math.max(1, Math.round(Math.min(W, H) / 540));
  ctx.strokeStyle = s.line;
  ctx.lineWidth = stroke;
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
    ctx.arc(W / 2, H / 2, Math.min(W, H) / 2 - stroke, 0, Math.PI * 2);
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

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (s.numbers) {
    ctx.fillStyle = s.ink;
    const size = Math.max(8, Math.round(Math.min(s.pw, s.ph) / 5));
    ctx.font = `700 ${size}px system-ui, sans-serif`;
    for (let r = 0; r < s.rows; r++)
      for (let c = 0; c < s.cols; c++) ctx.fillText(`${colName(c)}${r + 1}`, c * s.pw + s.pw / 2, r * s.ph + s.ph / 2);
  }

  // content windows: the picture (or a tint), a thick frame, and the name with its pixel size
  for (const p of s.pips) {
    const img = p.img ? images.get(p.img) : undefined;
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.x, p.y, p.w, p.h);
    ctx.clip();
    if (img) {
      // cover the window, centred
      const k = Math.max(p.w / img.width, p.h / img.height);
      ctx.drawImage(img, p.x + (p.w - img.width * k) / 2, p.y + (p.h - img.height * k) / 2, img.width * k, img.height * k);
    } else {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(p.x, p.y, p.w, p.h);
    }
    ctx.restore();
    const fw = Math.max(2, stroke * 3);
    ctx.strokeStyle = p.color;
    ctx.lineWidth = fw;
    ctx.strokeRect(p.x + fw / 2, p.y + fw / 2, p.w - fw, p.h - fw);
    const tag = Math.max(10, Math.round(Math.min(p.h / 8, p.w / 14)));
    const text = `${p.name || "PIP"} · ${p.w}×${p.h} @ ${p.x},${p.y}`;
    ctx.font = `700 ${tag}px system-ui, sans-serif`;
    const tw = Math.min(p.w - fw * 2, ctx.measureText(text).width + tag);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x + fw, p.y + fw, tw, tag * 1.5);
    ctx.fillStyle = "#000";
    ctx.textAlign = "left";
    ctx.fillText(text, p.x + fw + tag / 2, p.y + fw + tag * 0.78, tw - tag);
    ctx.textAlign = "center";
  }

  // name, sizes in pixels, metres and feet, on a dark plate so they read over anything
  const wm = wallLen(s.cols * s.mw);
  const hm = wallLen(s.rows * s.mh);
  const lines = [
    s.name.trim(),
    `${W} × ${H} px · ${s.cols} × ${s.rows} · ${s.pw} × ${s.ph}`,
    `${wm.m} × ${hm.m} · ${wm.ft} × ${hm.ft}`,
  ].filter(Boolean);
  const big = Math.max(12, Math.round(Math.min(W / 22, H / 9)));
  const small = Math.round(big * 0.5);
  const isName = (i: number) => i === 0 && !!s.name.trim();
  const widths = lines.map((l, i) => {
    ctx.font = `${isName(i) ? 800 : 600} ${isName(i) ? big : small}px system-ui, sans-serif`;
    return ctx.measureText(l).width;
  });
  const plateW = Math.min(W, Math.max(...widths) + big);
  const plateH = lines.reduce((a, _, i) => a + (isName(i) ? big * 1.2 : small * 1.45), 0) + small;
  const tx = s.titleX ?? W / 2;
  const ty = s.titleY ?? H / 2;
  const plate = { x: Math.round(tx - plateW / 2), y: Math.round(ty - plateH / 2), w: Math.round(plateW), h: Math.round(plateH) };
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.fillRect(plate.x, plate.y, plate.w, plate.h);
  ctx.fillStyle = s.ink;
  let y = ty - plateH / 2 + small / 2;
  lines.forEach((l, i) => {
    const h = isName(i) ? big * 1.2 : small * 1.45;
    ctx.font = `${isName(i) ? 800 : 600} ${isName(i) ? big : small}px system-ui, sans-serif`;
    ctx.fillText(l, tx, y + h / 2);
    y += h;
  });
  let logoHit: Rect | null = null;

  // the logo last, so it sits on top of everything
  const logo = s.logo ? images.get(s.logo) : undefined;
  if (logo) {
    const put = (cx: number, cy: number, maxH: number, maxW: number) => {
      const k = Math.min(maxH / logo.height, maxW / logo.width);
      const r = { x: Math.round(cx - (logo.width * k) / 2), y: Math.round(cy - (logo.height * k) / 2), w: Math.round(logo.width * k), h: Math.round(logo.height * k) };
      ctx.drawImage(logo, r.x, r.y, r.w, r.h);
      return r;
    };
    if (s.logoAt === "each") {
      // above the panel number
      const lh = s.ph * Math.min(0.5, s.logoSize * 2);
      for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) put(c * s.pw + s.pw / 2, r * s.ph + s.ph * 0.28, lh, s.pw * 0.8);
    } else {
      const lh = H * s.logoSize;
      const lw = W * 0.4;
      const m = Math.max(s.ph * 0.25, lh * 0.25);
      const at = {
        custom: [s.logoX ?? W / 2, s.logoY ?? H / 4],
        center: [W / 2, H / 2 - plateH / 2 - lh / 2 - m / 2],
        tl: [m + lw / 2, m + lh / 2],
        tr: [W - m - lw / 2, m + lh / 2],
        bl: [m + lw / 2, H - m - lh / 2],
        br: [W - m - lw / 2, H - m - lh / 2],
      }[s.logoAt];
      // in a corner, hug the edge rather than the middle of the 40% box
      const k = Math.min(lh / logo.height, lw / logo.width);
      const dw = logo.width * k;
      const cx = s.logoAt === "tl" || s.logoAt === "bl" ? m + dw / 2 : s.logoAt === "tr" || s.logoAt === "br" ? W - m - dw / 2 : at[0];
      logoHit = put(cx, at[1], lh, lw);
    }
  }
  return { plate, logo: logoHit };
}

export function PatternTool() {
  const t = useT().pattern;
  const [s, setS] = useState<Settings>(START);
  const [loaded, setLoaded] = useState(false);
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
      // storage full or blocked: the pictures just won't be kept
    }
  }, [loaded, s]);

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

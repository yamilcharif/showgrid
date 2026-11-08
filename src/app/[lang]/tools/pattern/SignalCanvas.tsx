"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface ZoomLabels {
  zoomIn: string;
  zoomOut: string;
  fit: string;
  actual: string;
  hint: string;
}

/** What the wiring reports back: a cable from an output to an input or a screen, or one taken away. */
export interface Wiring {
  /** from "dev:out" to "dev:in" or "screen:<id>" */
  connect: (from: string, to: string) => void;
  remove: (linkId: string) => void;
  /** the cable already plugged into an input or leaving an output, to pick it up again */
  linkAt: (end: { to?: string; from?: string }) => { id: string; from: string } | undefined;
}

const MIN = 0.15;
const MAX = 4;
const clamp = (k: number) => Math.min(MAX, Math.max(MIN, k));

/** "o|dev|2" → "dev:2", "s|id" → "screen:id" */
const keyOf = (port: string) => {
  const [side, a, b] = port.split("|");
  return { side, key: side === "s" ? `screen:${a}` : `${a}:${b}` };
};

/**
 * A drawing you can zoom (wheel, pinch, buttons) and move around (drag the background).
 * With wiring, it also works like a node editor: drag from an output to an input to cable them,
 * grab the end of a cable to move it, drop it in the open to take it away.
 */
export function ZoomSheet({ svg, w, h, labels, wiring, className, maxH = 0.7 }: { svg: string; w: number; h: number; labels: ZoomLabels; wiring?: Wiring; className?: string; maxH?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(0);
  const [view, setView] = useState({ k: 1, x: 0, y: 0, auto: true });
  const [drag, setDrag] = useState<{ from: string; a: { x: number; y: number }; b: { x: number; y: number }; moving?: string } | null>(null);
  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; k: number } | null>(null);
  const [vh, setVh] = useState(800);
  // tall enough for the drawing at full width, never taller than most of the screen
  const ch = Math.round(Math.max(240, Math.min(vh * maxH, cw ? h * Math.min(1, cw / w) : 400)));

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setCw(el.clientWidth);
      setVh(window.innerHeight);
    });
    ro.observe(el);
    setCw(el.clientWidth);
    setVh(window.innerHeight);
    return () => ro.disconnect();
  }, []);

  const fitView = (cwNow = cw, chNow = ch) => {
    const k = clamp(Math.min(cwNow / w, chNow / h, 1.5));
    return { k, x: (cwNow - w * k) / 2, y: Math.max(0, (chNow - h * k) / 2), auto: true };
  };
  // until the user zooms, the drawing keeps fitting the box as it grows
  useEffect(() => {
    if (!cw || !view.auto) return;
    const next = fitView();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follows the drawing's size while untouched
    if (next.k !== view.k || next.x !== view.x || next.y !== view.y) setView(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cw, ch, w, h, view.auto]);

  /** Zoom by a factor, keeping the point under (px, py) where it is. */
  const zoomAt = (f: number, px: number, py: number) =>
    setView((v) => {
      const k = clamp(v.k * f);
      const r = k / v.k;
      return { k, x: px - (px - v.x) * r, y: py - (py - v.y) * r, auto: false };
    });

  // the wheel needs a non-passive listener to keep the page from scrolling
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        // sideways on a trackpad moves the drawing
        setView((v) => ({ ...v, x: v.x - e.deltaX, auto: false }));
        return;
      }
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /** Screen point → drawing point. */
  const toSheet = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.x) / view.k, y: (e.clientY - r.top - view.y) / view.k };
  };
  const portXY = (port: string) => {
    const c = box.current?.querySelector(`[data-port="${CSS.escape(port)}"]`);
    return c ? { x: Number(c.getAttribute("cx")), y: Number(c.getAttribute("cy")) } : null;
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const el = e.currentTarget;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.current.size === 2) {
      // two fingers: pinch to zoom
      const [p, q] = [...touches.current.values()];
      pinch.current = { d: Math.hypot(p.x - q.x, p.y - q.y), k: view.k };
      pan.current = null;
      setDrag(null);
      return;
    }
    const target = e.target as Element;
    const port = wiring && target.closest?.("[data-port]")?.getAttribute("data-port");
    if (port && wiring) {
      const { side, key } = keyOf(port);
      if (side === "o") {
        // from an output: a new cable (or this output's cable, moved)
        const a = portXY(port);
        if (a) {
          el.setPointerCapture(e.pointerId);
          setDrag({ from: key, a, b: toSheet(e), moving: wiring.linkAt({ from: key })?.id });
          return;
        }
      } else if (side === "i") {
        // from an input with a cable in it: pull that end out and carry it somewhere else
        const l = wiring.linkAt({ to: key });
        const [dev, i] = [l?.from.slice(0, l.from.lastIndexOf(":")), l?.from.slice(l.from.lastIndexOf(":") + 1)];
        const a = l && portXY(`o|${dev}|${i}`);
        if (l && a) {
          el.setPointerCapture(e.pointerId);
          setDrag({ from: l.from, a, b: toSheet(e), moving: l.id });
          return;
        }
      }
    }
    el.setPointerCapture(e.pointerId);
    pan.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && touches.current.size === 2) {
      const [p, q] = [...touches.current.values()];
      const r = box.current!.getBoundingClientRect();
      const f = (pinch.current.k * Math.hypot(p.x - q.x, p.y - q.y)) / pinch.current.d / view.k;
      zoomAt(f, (p.x + q.x) / 2 - r.left, (p.y + q.y) / 2 - r.top);
      return;
    }
    if (drag) return setDrag({ ...drag, b: toSheet(e) });
    const p = pan.current;
    if (p) setView((v) => ({ ...v, x: p.vx + e.clientX - p.x, y: p.vy + e.clientY - p.y, auto: false }));
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    touches.current.delete(e.pointerId);
    if (touches.current.size < 2) pinch.current = null;
    pan.current = null;
    if (!drag || !wiring) return;
    setDrag(null);
    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("[data-port]")?.getAttribute("data-port");
    const end = hit ? keyOf(hit) : null;
    const devOf = (k: string) => k.slice(0, k.lastIndexOf(":"));
    if (end && (end.side === "i" || end.side === "s") && (end.side === "s" || devOf(end.key) !== devOf(drag.from))) wiring.connect(drag.from, end.key);
    // a cable let go in the open is unplugged
    else if (drag.moving && !(end && end.side === "o")) wiring.remove(drag.moving);
  };
  const onDouble = (e: React.MouseEvent) => {
    // the press captured the pointer, so the event's own target is the box: look at what's under the mouse
    const id = wiring && document.elementFromPoint(e.clientX, e.clientY)?.closest?.("[data-link]")?.getAttribute("data-link");
    if (id) wiring.remove(id);
  };

  const center = () => ({ x: cw / 2, y: ch / 2 });
  const pct = Math.round(view.k * 100);
  const live = drag && (() => {
    const { a, b } = drag;
    const dx = Math.max(40, Math.abs(b.x - a.x) * 0.45);
    return `M${a.x} ${a.y} C${a.x + dx} ${a.y} ${b.x - dx} ${b.y} ${b.x} ${b.y}`;
  })();

  return (
    <div className={`sig-zoom${drag ? " wiring" : ""}${wiring ? " can-wire" : ""}${className ? ` ${className}` : ""}`}>
      <div className="sig-zoom-bar" role="toolbar">
        <button type="button" className="btn sm" title={labels.zoomOut} aria-label={labels.zoomOut} onClick={() => zoomAt(1 / 1.25, center().x, center().y)}>
          −
        </button>
        <button type="button" className="btn sm sig-pct" title={labels.actual} aria-label={labels.actual} onClick={() => zoomAt(1 / view.k, center().x, center().y)}>
          {pct}%
        </button>
        <button type="button" className="btn sm" title={labels.zoomIn} aria-label={labels.zoomIn} onClick={() => zoomAt(1.25, center().x, center().y)}>
          +
        </button>
        <button type="button" className="btn sm" onClick={() => setView(fitView())}>
          ⤢ {labels.fit}
        </button>
        <span className="muted small sig-zoom-hint">{labels.hint}</span>
      </div>
      <div
        ref={box}
        className="sig-zoom-box"
        style={{ height: ch, cursor: drag ? "crosshair" : undefined }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={onDouble}
      >
        <div className="sig-zoom-sheet" style={{ width: w, height: h, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          <div dangerouslySetInnerHTML={{ __html: svg }} />
          {live && (
            <svg className="sig-live" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
              <path d={live} fill="none" stroke="#2563eb" strokeWidth={2.5} strokeDasharray="6 4" />
              <circle cx={drag!.b.x} cy={drag!.b.y} r={5} fill="#2563eb" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}

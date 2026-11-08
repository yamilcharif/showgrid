"use client";

import { useMemo, type ReactNode } from "react";
import type { Dict } from "@/lib/i18n/en";
import { fmt } from "@/lib/i18n/config";
import type { OutputMap, PatternSettings, SavedScreen } from "@/lib/pattern";
import {
  CABLES,
  CABLE_COLORS,
  KINDS,
  PORT_PX,
  SIGNAL_START,
  draftFromOutput,
  newDevice,
  portsNeeded,
  rackSlots,
  rackSvg,
  signalCheck,
  signalSvg,
  svgPdf,
  svgPng,
  type Cable,
  type DeviceKind,
  type SigDevice,
  type SignalFlow,
  type SigLink,
} from "@/lib/signal";
import { ZoomSheet, type Wiring } from "./SignalCanvas";

type T = Dict["ledSignal"];
const uid = () => Math.random().toString(36).slice(2, 9);
const fileSafe = (s: string) => s.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "") || "signal";
const names = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 64);

const labels = (t: T) => ({
  flow: { title: t.flowTitle, kinds: t.kinds, load: t.load, map: t.map, ports: t.portsWord, legend: t.legend, empty: t.flowEmpty },
  rack: { title: t.rackTitle, kinds: t.kinds, over: t.rackOver, empty: t.rackEmpty },
});

/** The diagram and the rack as files: PNG and PDF of each. */
export function signalFiles(flow: SignalFlow, library: SavedScreen[], output: OutputMap | undefined, t: T, title: string) {
  const L = labels(t);
  const base = fileSafe(title || "showgrid");
  const flowFile = (pdf: boolean) => async () => {
    const d = signalSvg(flow, library, output, L.flow, title);
    const blob = pdf ? await svgPdf(d.svg, d.w, d.h) : await svgPng(d.svg, d.w, d.h);
    return blob ? { blob, name: `${base}-signal-flow.${pdf ? "pdf" : "png"}` } : null;
  };
  const rackFile = (pdf: boolean) => async () => {
    const d = rackSvg(flow, L.rack, title);
    const blob = pdf ? await svgPdf(d.svg, d.w, d.h) : await svgPng(d.svg, d.w, d.h);
    return blob ? { blob, name: `${base}-${fileSafe(flow.rackName || "rack")}.${pdf ? "pdf" : "png"}` } : null;
  };
  return {
    download: flowFile(false),
    more: [
      { label: t.dlFlowPdf, build: flowFile(true) },
      { label: t.dlRackPng, build: rackFile(false) },
      { label: t.dlRackPdf, build: rackFile(true) },
    ],
  };
}

export function SignalView({
  s,
  setS,
  t,
  library,
  output,
  tabs,
  title,
}: {
  s: PatternSettings;
  setS: (f: (x: PatternSettings) => PatternSettings) => void;
  t: T;
  library: SavedScreen[];
  output: OutputMap | undefined;
  tabs: ReactNode;
  title: string;
}) {
  const flow = s.signal ?? SIGNAL_START;
  const setFlow = (f: (x: SignalFlow) => SignalFlow) => setS((x) => ({ ...x, signal: f(x.signal ?? SIGNAL_START) }));
  const setDev = (id: string, patch: Partial<SigDevice>) =>
    setFlow((x) => {
      const devices = x.devices.map((d) => (d.id === id ? { ...d, ...patch } : d));
      const dev = devices.find((d) => d.id === id)!;
      // cables on ports that no longer exist go with them
      const links = x.links.filter((l) => {
        const [fd, fi] = [l.from.slice(0, l.from.lastIndexOf(":")), Number(l.from.slice(l.from.lastIndexOf(":") + 1))];
        if (fd === id && fi >= dev.outs.length) return false;
        if (!l.to.startsWith("screen:")) {
          const [td, ti] = [l.to.slice(0, l.to.lastIndexOf(":")), Number(l.to.slice(l.to.lastIndexOf(":") + 1))];
          if (td === id && ti >= dev.ins.length) return false;
        }
        return true;
      });
      return { ...x, devices, links };
    });
  const L = useMemo(() => labels(t), [t]);
  const flowDraw = useMemo(() => signalSvg(flow, library, output, L.flow, title), [flow, library, output, L.flow, title]);
  const rackDraw = useMemo(() => rackSvg(flow, L.rack, title), [flow, L.rack, title]);
  const check = useMemo(() => signalCheck(flow, library, output), [flow, library, output]);
  const devName = (id: string) => flow.devices.find((d) => d.id === id)?.name ?? "?";
  const scrName = (id: string) => {
    const sc = library.find((l) => l.id === id);
    return sc ? sc.s.name.trim() || sc.name : "?";
  };
  const slots = rackSlots(flow);
  const usedU = slots.reduce((a, x) => a + x.dev.u, 0);

  const add = (kind: DeviceKind) => setFlow((x) => ({ ...x, devices: [...x.devices, newDevice(kind, uid(), x.devices.filter((d) => d.kind === kind).length + 1, t.kinds[kind])] }));
  const remove = (id: string) => setFlow((x) => ({ ...x, devices: x.devices.filter((d) => d.id !== id), links: x.links.filter((l) => !l.from.startsWith(`${id}:`) && !l.to.startsWith(`${id}:`)) }));
  const move = (id: string, by: number) =>
    setFlow((x) => {
      const i = x.devices.findIndex((d) => d.id === id);
      const j = i + by;
      if (i < 0 || j < 0 || j >= x.devices.length) return x;
      const devices = [...x.devices];
      [devices[i], devices[j]] = [devices[j], devices[i]];
      return { ...x, devices };
    });
  const linkOf = (from: string) => flow.links.find((l) => l.from === from);
  const setLink = (from: string, patch: Partial<SigLink> | null) =>
    setFlow((x) => {
      const now = x.links.find((l) => l.from === from);
      if (!patch || patch.to === "") return { ...x, links: x.links.filter((l) => l.from !== from) };
      if (now) return { ...x, links: x.links.map((l) => (l.from === from ? { ...l, ...patch } : l)) };
      if (!patch.to) return x;
      // a new cable: the usual type for where it goes
      const fromDev = x.devices.find((d) => from.startsWith(`${d.id}:`));
      const cable: Cable = patch.to.startsWith("screen:") || fromDev?.kind === "processor" ? "Cat6" : fromDev?.kind === "fiber" ? "Fiber" : "HDMI";
      return { ...x, links: [...x.links, { id: uid(), from, to: patch.to, cable, ...patch }] };
    });
  // the node editor: cables drawn by dragging on the diagram
  const wiring: Wiring = {
    connect: (from, to) =>
      setFlow((x) => {
        const fromDev = x.devices.find((d) => from.startsWith(`${d.id}:`));
        const now = x.links.find((l) => l.from === from);
        const cable: Cable = now?.cable ?? (to.startsWith("screen:") || fromDev?.kind === "processor" ? "Cat6" : fromDev?.kind === "fiber" ? "Fiber" : "HDMI");
        // an input takes one cable (a screen can take several); the new one pushes the old one out
        const links = x.links.filter((l) => l.from !== from && (to.startsWith("screen:") || l.to !== to));
        return { ...x, links: [...links, { id: now?.id ?? uid(), from, to, cable, m: now?.m ?? null }] };
      }),
    remove: (id) => setFlow((x) => ({ ...x, links: x.links.filter((l) => l.id !== id) })),
    linkAt: ({ to, from }) => flow.links.find((l) => (to ? l.to === to : l.from === from)),
  };
  const zoomLabels = { zoomIn: t.zoomIn, zoomOut: t.zoomOut, fit: t.zoomFit, actual: t.zoomActual, hint: t.zoomHint };
  const draft = () => {
    if (!output?.items.length) return;
    if (flow.devices.length && !window.confirm(t.draftAsk)) return;
    setFlow((x) => ({ ...draftFromOutput(output, library, uid, t.kinds), rackName: x.rackName, rackU: x.rackU }));
  };
  // inputs already taken by another cable
  const taken = new Map(flow.links.map((l) => [l.to, l.from]));

  const problemText = check.problems.map((p) => {
    switch (p.kind) {
      case "port": {
        const d = flow.devices.find((x) => x.id === p.dev);
        return fmt(t.warnPort, { dev: devName(p.dev), port: d?.outs[p.port] ?? p.port + 1, px: p.px.toLocaleString("en-US"), max: p.max.toLocaleString("en-US") });
      }
      case "total":
        return fmt(t.warnTotal, { dev: devName(p.dev), px: p.px.toLocaleString("en-US"), max: p.max.toLocaleString("en-US") });
      case "short":
        return fmt(t.warnShort, { screen: scrName(p.screen), n: p.ports, need: p.need });
      case "unfed":
        return fmt(t.warnUnfed, { screen: scrName(p.screen) });
    }
  });

  return (
    <>
      <aside className="auth-form pat-side">
        <h2>{t.title}</h2>
        <p className="muted small">{t.hint}</p>
        {output?.items.length ? (
          <button type="button" className="btn sm" onClick={draft}>
            ⚡ {t.draft}
          </button>
        ) : (
          <p className="muted small">{t.draftNeedsOutput}</p>
        )}

        <h2>{t.devices}</h2>
        {flow.devices.map((d, i) => (
          <div key={d.id} className="pat-pip sig-dev" style={{ borderColor: d.kind === "server" ? "#6d7cff" : d.kind === "processor" ? "#35d07f" : "var(--line)" }}>
            <div className="pat-pip-head">
              <input value={d.name} maxLength={40} aria-label={t.name} onChange={(e) => setDev(d.id, { name: e.target.value })} />
              <span className="sig-acts">
                <button type="button" className="link small" title={t.up} aria-label={`${t.up}: ${d.name}`} disabled={i === 0} onClick={() => move(d.id, -1)}>
                  ↑
                </button>
                <button type="button" className="link small" title={t.down} aria-label={`${t.down}: ${d.name}`} disabled={i === flow.devices.length - 1} onClick={() => move(d.id, 1)}>
                  ↓
                </button>
                <button type="button" className="link small" title={t.remove} aria-label={`${t.remove}: ${d.name}`} onClick={() => remove(d.id)}>
                  ✕
                </button>
              </span>
            </div>
            <span className="muted small sig-kind">{t.kinds[d.kind]}</span>
            <div className="pat-two">
              <label className="field">
                <span>{t.model}</span>
                <input value={d.model} maxLength={40} placeholder={t.modelPh} onChange={(e) => setDev(d.id, { model: e.target.value })} />
              </label>
              <label className="field">
                <span>{t.rackUnits}</span>
                <input type="number" min={0} max={12} value={d.u} onChange={(e) => setDev(d.id, { u: Math.max(0, Math.min(12, Math.round(Number(e.target.value) || 0))) })} />
              </label>
            </div>
            {d.kind === "processor" && (
              <div className="pat-two">
                <label className="field">
                  <span>{t.portCount}</span>
                  <input
                    type="number"
                    min={1}
                    max={64}
                    value={d.outs.length}
                    onChange={(e) => {
                      const n = Math.max(1, Math.min(64, Math.round(Number(e.target.value) || 1)));
                      setDev(d.id, { outs: Array.from({ length: n }, (_, k) => d.outs[k] ?? `P${k + 1}`) });
                    }}
                  />
                </label>
                <label className="field">
                  <span>{t.portPx}</span>
                  <input type="number" min={1} step={1000} value={d.portPx ?? PORT_PX} onChange={(e) => setDev(d.id, { portPx: Math.max(1, Math.round(Number(e.target.value) || PORT_PX)) })} />
                </label>
                <label className="field">
                  <span>{t.maxPx}</span>
                  <input type="number" min={0} step={1000} value={d.maxPx ?? 0} onChange={(e) => setDev(d.id, { maxPx: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                </label>
                <span className="muted small sig-load">
                  {t.load} {Math.round(check.total.get(d.id) ?? 0).toLocaleString("en-US")} px
                </span>
              </div>
            )}
            {d.kind !== "server" && (
              <label className="field">
                <span>{t.ins}</span>
                <input defaultValue={d.ins.join(", ")} key={d.ins.join(",")} onBlur={(e) => setDev(d.id, { ins: names(e.target.value) })} />
              </label>
            )}
            {d.kind !== "processor" && (
              <label className="field">
                <span>{d.kind === "server" ? t.serverOuts : t.outs}</span>
                <input defaultValue={d.outs.join(", ")} key={d.outs.join(",")} onBlur={(e) => setDev(d.id, { outs: names(e.target.value) })} />
              </label>
            )}
            {d.kind === "server" && output && (
              <label className="field">
                <span>{fmt(t.mapOn, { name: output.name || "Output", w: output.w, h: output.h })}</span>
                <select value={d.mapOut ?? ""} onChange={(e) => setDev(d.id, { mapOut: e.target.value === "" ? null : Number(e.target.value) })}>
                  <option value="">—</option>
                  {d.outs.map((o, k) => (
                    <option key={k} value={k}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {d.outs.length > 0 && (
              <div className="sig-links">
                <span className="muted small">{t.cables}</span>
                {d.outs.map((o, k) => {
                  const from = `${d.id}:${k}`;
                  const l = linkOf(from);
                  const px = check.load.get(from);
                  const over = d.kind === "processor" && px != null && px > (d.portPx || PORT_PX);
                  return (
                    <div key={k} className={over ? "sig-link bad" : "sig-link"}>
                      <span className="sig-port" title={px ? `${Math.round(px).toLocaleString("en-US")} px` : undefined}>
                        {o}
                      </span>
                      <select aria-label={fmt(t.to, { port: o })} value={l?.to ?? ""} onChange={(e) => setLink(from, { to: e.target.value })}>
                        <option value="">{t.notConnected}</option>
                        {flow.devices
                          .filter((x) => x.id !== d.id && x.ins.length)
                          .map((x) => (
                            <optgroup key={x.id} label={x.name}>
                              {x.ins.map((n, j) => {
                                const key = `${x.id}:${j}`;
                                const busy = taken.has(key) && taken.get(key) !== from;
                                return (
                                  <option key={j} value={key} disabled={busy}>
                                    {x.name} · {n}
                                    {busy ? " ●" : ""}
                                  </option>
                                );
                              })}
                            </optgroup>
                          ))}
                        {library.length > 0 && (
                          <optgroup label={t.screens}>
                            {library.map((sc) => (
                              <option key={sc.id} value={`screen:${sc.id}`}>
                                ▭ {sc.s.name.trim() || sc.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      {l && (
                        <>
                          <select aria-label={t.cable} value={l.cable} style={{ color: CABLE_COLORS[l.cable] }} onChange={(e) => setLink(from, { cable: e.target.value as Cable })}>
                            {CABLES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min={0}
                            max={9999}
                            className="sig-m"
                            aria-label={t.length}
                            placeholder="m"
                            value={l.m ?? ""}
                            onChange={(e) => setLink(from, { m: e.target.value === "" ? null : Math.max(0, Math.min(9999, Number(e.target.value) || 0)) })}
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        <div className="sig-add">
          {KINDS.map((k) => (
            <button key={k} type="button" className="btn sm" onClick={() => add(k)} disabled={flow.devices.length >= 24}>
              + {t.kinds[k]}
            </button>
          ))}
        </div>

        <h2>{t.rackTitle}</h2>
        <div className="pat-two">
          <label className="field">
            <span>{t.rackName}</span>
            <input value={flow.rackName} maxLength={40} onChange={(e) => setFlow((x) => ({ ...x, rackName: e.target.value }))} />
          </label>
          <label className="field">
            <span>{t.rackSize}</span>
            <input type="number" min={1} max={48} value={flow.rackU} onChange={(e) => setFlow((x) => ({ ...x, rackU: Math.max(1, Math.min(48, Math.round(Number(e.target.value) || 1))) }))} />
          </label>
        </div>
        <p className="muted small">{fmt(t.rackHint, { used: usedU, total: flow.rackU })}</p>
      </aside>

      <section className="pat-main">
        {tabs}
        <div className="pat-head">
          <div>
            <strong className="num">{t.flowTitle}</strong>
            <span className="muted small">
              {" "}
              · {fmt(t.count, { n: flow.devices.length, c: flow.links.length })}
            </span>
          </div>
        </div>
        {problemText.length > 0 ? (
          <ul className="sig-warn" role="alert">
            {problemText.map((p, i) => (
              <li key={i}>⚠ {p}</li>
            ))}
          </ul>
        ) : (
          flow.links.some((l) => l.to.startsWith("screen:")) && <p className="sig-ok small">✓ {t.allGood}</p>
        )}
        <ZoomSheet svg={flowDraw.svg} w={flowDraw.w} h={flowDraw.h} labels={{ ...zoomLabels, hint: t.wireHint }} wiring={wiring} />
        {library.length > 0 && (
          <p className="muted small">
            {library
              .map((sc) => {
                const fed = check.fed.get(sc.id)?.length ?? 0;
                return `${sc.s.name.trim() || sc.name}: ${fmt(t.needs, { need: portsNeeded(sc.s), n: fed })}`;
              })
              .join(" · ")}
          </p>
        )}
        <div className="pat-head">
          <div>
            <strong className="num">{t.rackTitle}</strong>
            <span className="muted small">
              {" "}
              · {flow.rackName} · {usedU} / {flow.rackU}U
            </span>
          </div>
        </div>
        <ZoomSheet svg={rackDraw.svg} w={rackDraw.w} h={rackDraw.h} labels={zoomLabels} className="sig-rack" maxH={0.8} />
      </section>
    </>
  );
}

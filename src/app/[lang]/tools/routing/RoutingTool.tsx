"use client";

import { useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/I18n";
import { ProjectBar, useToolState } from "@/components/Projects";
import { ToolFiles } from "@/components/ToolFiles";
import { findAirport } from "@/lib/airports";
import { fmt, plural } from "@/lib/i18n/config";
import { parseTable, readTable } from "@/lib/labels";
import {
  PARTY_COLORS,
  ROUTING_START,
  fareSearchUrl,
  flightOf,
  newId,
  readStops,
  routingCsv,
  totals,
  type Cabin,
  type FlightEdit,
  type Routing,
} from "@/lib/routing";
import { money } from "@/lib/search";

const CABINS: Cabin[] = ["eco", "prem", "biz"];

/** Tour routing in, flights out: cities, parties and their class, each flight editable, totals per party. */
export function RoutingTool() {
  const { t: T, locale } = useI18n();
  const t = T.routing;
  const { state: r, setState: setR, project, saving } = useToolState<Routing>("routing", "sg_routing", ROUTING_START, (v) =>
    v && typeof v === "object" && Array.isArray((v as Routing).stops) ? { ...ROUTING_START, ...(v as Routing) } : ROUTING_START,
  );
  const set = (patch: Partial<Routing>) => setR((x) => ({ ...x, ...patch }));
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [paste, setPaste] = useState("");
  const sum = useMemo(() => totals(r), [r]);
  const usd = (n: number) => money(n, "USD");

  const load = (rows: string[][]) => {
    const stops = readStops(rows);
    if (!stops.length) return setError(t.errNone);
    setError("");
    set({ stops, edits: {} });
  };
  const open = async (f: File) => {
    setReading(true);
    try {
      load(await readTable(f));
    } catch {
      setError(t.errRead);
    } finally {
      setReading(false);
    }
  };
  const edit = (legKey: string, partyId: string, patch: FlightEdit) =>
    setR((x) => {
      const k = `${legKey}:${partyId}`;
      return { ...x, edits: { ...x.edits, [k]: { ...x.edits[k], ...patch } } };
    });
  const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="route-tool">
      <ProjectBar project={project} saving={saving} />
      <ToolFiles
        tool="routing"
        name={project?.name ?? "routing"}
        data={r}
        onOpen={(v) => v && typeof v === "object" && Array.isArray((v as Routing).stops) && setR({ ...ROUTING_START, ...(v as Routing) })}
        downloadLabel={t.download}
        download={sum.legs.length ? async () => ({ blob: new Blob([routingCsv(r)], { type: "text/csv" }), name: `${project?.name ?? "routing"} - flights.csv` }) : undefined}
      />

      <aside className="auth-form route-side">
        <div className="inv-actions">
          <button type="button" className="btn primary" disabled={reading} onClick={() => fileRef.current?.click()}>
            {reading ? t.reading : `📄 ${t.upload}`}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept=".xlsx,.csv,.tsv,.txt,.pdf,application/pdf,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) open(f);
          }}
        />
        {error && <p className="auth-err">{error}</p>}
        <details open={!r.stops.length}>
          <summary>{t.paste}</summary>
          <textarea className="lab-paste" rows={6} placeholder={t.pastePlaceholder} value={paste} onChange={(e) => setPaste(e.target.value)} />
          <button type="button" className="btn sm" disabled={!paste.trim()} onClick={() => load(parseTable(paste))}>
            {t.usePaste}
          </button>
        </details>

        <label className="field">
          <span>{t.home}</span>
          <input value={r.home} placeholder={t.homePlaceholder} onChange={(e) => set({ home: e.target.value })} />
        </label>
        {r.home.trim() && !findAirport(r.home) && <p className="auth-err small">{t.noAirport}</p>}

        <h2>{t.stops}</h2>
        <div className="route-stops">
          {r.stops.map((s) => {
            const ap = findAirport(s.city);
            const setStop = (patch: Partial<typeof s>) => set({ stops: r.stops.map((x) => (x.id === s.id ? { ...x, ...patch } : x)) });
            return (
              <div key={s.id} className="route-stop">
                <input type="date" value={s.date} aria-label={t.date} onChange={(e) => setStop({ date: e.target.value })} />
                <span className={ap ? "ap" : "ap missing"} title={ap ? `${ap.city} (${ap.code})` : t.noAirport}>
                  {ap?.code ?? "?"}
                </span>
                <input value={s.city} aria-label={t.city} placeholder={t.city} onChange={(e) => setStop({ city: e.target.value })} />
                <input value={s.venue} aria-label={t.venue} placeholder={t.venue} onChange={(e) => setStop({ venue: e.target.value })} />
                <button type="button" className="link small" aria-label={t.remove} onClick={() => set({ stops: r.stops.filter((x) => x.id !== s.id) })}>
                  ✕
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className="btn sm"
          onClick={() => {
            const last = r.stops[r.stops.length - 1]?.date;
            const next = last ? new Date(Date.parse(`${last}T12:00:00Z`) + 2 * 864e5).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
            set({ stops: [...r.stops, { id: newId(), date: next, city: "", venue: "" }] });
          }}
        >
          {t.addStop}
        </button>

        <h2>{t.parties}</h2>
        <p className="muted small">{t.partiesHint}</p>
        {r.parties.map((p) => {
          const setParty = (patch: Partial<typeof p>) => set({ parties: r.parties.map((x) => (x.id === p.id ? { ...x, ...patch } : x)) });
          return (
            <div key={p.id} className="route-party">
              <input type="color" className="swatch-pick" value={p.color} aria-label={p.name} onChange={(e) => setParty({ color: e.target.value })} />
              <input value={p.name} aria-label={t.partyName} onChange={(e) => setParty({ name: e.target.value })} />
              <input type="number" min={1} max={500} value={p.pax} aria-label={t.pax} title={t.pax} onChange={(e) => setParty({ pax: Math.max(1, Math.min(500, Math.round(Number(e.target.value) || 1))) })} />
              <select value={p.cabin} aria-label={t.cabins[p.cabin]} onChange={(e) => setParty({ cabin: e.target.value as Cabin })}>
                {CABINS.map((c) => (
                  <option key={c} value={c}>
                    {t.cabins[c]}
                  </option>
                ))}
              </select>
              <button type="button" className="link small" aria-label={t.remove} onClick={() => set({ parties: r.parties.filter((x) => x.id !== p.id) })}>
                ✕
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="btn sm"
          onClick={() =>
            set({
              parties: [
                ...r.parties,
                { id: newId(), name: `Party ${String.fromCharCode(65 + r.parties.length)}`, pax: 1, cabin: "eco", color: PARTY_COLORS[r.parties.length % PARTY_COLORS.length] },
              ],
            })
          }
        >
          {t.addParty}
        </button>
      </aside>

      <section className="route-main">
        <div className="auth-form route-sum">
          <div className="route-sum-head">
            <div>
              <p className="eyebrow muted">{t.summary}</p>
              <strong className="num rider-total">{usd(sum.all)}</strong>
            </div>
            <span className="muted small">
              {plural(sum.legs.length, t.legs)} · {plural(sum.seats, t.seats)}
            </span>
          </div>
          <ul className="route-per">
            {r.parties.map((p) => (
              <li key={p.id}>
                <span className="swatch" style={{ background: p.color }} />
                {p.name} <span className="muted small">· {p.pax} · {t.cabins[p.cabin]}</span>
                <strong className="num">{usd(sum.per.get(p.id) ?? 0)}</strong>
              </li>
            ))}
          </ul>
          <p className="muted small">{fmt(t.summaryNote, { own: sum.own, est: sum.est, unknown: sum.unknown })}</p>
          <p className="small route-warn">{t.disclaimer}</p>
        </div>

        <h2>{t.flights}</h2>
        {!sum.legs.length && <p className="muted">{t.noFlights}</p>}
        {sum.legs.map((leg) => (
          <article key={leg.key} className="auth-form route-leg">
            <header>
              <strong>
                {leg.from?.code ?? "?"} → {leg.to?.code ?? "?"}
              </strong>
              <span className="muted small">
                {leg.fromText} → {leg.toText}
                {leg.miles != null && ` · ${fmt(t.miles, { n: leg.miles.toLocaleString("en-US") })}`} · {dayLabel(leg.date)}
              </span>
              {(!leg.from || !leg.to) && <span className="auth-err small">{t.noAirport}</span>}
            </header>
            <div className="route-rows">
              {r.parties.map((p) => {
                const f = flightOf(r, leg, p);
                const e = (patch: FlightEdit) => edit(leg.key, p.id, patch);
                return (
                  <div key={p.id} className={f.skip ? "route-row skip" : "route-row"}>
                    <span className="route-who">
                      <span className="swatch" style={{ background: p.color }} />
                      {p.name} <span className="muted small">×{p.pax}</span>
                    </span>
                    <select value={f.cabin} aria-label={t.cabins[f.cabin]} onChange={(ev) => e({ cabin: ev.target.value as Cabin })}>
                      {CABINS.map((c) => (
                        <option key={c} value={c}>
                          {t.cabins[c]}
                        </option>
                      ))}
                    </select>
                    <input type="date" value={f.date} aria-label={t.date} onChange={(ev) => e({ date: ev.target.value })} />
                    <input value={f.airline ?? ""} placeholder={t.airline} aria-label={t.airline} onChange={(ev) => e({ airline: ev.target.value })} />
                    <input className="sm" value={f.flight ?? ""} placeholder={t.flightNo} aria-label={t.flightNo} onChange={(ev) => e({ flight: ev.target.value })} />
                    <input className="sm" type="time" value={f.time ?? ""} aria-label={t.time} onChange={(ev) => e({ time: ev.target.value })} />
                    <label className="route-fare">
                      <span>$</span>
                      <input
                        type="number"
                        min={0}
                        value={f.own ? f.price ?? "" : ""}
                        placeholder={f.estimate != null ? String(f.estimate) : t.fare}
                        aria-label={t.fare}
                        onChange={(ev) => e({ price: ev.target.value === "" ? null : Math.max(0, Number(ev.target.value)) })}
                      />
                    </label>
                    <span className="route-total num">
                      {usd(f.total)}
                      {!f.own && f.estimate != null && <small className="muted">{fmt(t.estimate, { v: usd(f.estimate) })}</small>}
                    </span>
                    <a className="link small" href={fareSearchUrl(leg, f.date, f.cabin)} target="_blank" rel="noopener noreferrer">
                      {t.checkFares}
                    </a>
                    <label className="pat-check small">
                      <input type="checkbox" checked={!!f.skip} onChange={(ev) => e({ skip: ev.target.checked })} />
                      {t.skip}
                    </label>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

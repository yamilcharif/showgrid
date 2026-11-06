"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { sendGearList, type SendResult } from "@/app/requests/actions";
import { useApp } from "@/components/AppState";
import { useI18n } from "@/components/I18n";
import { useListings } from "@/components/Listings";
import { LocationBox } from "@/components/LocationBox";
import { ProjectBar, useToolState } from "@/components/Projects";
import { ToolsBack } from "@/components/ToolsBack";
import { ToolFiles } from "@/components/ToolFiles";
import { fmt, plural } from "@/lib/i18n/config";
import { readTable } from "@/lib/labels";
import { estimateRider, parseRider, parseRiderRows, pdfText, readPlotGear, quoteRider, summarize, type CompanyQuote, type RentalMode, type RiderLine, type SubChoice } from "@/lib/rider";
import { RADII, dayCount, fmtDist, isoIn, money, rangeLabel, unitFor } from "@/lib/search";

const MAX_BYTES = 300 * 1024 * 1024;

interface RiderSaved {
  lines: RiderLine[];
  source: string;
  mode: RentalMode;
}
const RIDER_START: RiderSaved = { lines: [], source: "", mode: "show" };

/** Upload a rider (or paste one), check the gear it lists, and see which rental houses nearby have it and for how much. */
export function RiderTool() {
  const { place, setPlace, radiusIdx, setRadiusIdx, dates, setDates, ready } = useApp();
  const listings = useListings();
  const { t: T, locale } = useI18n();
  const t = T.rider;
  const unit = unitFor(place);

  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState("");
  const [error, setError] = useState("");
  const [paste, setPaste] = useState("");
  const [drag, setDrag] = useState(false);
  // the list, its file name and the kind of rental are kept in the open project, or on this device
  const { state: saved, setState: setSaved, project, saving } = useToolState<RiderSaved>("rider", "sg_rider", RIDER_START, (v) =>
    v && typeof v === "object" && Array.isArray((v as RiderSaved).lines) ? { ...RIDER_START, ...(v as RiderSaved) } : RIDER_START,
  );
  const { lines, source, mode } = saved;
  const setLines = (fn: RiderLine[] | ((ls: RiderLine[]) => RiderLine[])) => setSaved((x) => ({ ...x, lines: typeof fn === "function" ? fn(x.lines) : fn }));
  const setSource = (name: string) => setSaved((x) => ({ ...x, source: name }));
  const setMode = (m: RentalMode) => setSaved((x) => ({ ...x, mode: m }));

  const show = (found: RiderLine[], name: string, text = "") => {
    setSource(name);
    setLines(found);
    setError(found.length ? "" : t.errNone);
    if (!found.length && text) setPaste(text.slice(0, 20000));
  };
  const read = (text: string, name: string) => show(parseRider(text), name, text);

  const open = async (f: File) => {
    setError("");
    const kind =
      f.type === "application/pdf" || /\.pdf$/i.test(f.name)
        ? "pdf"
        : /\.xlsx$/i.test(f.name)
          ? "table"
          : /\.(csv|tsv)$/i.test(f.name)
            ? "table"
            : /\.txt$/i.test(f.name) || f.type.startsWith("text/")
              ? "text"
              : "";
    if (/\.xls$/i.test(f.name)) return setError(T.labels.errOldExcel);
    if (!kind) return setError(t.errType);
    if (f.size > MAX_BYTES) return setError(t.errSize);
    setReading(f.name);
    try {
      if (kind === "table") show(parseRiderRows(await readTable(f)), f.name);
      else if (kind === "text") read(await f.text(), f.name);
      else {
        // a rider's gear list, and on a plot also what is drawn: fixtures by their legend, motors, truss
        const text = await pdfText(f);
        const listed = parseRider(text);
        const drawn = await readPlotGear(f, listed).catch(() => ({ lines: [] as RiderLine[], unknown: 0 }));
        const found = [...listed, ...drawn.lines].map((l, i) => ({ ...l, key: i }));
        if (!found.length && text.replace(/\s/g, "").length < 20) {
          setLines([]);
          setError(t.errScan);
        } else {
          show(found, f.name, text);
          if (found.length && drawn.unknown) setError(fmt(t.plotUnknown, { n: drawn.unknown }));
        }
      }
    } catch {
      setError(t.errRead);
    } finally {
      setReading("");
    }
  };

  const edit = (key: number, patch: Partial<RiderLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, { key: Math.max(-1, ...ls.map((l) => l.key)) + 1, name: "", qty: 1, on: true }]);

  const quotes = useMemo(
    () => (ready ? quoteRider(lines, { place, radiusIdx, dates, listings, mode }) : []),
    [ready, lines, place, radiusIdx, dates, listings, mode],
  );
  const est = useMemo(() => estimateRider(quotes, lines, dates, mode), [quotes, lines, dates, mode]);
  const days = dayCount(dates);

  return (
    <>
      <section className="co-hero">
        <div className="wrap">
          <ToolsBack label={T.tools.back} />
          <p className="eyebrow">
            <span className="tally" />
            {t.eyebrow}
          </p>
          <h1>{t.title}</h1>
          <p className="co-meta">{t.lede}</p>

          <div
            className={drag ? "search rider-bar drag" : "search rider-bar"}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files[0];
              if (f) open(f);
            }}
          >
            <button type="button" className="q rider-pick" onClick={() => fileRef.current?.click()} disabled={!!reading}>
              <span aria-hidden="true">📄</span>
              <span>
                {reading ? (
                  fmt(t.reading, { name: reading })
                ) : (
                  <>
                    {t.drop} <u>{t.choose}</u>
                  </>
                )}
                <small>{t.formats}</small>
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              hidden
              accept=".pdf,.xlsx,.xls,.txt,.csv,.tsv,application/pdf,text/plain,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) open(f);
              }}
            />
            <LocationBox value={place} onChange={setPlace} />
            <div className="dates">
              <label className="dt" htmlFor="riderFrom">
                <span>{T.search.from}</span>
                <input
                  id="riderFrom"
                  type="date"
                  disabled={!ready}
                  min={ready ? isoIn(0) : undefined}
                  value={dates.from}
                  onChange={(e) => e.target.value && setDates({ from: e.target.value })}
                />
              </label>
              <span className="dash" aria-hidden="true">→</span>
              <label className="dt" htmlFor="riderTo">
                <span>{T.search.to}</span>
                <input
                  id="riderTo"
                  type="date"
                  disabled={!ready}
                  min={dates.from || undefined}
                  value={dates.to}
                  onChange={(e) => e.target.value && setDates({ to: e.target.value })}
                />
              </label>
            </div>
            <select
              aria-label={T.search.distance}
              disabled={place.country}
              value={place.country ? "country" : radiusIdx}
              onChange={(e) => setRadiusIdx(Number(e.target.value))}
            >
              {place.country ? (
                <option value="country">{T.search.wholeCountry}</option>
              ) : (
                RADII[unit].map((r, i) => (
                  <option key={i} value={i}>
                    {r === Infinity ? T.search.anywhere : `${r} ${unit}`}
                  </option>
                ))
              )}
            </select>
          </div>
          {error && (
            <p className="rider-err" role="alert">
              {error}
            </p>
          )}
        </div>
      </section>

      <div className="wrap co-page rider-page">
        <ProjectBar project={project} saving={saving} />
        <ToolFiles
          tool="rider"
          name={project?.name ?? (source.replace(/\.[a-z0-9]+$/i, "") || "rider")}
          data={saved}
          onOpen={(v) => v && typeof v === "object" && Array.isArray((v as RiderSaved).lines) && setSaved({ ...RIDER_START, ...(v as RiderSaved) })}
          downloadLabel={T.files.riderCsv}
          download={
            lines.some((l) => l.on)
              ? async () => {
                  const { riderCsv } = await import("@/lib/projectExport");
                  return { blob: new Blob([riderCsv(lines, est.rows, est.cur)], { type: "text/csv" }), name: `${project?.name ?? (source.replace(/\.[a-z0-9]+$/i, "") || "rider")}.csv` };
                }
              : undefined
          }
        />
        <div className="rider-cols">
          <section className="auth-form rider-list">
            {lines.length > 0 ? (
              <>
                <div>
                  <h2>{source ? fmt(t.listTitle, { name: source }) : t.listTitlePaste}</h2>
                  <p className="muted small">{t.listHint}</p>
                </div>
                <table className="rider-table">
                  <thead>
                    <tr>
                      <th />
                      <th>{t.qty}</th>
                      <th>{t.item}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.key} className={l.on ? undefined : "off"}>
                        <td>
                          <input type="checkbox" checked={l.on} aria-label={l.name} onChange={(e) => edit(l.key, { on: e.target.checked })} />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={1}
                            max={500}
                            value={l.qty}
                            aria-label={t.qty}
                            onChange={(e) => edit(l.key, { qty: Math.max(1, Math.min(500, Math.round(Number(e.target.value) || 1))) })}
                          />
                        </td>
                        <td>
                          <input value={l.name} aria-label={t.item} maxLength={120} onChange={(e) => edit(l.key, { name: e.target.value })} />
                        </td>
                        <td>
                          <button type="button" className="link small" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                            {t.removeLine}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="inv-actions">
                  <button type="button" className="btn sm" onClick={addLine}>
                    {t.addLine}
                  </button>
                </div>
              </>
            ) : null}

            <details open={!lines.length}>
              <summary>{t.orPaste}</summary>
              <textarea className="note" rows={7} maxLength={20000} placeholder={t.pastePlaceholder} value={paste} onChange={(e) => setPaste(e.target.value)} />
              <button type="button" className="btn sm" disabled={!paste.trim()} onClick={() => read(paste, "")}>
                {t.readPaste}
              </button>
            </details>
          </section>

          {lines.some((l) => l.on) && (
            <section className="rider-results">
              <div className="auth-form rider-est">
                <div className="rider-est-head">
                  <p className="eyebrow muted">{t.estimate}</p>
                  <div className="seg seg2" role="radiogroup" aria-label={t.mode}>
                    {(["show", "tour"] as const).map((k) => (
                      <button key={k} type="button" role="radio" aria-checked={mode === k} className={mode === k ? "on" : undefined} onClick={() => setMode(k)}>
                        {k === "show" ? t.modeShow : t.modeTour}
                      </button>
                    ))}
                  </div>
                </div>
                {est.total > 0 ? (
                  <>
                    <strong className="num rider-total">{money(est.total, est.cur)}</strong>
                    <p className="muted small">
                      {fmt(mode === "tour" ? t.estimateNoteTour : t.estimateNote, {
                        days: plural(days, t.days),
                        published: est.published,
                        estimated: est.estimated,
                        total: est.lines,
                      })}
                    </p>
                    <details className="rider-how">
                      <summary>{t.how}</summary>
                      <table>
                        <tbody>
                          {est.rows.map((r) => (
                            <tr key={r.line.key} className={r.source}>
                              <td className="num">{r.line.qty}×</td>
                              <td>
                                {r.line.name}
                                <small>
                                  {r.source === "published"
                                    ? fmt(t.howPublished, { rate: money(r.rate, est.cur), co: r.co ?? "" })
                                    : r.source === "estimated"
                                      ? fmt(t.howEstimated, { value: money(r.value ?? 0, est.cur), rate: money(r.rate, est.cur) })
                                      : t.howNone}
                                </small>
                              </td>
                              <td className="num">
                                {r.source !== "none" && (
                                  <>
                                    <small>
                                      {r.line.qty} × {money(r.rate, est.cur)} × {+r.factor.toFixed(2)}
                                    </small>
                                    {money(r.subtotal, est.cur)}
                                  </>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="muted small">{mode === "tour" ? fmt(t.howFactorTour, { days: plural(days, t.days) }) : fmt(t.howFactorShow, { days: plural(days, t.days) })}</p>
                    </details>
                  </>
                ) : (
                  <p className="muted small">{t.estimateNone}</p>
                )}
              </div>

              <h2>{t.resultsTitle}</h2>
              {quotes.length ? (
                quotes.map((q) => <QuoteCard key={q.co.id} q={q} total={est.lines} dates={dates} unit={unit} locale={locale} />)
              ) : (
                <p className="muted">{t.noResults}</p>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function QuoteCard({ q, total, dates, unit, locale }: { q: CompanyQuote; total: number; dates: { from: string; to: string }; unit: "mi" | "km"; locale: string }) {
  const { t: T } = useI18n();
  const t = T.rider;
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [sending, start] = useTransition();
  // contrarider: the substitute shown for each line, and the renter's yes or no
  const [choice, setChoice] = useState<SubChoice>({});
  const pick = (key: number) => choice[key] ?? { id: q.matches.find((m) => m.line.key === key)?.subs[0]?.it.id ?? "", ok: null };
  const sum = summarize(q, choice);
  const contra = q.matches.filter((m) => m.subs.length);
  const sent = result?.sent[0];

  const send = () =>
    start(async () => {
      const subbed = new Map(sum.used.map((u) => [u.m.line.key, u.sub.have]));
      const missing = q.matches
        .map((m) => ({ m, n: m.line.qty - m.have - (subbed.get(m.line.key) ?? 0) }))
        .filter(({ n }) => n > 0)
        .map(({ m, n }) => `- ${n}x ${m.line.name}`);
      const instead = sum.used.map((u) => fmt(t.noteInstead, { qty: u.sub.have, sub: u.sub.it.name, orig: u.m.line.name }));
      const note = [
        t.noteHead,
        ...(instead.length ? ["", t.noteContra, ...instead] : []),
        ...(missing.length ? ["", t.noteMissing, ...missing] : []),
      ]
        .join("\n")
        .slice(0, 2000);
      const res = await sendGearList({
        from: dates.from,
        to: dates.to,
        note,
        groups: [{ companyId: q.co.id, lines: sum.lines.map((l) => ({ item: l.it.id, qty: l.qty })) }],
      });
      setResult(res);
      setConfirming(false);
    });

  return (
    <article className="auth-form rider-co">
      <div className="rider-co-head">
        <div>
          <h3>
            <Link href={`/c/${q.co.slug}`}>{q.co.name}</Link>
          </h3>
          <p className="muted small">
            {q.co.city} · {fmtDist(q.d, unit)} · {fmt(t.linesFound, { n: q.linesFound, total })}
          </p>
        </div>
        <div className="rider-co-num">
          <strong className="num">{fmt(t.covers, { pct: Math.round(q.coverage * 100) })}</strong>
          {sum.used.length > 0 && <span className="small rider-with">{fmt(t.withContra, { pct: Math.round(sum.coverage * 100) })}</span>}
          <span className="muted small">
            {sum.cost > 0 ? fmt(t.costFor, { cost: money(sum.cost, q.co.cur) }) : t.allOnRequest}
            {sum.cost > 0 && sum.estimated > 0 && ` · ${plural(sum.estimated, t.inclEstimated)}`}
            {sum.cost > 0 && sum.onRequest > 0 && ` ${plural(sum.onRequest, t.plusOnRequest)}`}
          </span>
        </div>
      </div>
      <div className="rider-bar-meter" aria-hidden="true">
        <span style={{ width: `${Math.round(q.coverage * 100)}%` }} />
        <span className="contra" style={{ width: `${Math.round((sum.coverage - q.coverage) * 100)}%` }} />
      </div>

      <button type="button" className="link small" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? t.hide : t.details}
      </button>
      {open && (
        <ul className="rider-match">
          {q.matches.map((m) => (
            <li key={m.line.key} className={m.it && m.have ? undefined : "miss"}>
              <span className="num">{m.line.qty}×</span>
              <span>{m.line.name}</span>
              <span className="muted">
                {m.it ? (
                  <>
                    → {m.it.name}
                    {m.have < m.line.qty && ` (${fmt(t.short, { n: m.have })})`}
                    {m.it.pub && m.it.rate > 0 && ` · ${money(m.it.rate, q.co.cur)}${t.perDay}`}
                  </>
                ) : (
                  t.notFound
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {contra.length > 0 && !sent && (
        <div className="rider-contra">
          <h4>{t.contra}</h4>
          <p className="muted small">{fmt(t.contraHint, { name: q.co.name })}</p>
          <ul>
            {contra.map((m) => {
              const c = pick(m.line.key);
              const sub = m.subs.find((x) => x.it.id === c.id) ?? m.subs[0];
              const set = (patch: Partial<{ id: string; ok: boolean | null }>) => setChoice((ch) => ({ ...ch, [m.line.key]: { ...c, ...patch } }));
              return (
                <li key={m.line.key} className={c.ok === true ? "yes" : c.ok === false ? "no" : undefined}>
                  <div className="rider-contra-what">
                    <span className="muted small">{fmt(t.contraFor, { qty: m.line.qty - m.have, name: m.line.name })}</span>
                    {m.subs.length > 1 ? (
                      <select value={sub.it.id} aria-label={fmt(t.contraPick, { name: m.line.name })} onChange={(e) => set({ id: e.target.value })}>
                        {m.subs.map((x) => (
                          <option key={x.it.id} value={x.it.id}>
                            {x.have}× {x.it.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <strong>
                        {sub.have}× {sub.it.name}
                      </strong>
                    )}
                    <span className="muted small">
                      {sub.same
                        ? fmt(t.contraSame, { kind: t.kinds[sub.kind] })
                        : fmt(t.contraNear, { sub: t.kinds[sub.kind], orig: t.kinds[m.kind!] })}{" "}
                      {plural(sub.have, t.contraFree)}
                      {sub.it.pub && sub.it.rate > 0 && ` · ${money(sub.it.rate, q.co.cur)}${t.perDay}`}
                    </span>
                  </div>
                  <div className="yesno" role="group" aria-label={m.line.name}>
                    <button type="button" className="btn sm" aria-pressed={c.ok === true} onClick={() => set({ id: sub.it.id, ok: true })}>
                      {t.yes}
                    </button>
                    <button type="button" className="btn sm" aria-pressed={c.ok === false} onClick={() => set({ id: sub.it.id, ok: false })}>
                      {t.no}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {sent ? (
        <p className="rider-sent">
          ✓ {fmt(t.sent, { name: q.co.name })} <Link href={`/messages/${sent.conversationId}`}>{t.openChat}</Link>
        </p>
      ) : confirming ? (
        <div className="rider-confirm">
          <p>{fmt(t.confirm, { name: q.co.name, n: sum.lines.length, dates: rangeLabel(dates, locale) })}</p>
          <div className="inv-actions">
            <button type="button" className="btn primary" onClick={send} disabled={sending}>
              {sending ? t.sending : t.confirmYes}
            </button>
            <button type="button" className="btn" onClick={() => setConfirming(false)} disabled={sending}>
              {t.cancel}
            </button>
          </div>
        </div>
      ) : (
        <div className="inv-actions">
          <button type="button" className="btn primary" onClick={() => setConfirming(true)}>
            {fmt(t.request, { name: q.co.name })}
          </button>
        </div>
      )}

      {result?.signIn && (
        <p className="auth-err" role="alert">
          <Link href="/sign-in">{T.send.signIn}</Link>
          {T.send.signInRest}
        </p>
      )}
      {result?.needProfile && (
        <p className="auth-err" role="alert">
          <Link href="/account">{T.send.finishProfile}</Link>
          {T.send.finishProfileRest}
        </p>
      )}
      {result?.failed.map((f) => (
        <p key={f.companyId} className="auth-err" role="alert">
          {f.error}
        </p>
      ))}
    </article>
  );
}

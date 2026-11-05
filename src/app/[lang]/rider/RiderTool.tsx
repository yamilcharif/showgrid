"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { sendGearList, type SendResult } from "@/app/requests/actions";
import { useApp } from "@/components/AppState";
import { useI18n } from "@/components/I18n";
import { useListings } from "@/components/Listings";
import { LocationBox } from "@/components/LocationBox";
import { fmt, plural } from "@/lib/i18n/config";
import { estimateRider, parseRider, pdfText, quoteRider, type CompanyQuote, type RiderLine } from "@/lib/rider";
import { RADII, dayCount, fmtDist, isoIn, money, rangeLabel, unitFor } from "@/lib/search";

const MAX_BYTES = 20 * 1024 * 1024;

/** Upload a rider (or paste one), check the gear it lists, and see which rental houses nearby have it and for how much. */
export function RiderTool() {
  const { place, setPlace, radiusIdx, setRadiusIdx, dates, setDates, ready } = useApp();
  const listings = useListings();
  const { t: T, locale } = useI18n();
  const t = T.rider;
  const unit = unitFor(place);

  const fileRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState("");
  const [reading, setReading] = useState("");
  const [error, setError] = useState("");
  const [paste, setPaste] = useState("");
  const [lines, setLines] = useState<RiderLine[]>([]);
  const [drag, setDrag] = useState(false);

  const read = (text: string, name: string) => {
    const found = parseRider(text);
    setSource(name);
    setLines(found);
    setError(found.length ? "" : t.errNone);
    if (!found.length) setPaste(text.slice(0, 20000));
  };

  const open = async (f: File) => {
    setError("");
    const kind = f.type === "application/pdf" || /\.pdf$/i.test(f.name) ? "pdf" : /\.(txt|csv|tsv)$/i.test(f.name) || f.type.startsWith("text/") ? "text" : "";
    if (!kind) return setError(t.errType);
    if (f.size > MAX_BYTES) return setError(t.errSize);
    setReading(f.name);
    try {
      // csv/tsv columns become wide gaps, the way table rows read out of a PDF
      const text = kind === "pdf" ? await pdfText(f) : (await f.text()).replace(/[;,\t]/g, "  ");
      if (kind === "pdf" && text.replace(/\s/g, "").length < 20) {
        setLines([]);
        setError(t.errScan);
      } else read(text, f.name);
    } catch {
      setError(t.errRead);
    } finally {
      setReading("");
    }
  };

  const edit = (key: number, patch: Partial<RiderLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, { key: Math.max(-1, ...ls.map((l) => l.key)) + 1, name: "", qty: 1, on: true }]);

  const quotes = useMemo(
    () => (ready ? quoteRider(lines, { place, radiusIdx, dates, listings }) : []),
    [ready, lines, place, radiusIdx, dates, listings],
  );
  const est = useMemo(() => estimateRider(quotes, lines, dates), [quotes, lines, dates]);
  const days = dayCount(dates);

  return (
    <>
      <section className="co-hero">
        <div className="wrap">
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
              accept=".pdf,.txt,.csv,.tsv,application/pdf,text/plain,text/csv"
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
                <p className="eyebrow muted">{t.estimate}</p>
                {est.priced ? (
                  <>
                    <strong className="num rider-total">
                      {est.low === est.mid ? money(est.mid, est.cur) : fmt(t.estimateRange, { low: money(est.low, est.cur), mid: money(est.mid, est.cur) })}
                    </strong>
                    <p className="muted small">
                      {fmt(t.estimateNote, { days: plural(days, t.days), priced: est.priced, total: est.total })}
                    </p>
                  </>
                ) : (
                  <p className="muted small">{t.estimateNone}</p>
                )}
              </div>

              <h2>{t.resultsTitle}</h2>
              {quotes.length ? (
                quotes.map((q) => <QuoteCard key={q.co.id} q={q} total={est.total} dates={dates} unit={unit} locale={locale} />)
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
  const found = q.matches.filter((m) => m.it && m.have > 0);
  const sent = result?.sent[0];

  const send = () =>
    start(async () => {
      const missing = q.matches
        .filter((m) => m.have < m.line.qty)
        .map((m) => `- ${m.line.qty - m.have}x ${m.line.name}`);
      const note = [t.noteHead, ...(missing.length ? ["", t.noteMissing, ...missing] : [])].join("\n").slice(0, 2000);
      const res = await sendGearList({
        from: dates.from,
        to: dates.to,
        note,
        groups: [{ companyId: q.co.id, lines: found.map((m) => ({ item: m.it!.id, qty: m.have })) }],
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
          <span className="muted small">
            {q.cost > 0 ? fmt(t.costFor, { cost: money(q.cost, q.co.cur) }) : t.allOnRequest}
            {q.cost > 0 && q.onRequest > 0 && ` ${plural(q.onRequest, t.plusOnRequest)}`}
          </span>
        </div>
      </div>
      <div className="rider-bar-meter" aria-hidden="true">
        <span style={{ width: `${Math.round(q.coverage * 100)}%` }} />
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

      {sent ? (
        <p className="rider-sent">
          ✓ {fmt(t.sent, { name: q.co.name })} <Link href={`/messages/${sent.conversationId}`}>{t.openChat}</Link>
        </p>
      ) : confirming ? (
        <div className="rider-confirm">
          <p>{fmt(t.confirm, { name: q.co.name, n: found.length, dates: rangeLabel(dates, locale) })}</p>
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

"use client";

import { useEffect, useState, useTransition } from "react";
import { sendQuote } from "@/app/requests/actions";
import { useT } from "@/components/I18n";
import { fmt, plural } from "@/lib/i18n/config";
import type { Quote, QuoteExtra, QuoteLine, RentalRequest } from "@/lib/requests";
import { money } from "@/lib/search";
import { createClient } from "@/lib/supabase/browser";

interface Props {
  req: RentalRequest;
  /** the latest quote, to revise it; otherwise it starts from the request */
  latest?: Quote;
  factor: number;
  onClose: () => void;
}

/** The company's quote form: edit rates and quantities, add charges, then send. */
export function QuoteEditor({ req, latest, factor, onClose }: Props) {
  const T = useT();
  const t = T.quote;
  const cur = req.currency ?? "USD";
  const days = Math.round((Date.parse(req.end_day) - Date.parse(req.start_day)) / 864e5) + 1;
  const [lines, setLines] = useState<QuoteLine[]>(
    latest?.lines ??
      req.rental_request_lines.map((l) => ({ name: l.item_name ?? "", qty: l.quantity, rate: Number(l.day_rate_at_send ?? 0) })),
  );
  const [extras, setExtras] = useState<QuoteExtra[]>(latest?.extras ?? []);
  const [note, setNote] = useState(latest?.note ?? "");
  const [validUntil, setValidUntil] = useState(latest?.valid_until ?? "");
  const [error, setError] = useState("");
  const [sending, start] = useTransition();

  // first quote: fill in the company's own day rates, including ones hidden from the public
  useEffect(() => {
    if (latest) return;
    const ids = req.rental_request_lines.map((l) => l.item_id);
    createClient()
      .from("items")
      .select("id, day_rate")
      .in("id", ids)
      .then(({ data }) => {
        if (!data?.length) return;
        const rate = new Map(data.map((d) => [d.id, Number(d.day_rate ?? 0)]));
        setLines((list) => list.map((l, i) => (l.rate ? l : { ...l, rate: rate.get(req.rental_request_lines[i]?.item_id) ?? 0 })));
      });
  }, [latest, req]);

  const lineTotal = (l: QuoteLine) => (Number(l.qty) || 0) * (Number(l.rate) || 0) * factor;
  const total = lines.reduce((n, l) => n + lineTotal(l), 0) + extras.reduce((n, x) => n + (Number(x.amount) || 0), 0);
  const setLine = (i: number, patch: Partial<QuoteLine>) => setLines((list) => list.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const setExtra = (i: number, patch: Partial<QuoteExtra>) => setExtras((list) => list.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const send = () =>
    start(async () => {
      setError("");
      const res = await sendQuote(req.id, { lines, extras, note, validUntil });
      if (res.error) setError(res.error);
      else onClose();
    });

  return (
    <div className="qe">
      <div className="qe-head small muted">
        <span>{t.item}</span>
        <span>{t.qty}</span>
        <span>{t.rate}</span>
        <span>{t.lineTotal}</span>
        <span />
      </div>
      {lines.map((l, i) => (
        <div className="qe-row" key={i}>
          <input aria-label={t.item} value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} />
          <input aria-label={t.qty} type="number" min={0} value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} />
          <input aria-label={t.rate} type="number" min={0} step="any" value={l.rate} onChange={(e) => setLine(i, { rate: Number(e.target.value) })} />
          <span className="num">{money(lineTotal(l), cur)}</span>
          <button type="button" className="link" onClick={() => setLines((list) => list.filter((_, j) => j !== i))} aria-label={t.remove}>
            ×
          </button>
        </div>
      ))}
      <div className="inv-actions">
        <button type="button" className="btn sm" onClick={() => setLines((list) => [...list, { name: "", qty: 1, rate: 0 }])}>
          {t.addLine}
        </button>
        <span className="muted small num">{fmt(t.factor, { factor, days: plural(days, T.list.days) })}</span>
      </div>

      <b className="small">{t.extras}</b>
      {extras.map((x, i) => (
        <div className="qe-extra" key={i}>
          <input aria-label={t.extraLabel} placeholder={t.extraLabel} value={x.label} onChange={(e) => setExtra(i, { label: e.target.value })} />
          <input aria-label={t.amount} type="number" step="any" placeholder={t.amount} value={x.amount} onChange={(e) => setExtra(i, { amount: Number(e.target.value) })} />
          <button type="button" className="link" onClick={() => setExtras((list) => list.filter((_, j) => j !== i))} aria-label={t.remove}>
            ×
          </button>
        </div>
      ))}
      <div>
        <button type="button" className="btn sm" onClick={() => setExtras((list) => [...list, { label: "", amount: 0 }])}>
          {t.addExtra}
        </button>
      </div>

      <div className="field">
        <label htmlFor={`qn-${req.id}`}>{t.note}</label>
        <textarea id={`qn-${req.id}`} className="about-input" rows={3} maxLength={2000} placeholder={t.notePlaceholder} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="qe-foot">
        <label className="field">
          <span>{t.validUntil}</span>
          <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </label>
        <div className="qe-total">
          <span className="muted small">{t.total}</span>
          <b className="num">{money(total, cur)}</b>
        </div>
      </div>
      {error && (
        <p className="auth-err" role="alert">
          {error}
        </p>
      )}
      <div className="inv-actions">
        <button type="button" className="btn primary" disabled={sending} onClick={send}>
          {sending ? t.sending : t.send}
        </button>
        <button type="button" className="link" onClick={onClose}>
          {t.cancel}
        </button>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { answerQuote } from "@/app/requests/actions";
import { useI18n } from "@/components/I18n";
import { fmt, plural } from "@/lib/i18n/config";
import type { Quote } from "@/lib/requests";
import { money } from "@/lib/search";

interface Props {
  quote: Quote;
  /** the requester can accept or decline the latest quote while it's open */
  canAnswer: boolean;
  onAnswered: (accepted: boolean) => void;
}

export function QuoteCard({ quote, canAnswer, onAnswered }: Props) {
  const { t: T, locale } = useI18n();
  const t = T.quote;
  const [error, setError] = useState("");
  const [saving, start] = useTransition();
  const cur = quote.currency;

  const answer = (accept: boolean) =>
    start(async () => {
      setError("");
      const res = await answerQuote(quote.request_id, accept);
      if (res.error) setError(res.error);
      else onAnswered(accept);
    });

  return (
    <div className="req quote">
      <div className="req-head">
        <b>{t.title}</b>
        <span className="muted small num">{fmt(t.factor, { factor: Number(quote.factor), days: plural(quote.days, T.list.days) })}</span>
      </div>
      <ul>
        {quote.lines.map((l, i) => (
          <li key={i}>
            <span className="num">{l.qty}×</span> {l.name}
            <span className="muted num">{money(l.qty * l.rate * Number(quote.factor), cur)}</span>
          </li>
        ))}
        {quote.extras.map((x, i) => (
          <li key={`x${i}`}>
            {x.label}
            <span className="muted num">{money(Number(x.amount), cur)}</span>
          </li>
        ))}
      </ul>
      {quote.note && <p className="req-note">{quote.note}</p>}
      <div className="req-foot">
        <span className="muted small">
          {quote.valid_until && fmt(t.validUntilShort, { date: new Date(`${quote.valid_until}T12:00`).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" }) })}
        </span>
        <b className="num">{money(Number(quote.total), cur)}</b>
      </div>
      <div className="req-actions">
        <Link className="btn sm" href={`/quotes/${quote.id}`} target="_blank">
          {t.print}
        </Link>
        {canAnswer && (
          <>
            <button type="button" className="btn primary sm" disabled={saving} onClick={() => answer(true)}>
              {t.accept}
            </button>
            <button type="button" className="btn sm" disabled={saving} onClick={() => answer(false)}>
              {t.decline}
            </button>
          </>
        )}
      </div>
      {error && (
        <p className="auth-err" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

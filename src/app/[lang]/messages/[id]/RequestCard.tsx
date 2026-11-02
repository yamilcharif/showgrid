"use client";

import { useState, useTransition } from "react";
import { respondToRequest } from "@/app/requests/actions";
import { useI18n } from "@/components/I18n";
import { useListings } from "@/components/Listings";
import { rentalFactor } from "@/lib/pricing";
import { fmt, plural } from "@/lib/i18n/config";
import type { RentalRequest, RequestStatus } from "@/lib/requests";
import type { Quote } from "@/lib/requests";
import { dayCount, money, rangeLabel } from "@/lib/search";
import { QuoteEditor } from "./QuoteEditor";

interface Props {
  req: RentalRequest;
  /** the receiving company can answer; the sender can't */
  canRespond: boolean;
  onStatus: (s: RequestStatus) => void;
  /** the latest quote, to start a revision from */
  latest?: Quote;
}

export function RequestCard({ req, canRespond, onStatus, latest }: Props) {
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const { companyById } = useListings();
  const [saving, start] = useTransition();
  const { t: T, locale } = useI18n();
  const t = T.request;
  const dates = { from: req.start_day, to: req.end_day };
  const days = dayCount(dates);
  const cur = req.currency ?? "USD";
  // the company's rental-length pricing, the same the database uses for the estimate
  const factor = rentalFactor(companyById(req.company_id)?.priceRule, days);
  const open = req.status === "pending" || req.status === "quoted";

  const answer = (s: "confirmed" | "declined") =>
    start(async () => {
      setError("");
      const res = await respondToRequest(req.id, s);
      if (res.error) setError(res.error);
      else onStatus(s);
    });

  return (
    <div className="req">
      <div className="req-head">
        <b>{t.title}</b>
        <span className="num">
          {rangeLabel(dates, locale)} · {plural(days, t.days)}
        </span>
        <span className={`pill ${req.status === "confirmed" ? "ok" : ""} ${req.status === "declined" ? "off" : ""}`}>
          {req.status === "confirmed" && <i />}
          {t[req.status]}
        </span>
      </div>
      <ul>
        {req.rental_request_lines.map((l, i) => (
          <li key={i}>
            <span className="num">{l.quantity}×</span> {l.item_name ?? t.item}
            <span className="muted num">{l.day_rate_at_send != null ? fmt(t.perDay, { rate: money(Number(l.day_rate_at_send), cur) }) : t.onRequest}</span>
          </li>
        ))}
      </ul>
      {req.note && <p className="req-note">{req.note}</p>}
      <div className="req-foot">
        <span className="muted small">{t.estimateNote}</span>
        {req.estimate != null && <b className="num">{money(Number(req.estimate), cur)}</b>}
      </div>
      {canRespond && open && !editing && (
        <div className="req-actions">
          <button type="button" className="btn primary sm" onClick={() => setEditing(true)}>
            {latest ? T.quote.revise : T.quote.edit}
          </button>
          {req.status === "pending" && (
            <button type="button" className="btn sm" disabled={saving} onClick={() => answer("confirmed")}>
              {t.confirm}
            </button>
          )}
          <button type="button" className="btn sm" disabled={saving} onClick={() => answer("declined")}>
            {t.decline}
          </button>
        </div>
      )}
      {editing && <QuoteEditor req={req} latest={latest} factor={factor} onClose={() => setEditing(false)} />}
      {error && (
        <p className="auth-err" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

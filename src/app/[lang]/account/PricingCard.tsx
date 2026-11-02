"use client";

import { useState, useTransition } from "react";
import { useT } from "@/components/I18n";
import { fmt, plural } from "@/lib/i18n/config";
import { cleanRule, rentalFactor, type PriceRule } from "@/lib/pricing";
import { savePriceRule } from "./actions";

const EXAMPLE_DAYS = [1, 3, 5, 7, 10, 14];

export function PricingCard({ initial }: { initial: PriceRule | null }) {
  const T = useT();
  const t = T.pricing;
  const [tiers, setTiers] = useState(initial?.tiers ?? []);
  const [weekly, setWeekly] = useState(initial?.weekly ?? true);
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  const [saving, start] = useTransition();
  const rule = cleanRule({ tiers, weekly });

  const set = (i: number, key: "upTo" | "factor", v: string) =>
    setTiers((list) => list.map((x, j) => (j === i ? { ...x, [key]: Number(v) } : x)));

  const save = (next: PriceRule | null) =>
    start(async () => {
      const res = await savePriceRule(next);
      setMsg(res.error ? { text: res.error } : { ok: true, text: t.saved });
    });

  return (
    <section className="auth-form inv-card">
      <div>
        <b>{t.title}</b>
        <p className="muted small">{t.text}</p>
      </div>
      {tiers.length === 0 && <p className="muted small">{t.perDay}</p>}
      {tiers.map((tier, i) => (
        <div className="tier" key={i}>
          <span>{t.upTo}</span>
          <input type="number" min={1} max={366} value={tier.upTo || ""} onChange={(e) => set(i, "upTo", e.target.value)} aria-label={t.days} />
          <span>
            {t.days} {t.costs}
          </span>
          <input type="number" min={0.1} step="0.1" value={tier.factor || ""} onChange={(e) => set(i, "factor", e.target.value)} aria-label={t.dayRates} />
          <span>{t.dayRates}</span>
          <button type="button" className="link" onClick={() => setTiers((list) => list.filter((_, j) => j !== i))}>
            {t.remove}
          </button>
        </div>
      ))}
      <div className="inv-actions">
        <button
          type="button"
          className="btn sm"
          onClick={() => setTiers((list) => [...list, { upTo: (list[list.length - 1]?.upTo ?? 0) + 4, factor: (list[list.length - 1]?.factor ?? 1) + 0.5 }])}
        >
          {t.add}
        </button>
      </div>
      {tiers.length > 0 && (
        <label className="gm-toggle">
          <input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} />
          {t.weekly}
        </label>
      )}
      <div className="examples small">
        <b>{t.examples}</b>
        <ul>
          {EXAMPLE_DAYS.map((d) => (
            <li key={d} className="num">
              {fmt(t.example, { days: plural(d, T.list.days), factor: Math.round(rentalFactor(rule, d) * 100) / 100 })}
            </li>
          ))}
        </ul>
      </div>
      {msg && (
        <p className={msg.ok ? "auth-ok" : "auth-err"} role={msg.ok ? "status" : "alert"}>
          {msg.text}
        </p>
      )}
      <div className="inv-actions">
        <button type="button" className="btn primary" disabled={saving} onClick={() => save(rule)}>
          {saving ? t.saving : t.save}
        </button>
        {tiers.length > 0 && (
          <button
            type="button"
            className="link"
            onClick={() => {
              setTiers([]);
              save(null);
            }}
          >
            {t.clear}
          </button>
        )}
      </div>
    </section>
  );
}

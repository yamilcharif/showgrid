"use client";

import { useEffect, useRef } from "react";
import { coords } from "@/lib/places";
import { SRC_LABEL, dayCount, fmtDist, freeFor, isoIn, miles, money, rangeLabel, unitFor } from "@/lib/search";
import type { Company, Item } from "@/lib/types";
import { useApp } from "./AppState";
import { useGearList } from "./useGearList";
import { useListings } from "./Listings";
import { fmt, plural } from "@/lib/i18n/config";
import { rentalFactor } from "@/lib/pricing";
import { useI18n } from "./I18n";
import { SendList } from "./SendList";

interface Line {
  it: Item;
  co: Company;
  qty: number;
  free: number;
}

export function GearListDrawer() {
  const { cartOpen, setCartOpen, cart, dates, setDates, place, ready } = useApp();
  const { step, remove } = useGearList();
  const { itemById, companyById } = useListings();
  const { t, locale } = useI18n();
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!cartOpen) return;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCartOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cartOpen, setCartOpen]);

  if (!cartOpen || !ready) return null;

  const lines: Line[] = cart.flatMap((l) => {
    const it = itemById(l.id);
    const co = it && companyById(it.co);
    if (!it || !co || !it.listed) return [];
    return [{ it, co, qty: Math.max(1, Math.min(l.qty, it.total)), free: freeFor(it, dates) }];
  });
  const days = dayCount(dates);
  const dl = plural(days, t.list.days);
  const when = rangeLabel(dates, locale);
  const unit = unitFor(place);

  const groups: { co: Company; lines: Line[] }[] = [];
  for (const l of lines) {
    let g = groups.find((x) => x.co.id === l.co.id);
    if (!g) groups.push((g = { co: l.co, lines: [] }));
    g.lines.push(l);
  }

  // totals stay in each company's currency; no conversion
  const grand: Record<string, number> = {};
  let onReq = 0;
  const sections = groups.map(({ co, lines: ls }) => {
    let sub = 0;
    let req = 0;
    // the company's own pricing (e.g. 1-3 days = 1 day rate); plain day count otherwise
    const factor = rentalFactor(co.priceRule, days);
    for (const l of ls) {
      if (l.it.pub) sub += l.it.rate * l.qty * factor;
      else req++;
    }
    grand[co.cur] = (grand[co.cur] ?? 0) + sub;
    onReq += req;
    return (
      <section className="cgroup" key={co.id}>
        <h3>
          {co.name}{" "}
          <span className="num">
            {co.city} · {fmtDist(miles(place.ll, coords(co.city, co.off)), unit)} ·{" "}
            {fmt(t.list.ratesFrom, { src: co.src === "manual" ? t.list.spreadsheet : SRC_LABEL[co.src] })}
          </span>
        </h3>
        {ls.map((l) => (
          <div className="cline" key={l.it.id}>
            <div className="cl-name">
              {l.it.name}
              <div className="cl-calc num">
                {l.it.pub
                  ? factor === days
                    ? fmt(t.list.calc, { rate: money(l.it.rate, co.cur), qty: l.qty, days: dl })
                    : fmt(t.list.calcFactor, { rate: money(l.it.rate, co.cur), qty: l.qty, factor, days: dl })
                  : t.list.priceByMessage}
              </div>
            </div>
            <div className="cl-total num">{l.it.pub ? money(l.it.rate * l.qty * factor, co.cur) : t.list.onRequest}</div>
            <div className="cl-ctrl">
              {l.qty > l.free ? (
                <span className="pill warn">
                  {l.free ? fmt(t.list.onlyFree, { n: l.free, when }) : fmt(t.list.noneFree, { when })}
                </span>
              ) : (
                <span className="cl-calc num">
                  {fmt(t.list.nFree, { n: l.free, when })}
                </span>
              )}
              <span style={{ flex: 1 }} />
              <span className="stepper">
                <button type="button" aria-label={t.list.fewer} disabled={l.qty <= 1} onClick={() => step(l.it.id, -1)}>
                  −
                </button>
                <span className="num">{l.qty}</span>
                <button
                  type="button"
                  aria-label={t.list.more}
                  disabled={l.qty >= Math.max(l.free, 1)}
                  onClick={() => step(l.it.id, 1)}
                >
                  +
                </button>
              </span>
              <button type="button" className="link" onClick={() => remove(l.it.id)}>
                {t.list.remove}
              </button>
            </div>
          </div>
        ))}
        <div className="csub">
          <span>{req ? fmt(t.list.subtotalOnRequest, { n: req }) : t.list.subtotal}</span>
          <b className="num">{money(sub, co.cur)}</b>
        </div>
      </section>
    );
  });

  return (
    <>
      <div className="drawer-scrim" onClick={() => setCartOpen(false)} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={t.list.title}>
        <header>
          <h2>{t.list.title}</h2>
          <span className="num muted" style={{ fontSize: 13 }}>
            {plural(lines.length, t.list.items)}
            {groups.length > 1 ? fmt(t.list.companies, { n: groups.length }) : ""}
          </span>
          <button ref={closeBtn} className="x" type="button" aria-label={t.list.close} onClick={() => setCartOpen(false)}>
            ×
          </button>
        </header>
        <div className="db">
          <div className="two">
            <div className="field">
              <label htmlFor="cartFrom">{t.list.pickup}</label>
              <input
                id="cartFrom"
                type="date"
                min={isoIn(0)}
                value={dates.from}
                onChange={(e) => e.target.value && setDates({ from: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="cartTo">{t.list.return}</label>
              <input
                id="cartTo"
                type="date"
                min={dates.from}
                value={dates.to}
                onChange={(e) => e.target.value && setDates({ to: e.target.value })}
              />
            </div>
          </div>
          {lines.length ? (
            sections
          ) : (
            <div className="empty">
              <h3>{t.list.emptyTitle}</h3>
              <p>{t.list.emptyText}</p>
            </div>
          )}
        </div>
        {lines.length > 0 && (
          <footer>
            <div className="grand">
              <span>
                {fmt(t.list.estimated, { days: dl })}
                {onReq > 0 && (
                  <>
                    <br />
                    <span className="num muted" style={{ fontSize: 13 }}>
                      {plural(onReq, t.list.pricedOnRequest)}
                    </span>
                  </>
                )}
                {Object.keys(grand).length > 1 && (
                  <>
                    <br />
                    <span className="muted" style={{ fontSize: 13 }}>{t.list.ownCurrency}</span>
                  </>
                )}
              </span>
              <b className="num">
                {Object.entries(grand)
                  .map(([c, v]) => money(v, c))
                  .join(" + ")}
              </b>
            </div>
            <div className="disclose" role="note">
              <span aria-hidden="true">ⓘ</span>
              <span>
                <b>{t.list.disclaimerTitle}</b> {t.list.disclaimer}
              </span>
            </div>
            <SendList groups={groups} dates={dates} />
          </footer>
        )}
      </aside>
    </>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { coords } from "@/lib/places";
import { companyById, itemById } from "@/lib/sample-data";
import { SRC_LABEL, dayCount, fmtDist, freeFor, isoIn, miles, money, rangeLabel, unitFor } from "@/lib/search";
import type { Company, Item } from "@/lib/types";
import { useApp } from "./AppState";
import { useGearList } from "./useGearList";

interface Line {
  it: Item;
  co: Company;
  qty: number;
  free: number;
}

export function GearListDrawer() {
  const { cartOpen, setCartOpen, cart, dates, setDates, place, ready } = useApp();
  const { step, remove } = useGearList();
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
  const dl = `${days} day${days > 1 ? "s" : ""}`;
  const when = rangeLabel(dates);
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
    for (const l of ls) {
      if (l.it.pub) sub += l.it.rate * l.qty * days;
      else req++;
    }
    grand[co.cur] = (grand[co.cur] ?? 0) + sub;
    onReq += req;
    return (
      <section className="cgroup" key={co.id}>
        <h3>
          {co.name}{" "}
          <span className="num">
            {co.city} · {fmtDist(miles(place.ll, coords(co.city, co.off)), unit)} · rates from{" "}
            {co.src === "manual" ? "spreadsheet" : SRC_LABEL[co.src]}
          </span>
        </h3>
        {ls.map((l) => (
          <div className="cline" key={l.it.id}>
            <div className="cl-name">
              {l.it.name}
              <div className="cl-calc num">
                {l.it.pub ? `${money(l.it.rate, co.cur)}/day × ${l.qty} × ${dl}` : "Price shared by message"}
              </div>
            </div>
            <div className="cl-total num">{l.it.pub ? money(l.it.rate * l.qty * days, co.cur) : "On request"}</div>
            <div className="cl-ctrl">
              {l.qty > l.free ? (
                <span className="pill warn">
                  {l.free ? `Only ${l.free}` : "None"} free {when}
                </span>
              ) : (
                <span className="cl-calc num">
                  {l.free} free {when}
                </span>
              )}
              <span style={{ flex: 1 }} />
              <span className="stepper">
                <button type="button" aria-label="One fewer" disabled={l.qty <= 1} onClick={() => step(l.it.id, -1)}>
                  −
                </button>
                <span className="num">{l.qty}</span>
                <button
                  type="button"
                  aria-label="One more"
                  disabled={l.qty >= Math.max(l.free, 1)}
                  onClick={() => step(l.it.id, 1)}
                >
                  +
                </button>
              </span>
              <button type="button" className="link" onClick={() => remove(l.it.id)}>
                Remove
              </button>
            </div>
          </div>
        ))}
        <div className="csub">
          <span>Subtotal{req ? ` · ${req} on request` : ""}</span>
          <b className="num">{money(sub, co.cur)}</b>
        </div>
      </section>
    );
  });

  return (
    <>
      <div className="drawer-scrim" onClick={() => setCartOpen(false)} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Gear list">
        <header>
          <h2>Gear list</h2>
          <span className="num muted" style={{ fontSize: 13 }}>
            {lines.length} item{lines.length === 1 ? "" : "s"}
            {groups.length > 1 ? ` · ${groups.length} companies` : ""}
          </span>
          <button ref={closeBtn} className="x" type="button" aria-label="Close" onClick={() => setCartOpen(false)}>
            ×
          </button>
        </header>
        <div className="db">
          <div className="two">
            <div className="field">
              <label htmlFor="cartFrom">Pickup</label>
              <input
                id="cartFrom"
                type="date"
                min={isoIn(0)}
                value={dates.from}
                onChange={(e) => e.target.value && setDates({ from: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="cartTo">Return</label>
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
              <h3>Your list is empty</h3>
              <p>Search for gear and tap Add to list. You can mix items from different companies and get one estimate.</p>
            </div>
          )}
        </div>
        {lines.length > 0 && (
          <footer>
            <div className="grand">
              <span>
                Estimated total · <span className="num">{dl}</span>
                {onReq > 0 && (
                  <>
                    <br />
                    <span className="num muted" style={{ fontSize: 13 }}>
                      + {onReq} item{onReq > 1 ? "s" : ""} priced on request
                    </span>
                  </>
                )}
                {Object.keys(grand).length > 1 && (
                  <>
                    <br />
                    <span className="muted" style={{ fontSize: 13 }}>In each company&apos;s own currency</span>
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
                <b>This is an estimate, not a quote.</b> Prices are calculated automatically from each company&apos;s
                rental software and may be out of date or wrong. They don&apos;t include delivery, labor, tax or package
                deals. Availability is checked for your dates but isn&apos;t held until the company confirms. Please
                message each company to confirm the final price.
              </span>
            </div>
            <button className="btn primary" type="button" disabled title="Needs sign-in and messages, coming next">
              Send list to {groups.length} compan{groups.length > 1 ? "ies" : "y"}
            </button>
            <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
              Sending turns on once sign-in and messages are connected.
            </p>
          </footer>
        )}
      </aside>
    </>
  );
}

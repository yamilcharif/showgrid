"use client";

import { useMemo, useState } from "react";
import {
  CAT_ABBR,
  RADII,
  SRC_LABEL,
  fmtDist,
  minutesSince,
  money,
  rangeLabel,
  runSearch,
  syncAgo,
  type CrewHit,
  type GearHit,
  type Unit,
} from "@/lib/search";
import { startConversation } from "@/app/messages/actions";
import type { Category, InventorySource } from "@/lib/types";
import { useListings } from "./Listings";
import { useApp } from "./AppState";
import { useGearList } from "./useGearList";

type Tab = "all" | "gear" | "crew";

const CATS = Object.keys(CAT_ABBR) as Category[];
const SRCS: InventorySource[] = ["rentman", "flex", "manual"];

const initials = (n: string) =>
  n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

export function Results() {
  const listings = useListings();
  const { ready, q, place, radiusIdx, setRadiusIdx, setPlace, dates } = useApp();
  const [tab, setTab] = useState<Tab>("all");
  const [cats, setCats] = useState<Set<Category>>(new Set());
  const [srcs, setSrcs] = useState<Set<InventorySource>>(new Set());
  const [freeOnly, setFreeOnly] = useState(false);

  const res = useMemo(
    () => (ready ? runSearch({ q, place, radiusIdx, dates, listings }) : null),
    [ready, q, place, radiusIdx, dates, listings],
  );

  if (!res) {
    return (
      <div className="layout">
        <div />
        <p className="summary">Loading listings…</p>
      </div>
    );
  }

  const { P, unit } = res;
  const catCount: Partial<Record<Category, number>> = {};
  res.gear.forEach((g) => (catCount[g.it.cat] = (catCount[g.it.cat] ?? 0) + 1));
  const gear = res.gear.filter((g) => (!cats.size || cats.has(g.it.cat)) && (!srcs.size || srcs.has(g.co.src)));
  const crew = res.crew.filter((c) => !freeOnly || c.free);

  const toggle = <T,>(set: Set<T>, v: T, apply: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    apply(next);
  };

  const r = RADII[unit][radiusIdx];
  const where = place.country ? `in ${place.label}` : r === Infinity ? "anywhere" : `within ${r} ${unit} of ${place.label}`;
  const when = rangeLabel(dates);
  const crewFirst = tab === "all" && P.crewy && crew.length > 0;
  const showGear = tab !== "crew";
  const showCrew = tab !== "gear";

  const gearBlock = showGear && gear.length > 0 && (
    <>
      <div className="group-h">
        <h2>Gear</h2>
        <span className="num">{gear.length} listing{gear.length > 1 ? "s" : ""}</span>
      </div>
      {gear.slice(0, tab === "all" ? 12 : 60).map((g) => (
        <GearRow key={g.it.id} g={g} need={P.need} unit={unit} when={when} />
      ))}
      {tab === "all" && gear.length > 12 && (
        <button type="button" className="btn" onClick={() => setTab("gear")}>
          Show all {gear.length} gear listings
        </button>
      )}
    </>
  );

  const crewBlock = showCrew && crew.length > 0 && (
    <>
      <div className="group-h">
        <h2>Crew</h2>
        <span className="num">{crew.length} profile{crew.length > 1 ? "s" : ""}</span>
      </div>
      {crew.slice(0, tab === "all" ? 6 : 60).map((c) => (
        <CrewRow key={c.t.id} c={c} unit={unit} when={when} />
      ))}
      {tab === "all" && crew.length > 6 && (
        <button type="button" className="btn" onClick={() => setTab("crew")}>
          Show all {crew.length} crew
        </button>
      )}
    </>
  );

  return (
    <div className="layout">
      <aside className="rail" aria-label="Filters">
        <div>
          <h3>Category</h3>
          {CATS.map((c) => (
            <label key={c} className="opt">
              <input type="checkbox" checked={cats.has(c)} onChange={() => toggle(cats, c, setCats)} /> {c}
              <span className="ct num">{catCount[c] ?? 0}</span>
            </label>
          ))}
        </div>
        <div>
          <h3>Inventory source</h3>
          {SRCS.map((s) => (
            <label key={s} className="opt">
              <input type="checkbox" checked={srcs.has(s)} onChange={() => toggle(srcs, s, setSrcs)} /> {SRC_LABEL[s]}
            </label>
          ))}
          <h3 style={{ marginTop: 16 }}>Crew</h3>
          <label className="opt">
            <input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} /> Free on my dates only
          </label>
        </div>
      </aside>

      <div style={{ minWidth: 0 }}>
        <div className="tabs" role="tablist" id="results-top">
          {(
            [
              ["all", "All", gear.length + crew.length],
              ["gear", "Gear", gear.length],
              ["crew", "Crew", crew.length],
            ] as const
          ).map(([k, label, n]) => (
            <button key={k} type="button" className="tab" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
              {label}
              <span className="n num">{n}</span>
            </button>
          ))}
        </div>
        <p className="summary">
          {q ? (
            <>
              Results for <strong>“{q}”</strong> {where}, free {when}
              {P.need > 0 && (
                <>
                  {" "}· looking for <strong>{P.need}</strong> units
                </>
              )}
              . Free on your dates first, then closest.
            </>
          ) : (
            <>Everything listed {where}, free {when}. Type your problem above to narrow it down.</>
          )}
        </p>
        <div className="list">
          {crewFirst ? (
            <>
              {crewBlock}
              {gearBlock}
            </>
          ) : (
            <>
              {gearBlock}
              {crewBlock}
            </>
          )}
          {!gearBlock && !crewBlock && (
            <div className="empty">
              <h3>Nobody nearby has that yet</h3>
              <p>Try a wider distance, fewer words, or a category like “lighting”, “rigging” or “LED wall”.</p>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  if (place.country) setPlace({ ...place, country: false });
                  setRadiusIdx(4);
                }}
              >
                Search anywhere
              </button>
            </div>
          )}
        </div>
        <div className="how">
          <div>
            <h4>Rental houses</h4>
            <p>Connect Rentman or Flex once. Your rentable stock and availability show up here and stay in sync. Hide anything you don&apos;t want listed.</p>
          </div>
          <div>
            <h4>Techs &amp; engineers</h4>
            <p>Create a crew profile with your role, the gear you know, day rate and home base. Companies near you find you when they&apos;re short-handed.</p>
          </div>
          <div>
            <h4>Everyone</h4>
            <p>Type the problem the way you&apos;d say it on a call. Add gear to one list across companies, see an estimated total, then confirm the final price by message.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function GearRow({ g, need, unit, when }: { g: GearHit; need: number; unit: Unit; when: string }) {
  const { it, co, d, free } = g;
  const { cart, setCartOpen } = useApp();
  const { add } = useGearList();
  const inList = cart.find((l) => l.id === it.id);
  const short = need > 0 && free < need;
  return (
    <article className="row">
      <div className="cat" aria-hidden="true">{CAT_ABBR[it.cat]}</div>
      <div className="body">
        <div className="name">{it.name}</div>
        <div className="spec mono">{it.spec}</div>
        <div className="who">
          <span className="co">{co.name}</span>
          <span className="muted num">{co.city} · {fmtDist(d, unit)}</span>
          <span className={`pill${co.src === "manual" ? "" : " live"}`}>
            <i />
            {co.src === "manual" ? "Spreadsheet" : `Live from ${SRC_LABEL[co.src]} · ${syncAgo(co.syncedAt ? minutesSince(co.syncedAt) : co.syncMin)}`}
          </span>
        </div>
      </div>
      <div className="side">
        {it.pub ? (
          <div className="rate num">
            {money(it.rate, co.cur)}
            <small> /day</small>
          </div>
        ) : (
          <div className="rate req">Price on request</div>
        )}
        <div className="avail num">
          {free === 0 ? (
            <span className="pill warn">Booked {when}</span>
          ) : short ? (
            <span className="pill warn">{free} free {when} · you need {need}</span>
          ) : need ? (
            <span className="pill ok">{free} free {when} · covers {need}</span>
          ) : (
            <>
              <b>{free}</b> of {it.total} free {when}
            </>
          )}
        </div>
        <div className="btns">
          {inList ? (
            <button type="button" className="btn sm" onClick={() => setCartOpen(true)}>
              In list · {inList.qty}
            </button>
          ) : (
            <button type="button" className="btn sm primary" onClick={() => add(it.id)}>
              Add to list
            </button>
          )}
          {co.profileId && (
            <form action={startConversation}>
              <input type="hidden" name="to" value={co.profileId} />
              <button className="btn sm">Message</button>
            </form>
          )}
        </div>
      </div>
    </article>
  );
}

function CrewRow({ c, unit, when }: { c: CrewHit; unit: Unit; when: string }) {
  const { t, d, free } = c;
  return (
    <article className="row">
      <div className="cat crew" aria-hidden="true">
        {initials(t.name)}
        {free && <span className="tally" />}
      </div>
      <div className="body">
        <div className="name">
          {t.name} <span style={{ fontWeight: 500, color: "var(--muted)" }}>· {t.role}</span>
        </div>
        <div className="who">
          <span className="muted num">{t.city} · {fmtDist(d, unit)}</span>
          <span className="muted num">{t.yrs} yrs</span>
          {free ? (
            <span className="pill live"><i />Free {when}</span>
          ) : (
            <span className="pill">Booked {when}</span>
          )}
        </div>
        <div className="tags">
          {t.skills.map((s) => (
            <span key={s} className="tag">{s}</span>
          ))}
        </div>
      </div>
      <div className="side">
        <div className="rate num">
          {t.rate ? (
            <>
              {money(t.rate, t.cur)}
              <small> /day</small>
            </>
          ) : (
            <small>Rate on request</small>
          )}
        </div>
        <div className="btns">
          {t.profileId ? (
            <form action={startConversation}>
              <input type="hidden" name="to" value={t.profileId} />
              <button className="btn sm">Message</button>
            </form>
          ) : (
            <button type="button" className="btn sm" disabled title="Sample listing: messaging opens when real crew join">
              Message
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

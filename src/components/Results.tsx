"use client";

import Link from "next/link";
import { fmt, plural } from "@/lib/i18n/config";
import { useMemo, useState } from "react";
import {
  CAT_ABBR,
  RADII,
  SRC_LABEL,
  fmtDist,
  isFeatured,
  minutesSince,
  money,
  rangeLabel,
  runSearch,
  syncAgo,
  type CrewHit,
  type GearHit,
  type Unit,
} from "@/lib/search";
import { startConversation } from "@/app/[lang]/messages/actions";
import type { Category, InventorySource } from "@/lib/types";
import { useListings } from "./Listings";
import { useI18n, useT } from "./I18n";
import { useApp } from "./AppState";
import { useGearList } from "./useGearList";

type Tab = "all" | "gear" | "crew";

const CATS = Object.keys(CAT_ABBR) as Category[];
const SRCS: InventorySource[] = ["rentman", "flex", "manual"];

const initials = (n: string) =>
  n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

export function Results() {
  const listings = useListings();
  const { t, locale } = useI18n();
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
        <p className="summary">{t.results.loading}</p>
      </div>
    );
  }

  const { P, unit } = res;
  const catCount: Partial<Record<Category, number>> = {};
  res.gear.forEach((g) => (catCount[g.it.cat] = (catCount[g.it.cat] ?? 0) + 1));
  // no search and no category picked: show headline gear (movers, consoles, LED…), most valuable first
  const featured = !q && !cats.size;
  const matched = res.gear.filter((g) => (!cats.size || cats.has(g.it.cat)) && (!srcs.size || srcs.has(g.co.src)));
  const gear = featured
    ? matched.filter((g) => isFeatured(g.it)).sort((a, b) => Number(!a.free) - Number(!b.free) || b.it.rate - a.it.rate)
    : matched;
  const crew = res.crew.filter((c) => !freeOnly || c.free);

  const toggle = <T,>(set: Set<T>, v: T, apply: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    apply(next);
  };

  const r = RADII[unit][radiusIdx];
  const where = place.country
    ? fmt(t.results.in, { place: place.label })
    : r === Infinity
      ? t.results.anywhere
      : fmt(t.results.within, { r, unit, place: place.label });
  const when = rangeLabel(dates, locale);
  const crewFirst = tab === "all" && P.crewy && crew.length > 0;
  const showGear = tab !== "crew";
  const showCrew = tab !== "gear";

  const gearBlock = showGear && gear.length > 0 && (
    <>
      <div className="group-h">
        <h2>{featured ? t.results.featured : t.results.gear}</h2>
        <span className="num">{plural(gear.length, t.results.listings)}</span>
      </div>
      {gear.slice(0, tab === "all" ? 12 : 60).map((g) => (
        <GearRow key={g.it.id} g={g} need={P.need} unit={unit} when={when} />
      ))}
      {tab === "all" && gear.length > 12 && (
        <button type="button" className="btn" onClick={() => setTab("gear")}>
          {fmt(t.results.showAllGear, { n: gear.length })}
        </button>
      )}
    </>
  );

  const crewBlock = showCrew && crew.length > 0 && (
    <>
      <div className="group-h">
        <h2>{t.results.crew}</h2>
        <span className="num">{plural(crew.length, t.results.profiles)}</span>
      </div>
      {crew.slice(0, tab === "all" ? 6 : 60).map((c) => (
        <CrewRow key={c.t.id} c={c} unit={unit} when={when} />
      ))}
      {tab === "all" && crew.length > 6 && (
        <button type="button" className="btn" onClick={() => setTab("crew")}>
          {fmt(t.results.showAllCrew, { n: crew.length })}
        </button>
      )}
    </>
  );

  return (
    <div className="layout">
      <aside className="rail" aria-label={t.results.filters}>
        <div>
          <h3>{t.results.category}</h3>
          {CATS.map((c) => (
            <label key={c} className="opt">
              <input type="checkbox" checked={cats.has(c)} onChange={() => toggle(cats, c, setCats)} /> {t.categories[c]}
              <span className="ct num">{catCount[c] ?? 0}</span>
            </label>
          ))}
        </div>
        <div>
          <h3>{t.results.source}</h3>
          {SRCS.map((s) => (
            <label key={s} className="opt">
              <input type="checkbox" checked={srcs.has(s)} onChange={() => toggle(srcs, s, setSrcs)} /> {SRC_LABEL[s]}
            </label>
          ))}
          <h3 style={{ marginTop: 16 }}>{t.results.crew}</h3>
          <label className="opt">
            <input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} /> {t.results.freeOnly}
          </label>
        </div>
      </aside>

      <div style={{ minWidth: 0 }}>
        <div className="tabs" role="tablist" id="results-top">
          {(
            [
              ["all", t.results.all, gear.length + crew.length],
              ["gear", t.results.gear, gear.length],
              ["crew", t.results.crew, crew.length],
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
              {fmt(t.results.resultsFor, { q, where, when })}
              {P.need > 0 && fmt(t.results.lookingFor, { n: P.need })}
              {t.results.sortNote}
            </>
          ) : (
            <>
              {fmt(t.results.featuredSummary, { where, when })}
            </>
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
              <h3>{t.results.emptyTitle}</h3>
              <p>{t.results.emptyText}</p>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  if (place.country) setPlace({ ...place, country: false });
                  setRadiusIdx(4);
                }}
              >
                {t.results.searchAnywhere}
              </button>
            </div>
          )}
        </div>
        <div className="how">
          <div>
            <h4>{t.results.howCompaniesTitle}</h4>
            <p>{t.results.howCompanies}</p>
          </div>
          <div>
            <h4>{t.results.howCrewTitle}</h4>
            <p>{t.results.howCrew}</p>
          </div>
          <div>
            <h4>{t.results.howAllTitle}</h4>
            <p>{t.results.howAll}</p>
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
  const t = useT();
  return (
    <article className="row">
      <div className="cat" aria-hidden="true">{CAT_ABBR[it.cat]}</div>
      <div className="body">
        <div className="name">{it.name}</div>
        <div className="spec mono">{it.spec}</div>
        <div className="who">
          <Link className="co" href={`/c/${co.slug}`}>{co.name}</Link>
          <span className="muted num">{co.city} · {fmtDist(d, unit)}</span>
          <span className={`pill${co.src === "manual" ? "" : " live"}`}>
            <i />
            {co.src === "manual"
              ? t.results.spreadsheet
              : fmt(t.results.liveFrom, { src: SRC_LABEL[co.src] }) + (co.syncedAt ? ` · ${syncAgo(minutesSince(co.syncedAt), t.time)}` : "")}
          </span>
        </div>
      </div>
      <div className="side">
        {it.pub ? (
          <div className="rate num">
            {money(it.rate, co.cur)}
            <small> {t.results.perDay}</small>
          </div>
        ) : (
          <div className="rate req">{t.results.priceOnRequest}</div>
        )}
        <div className="avail num">
          {free === 0 ? (
            <span className="pill warn">{fmt(t.results.booked, { when })}</span>
          ) : short ? (
            <span className="pill warn">{fmt(t.results.freeShort, { free, when, need })}</span>
          ) : need ? (
            <span className="pill ok">{fmt(t.results.freeCovers, { free, when, need })}</span>
          ) : (
            <>
              <b>{free}</b> {fmt(t.results.freeOf, { total: it.total, when })}
            </>
          )}
        </div>
        <div className="btns">
          {inList ? (
            <button type="button" className="btn sm" onClick={() => setCartOpen(true)}>
              {fmt(t.results.inList, { n: inList.qty })}
            </button>
          ) : (
            <button type="button" className="btn sm primary" onClick={() => add(it.id)}>
              {t.results.addToList}
            </button>
          )}
          <form action={startConversation}>
            <input type="hidden" name="to" value={co.profileId} />
            <button className="btn sm">{t.results.message}</button>
          </form>
        </div>
      </div>
    </article>
  );
}

function CrewRow({ c, unit, when }: { c: CrewHit; unit: Unit; when: string }) {
  const { t: tech, d, free } = c;
  const t = useT();
  return (
    <article className="row">
      <div className="cat crew" aria-hidden="true">
        {initials(tech.name)}
        {free && <span className="tally" />}
      </div>
      <div className="body">
        <div className="name">
          {tech.name} <span style={{ fontWeight: 500, color: "var(--muted)" }}>· {tech.role}</span>
        </div>
        <div className="who">
          <span className="muted num">{tech.city} · {fmtDist(d, unit)}</span>
          <span className="muted num">{fmt(t.results.years, { n: tech.yrs })}</span>
          {free ? (
            <span className="pill live"><i />{fmt(t.results.free, { when })}</span>
          ) : (
            <span className="pill">{fmt(t.results.busy, { when })}</span>
          )}
        </div>
        <div className="tags">
          {tech.skills.map((s) => (
            <span key={s} className="tag">{s}</span>
          ))}
        </div>
      </div>
      <div className="side">
        <div className="rate num">
          {tech.rate ? (
            <>
              {money(tech.rate, tech.cur)}
              <small> {t.results.perDay}</small>
            </>
          ) : (
            <small>{t.results.rateOnRequest}</small>
          )}
        </div>
        <div className="btns">
          <form action={startConversation}>
            <input type="hidden" name="to" value={tech.profileId} />
            <button className="btn sm">{t.results.message}</button>
          </form>
        </div>
      </div>
    </article>
  );
}

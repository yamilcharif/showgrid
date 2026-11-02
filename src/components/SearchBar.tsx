"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { RADII, isoIn, statsFor, unitFor } from "@/lib/search";
import { useListings } from "./Listings";
import { useT } from "./I18n";
import { useApp } from "./AppState";
import { LocationBox } from "./LocationBox";
import { SearchIcon } from "./icons";

export function SearchBar() {
  const { place, setPlace, radiusIdx, setRadiusIdx, dates, setDates, setQ, ready } = useApp();
  const [text, setText] = useState("");
  const unit = unitFor(place);
  const t = useT();
  const listings = useListings();
  const STATS = useMemo(() => statsFor(listings), [listings]);

  const run = (q: string) => {
    setQ(q.trim());
    document.getElementById("results-top")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <form
        className="search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          run(text);
        }}
      >
        <label className="q" htmlFor="q">
          <SearchIcon />
          <input
            id="q"
            className="q-input"
            type="search"
            placeholder={t.search.placeholder}
            aria-label={t.search.placeholder}
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <LocationBox value={place} onChange={setPlace} />
        <div className="dates">
          <label className="dt" htmlFor="fromD">
            <span>{t.search.from}</span>
            <input
              id="fromD"
              type="date"
              required
              disabled={!ready}
              min={ready ? isoIn(0) : undefined}
              value={dates.from}
              onChange={(e) => e.target.value && setDates({ from: e.target.value })}
            />
          </label>
          <span className="dash" aria-hidden="true">→</span>
          <label className="dt" htmlFor="toD">
            <span>{t.search.to}</span>
            <input
              id="toD"
              type="date"
              required
              disabled={!ready}
              min={dates.from || undefined}
              value={dates.to}
              onChange={(e) => e.target.value && setDates({ to: e.target.value })}
            />
          </label>
        </div>
        <select
          id="radius"
          aria-label={t.search.distance}
          disabled={place.country}
          value={place.country ? "country" : radiusIdx}
          onChange={(e) => setRadiusIdx(Number(e.target.value))}
        >
          {place.country ? (
            <option value="country">{t.search.wholeCountry}</option>
          ) : (
            RADII[unit].map((r, i) => (
              <option key={i} value={i}>
                {r === Infinity ? t.search.anywhere : `${r} ${unit}`}
              </option>
            ))
          )}
        </select>
        <button className="btn go" type="submit">
          {t.search.findIt}
        </button>
      </form>

      <div className="chips">
        <span className="lbl">{t.search.try}</span>
        {t.search.chips.map((c) => (
          <button
            key={c}
            type="button"
            className="chip"
            onClick={() => {
              setText(c);
              setQ(c);
            }}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="stats">
        <Link href="/companies" className="stat-link">
          <strong className="num">{STATS.companies}</strong>
          {STATS.companies === 1 ? t.search.statCompanies[0] : t.search.statCompanies[1]} →
        </Link>
        <div><strong className="num">{STATS.units.toLocaleString("en-US")}</strong>{t.search.statUnits}</div>
        <Link href="/crew" className="stat-link">
          <strong className="num">{STATS.techs}</strong>
          {STATS.techs === 1 ? t.search.statTechs[0] : t.search.statTechs[1]} →
        </Link>
        <Link href="/countries" className="stat-link">
          <strong className="num">{STATS.countries}</strong>
          {STATS.countries === 1 ? t.search.statCountries[0] : t.search.statCountries[1]} →
        </Link>
        <div><strong>Rentman · Flex</strong>{t.search.statSync}</div>
      </div>
    </>
  );
}

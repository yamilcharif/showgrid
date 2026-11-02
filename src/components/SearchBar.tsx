"use client";

import { useMemo, useState } from "react";
import { RADII, isoIn, statsFor, unitFor } from "@/lib/search";
import { useListings } from "./Listings";
import { useApp } from "./AppState";
import { LocationBox } from "./LocationBox";
import { SearchIcon } from "./icons";

const CHIPS = ["8 moving heads", "Need a FOH engineer", "LED wall", "Chain motors", "Hazer", "grandMA3", "Generator", "Rigger"];

export function SearchBar() {
  const { place, setPlace, radiusIdx, setRadiusIdx, dates, setDates, setQ, ready } = useApp();
  const [text, setText] = useState("");
  const unit = unitFor(place);
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
            placeholder="What's your problem?"
            aria-label="What's your problem?"
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <LocationBox value={place} onChange={setPlace} />
        <div className="dates">
          <label className="dt" htmlFor="fromD">
            <span>From</span>
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
            <span>To</span>
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
          aria-label="Distance"
          disabled={place.country}
          value={place.country ? "country" : radiusIdx}
          onChange={(e) => setRadiusIdx(Number(e.target.value))}
        >
          {place.country ? (
            <option value="country">Whole country</option>
          ) : (
            RADII[unit].map((r, i) => (
              <option key={i} value={i}>
                {r === Infinity ? "Anywhere" : `${r} ${unit}`}
              </option>
            ))
          )}
        </select>
        <button className="btn go" type="submit">
          Find it
        </button>
      </form>

      <div className="chips">
        <span className="lbl">Try</span>
        {CHIPS.map((c) => (
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
        <div><strong className="num">{STATS.companies}</strong>rental houses</div>
        <div><strong className="num">{STATS.units.toLocaleString("en-US")}</strong>units listed</div>
        <div><strong className="num">{STATS.techs}</strong>techs &amp; engineers</div>
        <div><strong className="num">{STATS.countries}</strong>countries</div>
        <div><strong>Rentman · Flex</strong>live inventory sync</div>
      </div>
    </>
  );
}

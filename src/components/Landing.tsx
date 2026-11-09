"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { useApp } from "./AppState";
import { CompanyCards } from "./directory/CompanyCards";
import { CrewCards } from "./directory/CrewCards";
import { useT } from "./I18n";
import { useListings } from "./Listings";

/** The home page before anyone searches: who it's for, and a taste of what's on it. */
export function Landing() {
  const t = useT();
  const L = t.landing;
  const { items, companies, techs, companyById } = useListings();
  const { setQ } = useApp();

  // a photo strip of real gear: only items with photos, most valuable first, one photo once, no prices
  const strip = useMemo(() => {
    const seen = new Set<string>();
    return items
      .filter((i) => i.image && !seen.has(i.image) && seen.add(i.image))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 10);
  }, [items]);

  const search = () => document.getElementById("q")?.focus();

  return (
    <div className="landing">
      {strip.length > 0 && (
        <section className="l-strip">
          <div className="l-head">
            <h2>{L.nowTitle}</h2>
            <button type="button" className="link" onClick={() => setQ(" ")}>
              {L.seeAllGear} →
            </button>
          </div>
          <div className="strip">
            {strip.map((it) => {
              const co = companyById(it.co);
              return (
                <Link key={it.id} href={co ? `/c/${co.slug}` : "/companies"} className="strip-card">
                  <div className="strip-img">
                    <Image src={it.image!} alt="" fill sizes="180px" />
                  </div>
                  <b>{it.name}</b>
                  <span className="muted small">{co?.name}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="l-who">
        <h2>{L.whoTitle}</h2>
        <div className="who-grid">
          <article>
            <span className="who-icon" aria-hidden="true">
              ▦
            </span>
            <h3>{L.companiesTitle}</h3>
            <p>{L.companiesText}</p>
            <Link className="btn primary" href="/sign-in?new=1">
              {L.companiesCta}
            </Link>
          </article>
          <article>
            <span className="who-icon" aria-hidden="true">
              ◉
            </span>
            <h3>{L.crewTitle}</h3>
            <p>{L.crewText}</p>
            <Link className="btn primary" href="/sign-in?new=1">
              {L.crewCta}
            </Link>
          </article>
          <article>
            <span className="who-icon" aria-hidden="true">
              ⌕
            </span>
            <h3>{L.clientsTitle}</h3>
            <p>{L.clientsText}</p>
            <button type="button" className="btn primary" onClick={search}>
              {L.clientsCta}
            </button>
          </article>
        </div>
      </section>

      {companies.length > 0 && (
        <section className="l-dir">
          <div className="l-head">
            <h2>{L.directoryTitle}</h2>
            <Link href="/companies">{L.seeAll}</Link>
          </div>
          <CompanyCards companies={companies.slice(0, 3)} />
        </section>
      )}
      {techs.length > 0 && (
        <section className="l-dir">
          <div className="l-head">
            <h2>{L.crewDirTitle}</h2>
            <Link href="/crew">{L.seeAll}</Link>
          </div>
          <CrewCards techs={techs.slice(0, 3)} />
        </section>
      )}

      <aside className="feedback-banner">
        <div>
          <h3>{t.results.feedbackTitle}</h3>
          <p>{t.results.feedbackText}</p>
        </div>
        <Link className="btn primary" href="/suggestions">
          💡 {t.results.feedbackCta}
        </Link>
      </aside>

    </div>
  );
}

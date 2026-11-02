"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useI18n } from "@/components/I18n";
import { useListings } from "@/components/Listings";
import { countryName, flag } from "@/lib/flags";
import { plural } from "@/lib/i18n/config";
import { ccOf } from "@/lib/places";

/** One flag card per country that has rental houses or crew. */
export function CountryGrid() {
  const { companies, techs } = useListings();
  const { t, locale } = useI18n();

  const countries = useMemo(() => {
    const m = new Map<string, { companies: number; crew: number }>();
    const bump = (cc: string, k: "companies" | "crew") => {
      const c = m.get(cc) ?? { companies: 0, crew: 0 };
      c[k]++;
      m.set(cc, c);
    };
    companies.forEach((c) => bump(ccOf(c.city), "companies"));
    techs.forEach((x) => bump(ccOf(x.city), "crew"));
    return [...m]
      .map(([cc, n]) => ({ cc, name: countryName(cc, locale), ...n }))
      .sort((a, b) => b.companies + b.crew - (a.companies + a.crew) || a.name.localeCompare(b.name, locale));
  }, [companies, techs, locale]);

  if (!countries.length) return <p className="muted">{t.countries.empty}</p>;
  return (
    <div className="country-grid">
      {countries.map((c) => (
        <Link key={c.cc} href={`/countries/${c.cc.toLowerCase()}`} className="country-card">
          <span className="country-flag" aria-hidden="true">
            {flag(c.cc)}
          </span>
          <span className="country-name">{c.name}</span>
          <span className="muted small num">
            {plural(c.companies, t.countries.companies)} · {plural(c.crew, t.countries.crew)}
          </span>
        </Link>
      ))}
    </div>
  );
}

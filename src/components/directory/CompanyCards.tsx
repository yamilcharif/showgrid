"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { useT } from "@/components/I18n";
import { useListings } from "@/components/Listings";
import { fmt, plural } from "@/lib/i18n/config";
import { SRC_LABEL } from "@/lib/search";
import { initials } from "@/lib/initials";
import type { Company, Item } from "@/lib/types";

/** Rental houses as cards: a few gear photos, logo, name, city and size. */
export function CompanyCards({ companies }: { companies: Company[] }) {
  const { items } = useListings();
  const t = useT();

  const cards = useMemo(() => {
    const byCo = new Map<string, Item[]>();
    for (const i of items) byCo.set(i.co, [...(byCo.get(i.co) ?? []), i]);
    return companies
      .map((co) => {
        const gear = byCo.get(co.id) ?? [];
        // the most valuable gear with photos makes the thumbnail (several items can share one photo)
        const photos = [...new Set(gear.filter((i) => i.image).sort((a, b) => b.rate - a.rate).map((i) => i.image!))].slice(0, 3);
        return { co, count: gear.length, units: gear.reduce((n, i) => n + i.total, 0), photos };
      })
      .sort((a, b) => b.count - a.count || a.co.name.localeCompare(b.co.name));
  }, [companies, items]);

  return (
    <div className="dir-grid">
      {cards.map(({ co, count, units, photos }) => (
        <Link key={co.id} href={`/c/${co.slug}`} className="dir-card">
          <div className={`dir-thumb n${photos.length}`}>
            {photos.length ? (
              photos.map((src) => (
                <div key={src} className="dir-ph">
                  <Image src={src} alt="" fill sizes="(max-width: 640px) 50vw, 160px" />
                </div>
              ))
            ) : (
              <span className="dir-initials" aria-hidden="true">
                {initials(co.name)}
              </span>
            )}
          </div>
          <div className="dir-body">
            {co.logo && (
              <div className="dir-logo">
                <Image src={co.logo} alt="" fill sizes="56px" />
              </div>
            )}
            <h2>{co.name}</h2>
            <p className="muted small">{co.city}</p>
            <p className="small num">
              {plural(count, t.companies.items)} · {plural(units, t.companies.units)}
            </p>
            {co.src !== "manual" && (
              <span className="pill live">
                <i />
                {fmt(t.results.liveFrom, { src: SRC_LABEL[co.src] })}
              </span>
            )}
            <span className="dir-cta">{t.companies.view} →</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

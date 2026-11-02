"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useT } from "@/components/I18n";
import { useListings } from "@/components/Listings";
import { fmt, plural } from "@/lib/i18n/config";
import { SRC_LABEL } from "@/lib/search";
import type { Item } from "@/lib/types";

const initials = (n: string) =>
  n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

/** Every rental company as a card: a few gear photos, name, city and size. */
export function CompanyDirectory() {
  const { companies, items } = useListings();
  const t = useT();
  const [text, setText] = useState("");

  const cards = useMemo(() => {
    const byCo = new Map<string, Item[]>();
    for (const i of items) byCo.set(i.co, [...(byCo.get(i.co) ?? []), i]);
    return companies
      .map((co) => {
        const gear = byCo.get(co.id) ?? [];
        // the most valuable gear with photos makes the thumbnail
        // (several items can share one photo, so keep each photo once)
        const photos = [
          ...new Set(
            gear
              .filter((i) => i.image)
              .sort((a, b) => b.rate - a.rate)
              .map((i) => i.image!),
          ),
        ].slice(0, 3);
        return { co, count: gear.length, units: gear.reduce((n, i) => n + i.total, 0), photos };
      })
      .sort((a, b) => b.count - a.count || a.co.name.localeCompare(b.co.name));
  }, [companies, items]);

  const q = text.trim().toLowerCase();
  const shown = cards.filter((c) => !q || `${c.co.name} ${c.co.city}`.toLowerCase().includes(q));

  return (
    <>
      <div className="co-tools">
        <input
          className="co-search"
          type="search"
          placeholder={t.companies.search}
          aria-label={t.companies.search}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      {shown.length === 0 && <p className="muted">{t.companies.empty}</p>}
      <div className="dir-grid">
        {shown.map(({ co, count, units, photos }) => (
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
    </>
  );
}

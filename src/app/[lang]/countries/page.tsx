import type { Metadata } from "next";
import { getDictionary } from "@/lib/i18n/server";
import { CountryGrid } from "./CountryGrid";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).countries.metaTitle };
}

export default async function CountriesPage() {
  const t = (await getDictionary()).countries;
  return (
    <main>
      <section className="co-hero">
        <div className="wrap">
          <p className="eyebrow">
            <span className="tally" />
            {t.eyebrow}
          </p>
          <h1>{t.title}</h1>
          <p className="co-meta">{t.lede}</p>
        </div>
      </section>
      <div className="wrap co-page">
        <CountryGrid />
      </div>
    </main>
  );
}

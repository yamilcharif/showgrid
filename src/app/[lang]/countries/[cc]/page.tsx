import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { countryName, flag } from "@/lib/flags";
import { getDictionary, getLocale } from "@/lib/i18n/server";
import { COUNTRIES } from "@/lib/places";
import { CountryMembers } from "./CountryMembers";

export async function generateMetadata({ params }: PageProps<"/[lang]/countries/[cc]">): Promise<Metadata> {
  const cc = (await params).cc.toUpperCase();
  if (!COUNTRIES[cc]) return { title: "ShowGrid" };
  return { title: `${countryName(cc, await getLocale())} · ShowGrid` };
}

export default function CountryPage({ params }: PageProps<"/[lang]/countries/[cc]">) {
  return (
    <main>
      <Suspense fallback={null}>
        <Country params={params} />
      </Suspense>
    </main>
  );
}

async function Country({ params }: { params: PageProps<"/[lang]/countries/[cc]">["params"] }) {
  const cc = (await params).cc.toUpperCase();
  if (!COUNTRIES[cc]) notFound();
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  return (
    <>
      <section className="co-hero">
        <div className="wrap">
          <Link href="/countries" className="eyebrow country-back">
            ← {t.countries.all}
          </Link>
          <div className="co-title">
            <span className="country-hero-flag" aria-hidden="true">
              {flag(cc)}
            </span>
            <h1>{countryName(cc, locale)}</h1>
          </div>
        </div>
      </section>
      <div className="wrap co-page">
        <CountryMembers cc={cc} />
      </div>
    </>
  );
}

import type { Metadata } from "next";
import { getDictionary } from "@/lib/i18n/server";
import { CompanyDirectory } from "./CompanyDirectory";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).companies.metaTitle };
}

export default async function CompaniesPage() {
  const t = (await getDictionary()).companies;
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
        <CompanyDirectory />
      </div>
    </main>
  );
}

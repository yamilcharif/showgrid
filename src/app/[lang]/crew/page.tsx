import type { Metadata } from "next";
import { getDictionary } from "@/lib/i18n/server";
import { CrewDirectory } from "./CrewDirectory";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).crewDir.metaTitle };
}

export default async function CrewPage() {
  const t = (await getDictionary()).crewDir;
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
        <CrewDirectory />
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { getDictionary } from "@/lib/i18n/server";
import { TruckPlanner } from "./TruckPlanner";

export async function generateMetadata(): Promise<Metadata> {
  const t = (await getDictionary()).truck;
  return { title: t.metaTitle, description: t.lede };
}

export default async function TruckPage() {
  const t = (await getDictionary()).truck;
  return (
    <main>
      <section className="co-hero">
        <div className="wrap">
          <p className="eyebrow">
            <span className="tally" />
            <Link href="/tools">{t.eyebrow}</Link>
          </p>
          <h1>{t.title}</h1>
          <p className="co-meta">{t.lede}</p>
        </div>
      </section>
      <div className="wrap co-page">
        <TruckPlanner />
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ToolsBack } from "@/components/ToolsBack";
import { ToolsDisclaimer } from "@/components/ToolsDisclaimer";
import { getDictionary } from "@/lib/i18n/server";
import { PatternTool } from "./PatternTool";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary();
  const t = dict.pattern;
  return { title: t.metaTitle, description: t.lede };
}

export default async function PatternPage() {
  const dict = await getDictionary();
  const t = dict.pattern;
  return (
    <main>
      <section className="co-hero">
        <div className="wrap">
          <ToolsBack label={dict.tools.back} />
          <p className="eyebrow">
            <span className="tally" />
            <Link href="/tools">{t.eyebrow}</Link>
          </p>
          <h1>{t.title}</h1>
          <p className="co-meta">{t.lede}</p>
        </div>
      </section>
      <div className="wrap co-page">
        <PatternTool />
        <ToolsDisclaimer t={dict.tools} compact />
      </div>
    </main>
  );
}

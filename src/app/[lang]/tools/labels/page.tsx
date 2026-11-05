import type { Metadata } from "next";
import Link from "next/link";
import { ToolsBack } from "@/components/ToolsBack";
import { ToolsDisclaimer } from "@/components/ToolsDisclaimer";
import { getDictionary } from "@/lib/i18n/server";
import { LabelTool } from "./LabelTool";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary();
  const t = dict.labels;
  return { title: t.metaTitle, description: t.lede };
}

export default async function LabelsPage() {
  const dict = await getDictionary();
  const t = dict.labels;
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
        <LabelTool />
        <ToolsDisclaimer t={dict.tools} compact />
      </div>
    </main>
  );
}

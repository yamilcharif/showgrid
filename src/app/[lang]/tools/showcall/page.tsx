import type { Metadata } from "next";
import { ToolsBack } from "@/components/ToolsBack";
import { ToolsDisclaimer } from "@/components/ToolsDisclaimer";
import { getDictionary } from "@/lib/i18n/server";
import { ShowCallTool } from "./ShowCallTool";

export async function generateMetadata(): Promise<Metadata> {
  const t = (await getDictionary()).showcall;
  return { title: t.metaTitle, description: t.lede };
}

export default async function ShowCallPage() {
  const dict = await getDictionary();
  const t = dict.showcall;
  return (
    <main>
      <section className="co-hero">
        <div className="wrap">
          <ToolsBack label={dict.tools.back} />
          <p className="eyebrow">
            <span className="tally" />
            {t.eyebrow}
          </p>
          <h1>{t.title}</h1>
          <p className="co-meta">{t.lede}</p>
        </div>
      </section>
      <div className="wrap co-page">
        <ShowCallTool />
        <ToolsDisclaimer t={dict.tools} compact />
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import { ToolsBack } from "@/components/ToolsBack";
import { ToolsDisclaimer } from "@/components/ToolsDisclaimer";
import { getDictionary } from "@/lib/i18n/server";
import { RoutingTool } from "./RoutingTool";

export async function generateMetadata(): Promise<Metadata> {
  const t = (await getDictionary()).routing;
  return { title: t.metaTitle, description: t.lede };
}

export default async function RoutingPage() {
  const dict = await getDictionary();
  const t = dict.routing;
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
        <RoutingTool />
        <ToolsDisclaimer t={dict.tools} compact />
      </div>
    </main>
  );
}

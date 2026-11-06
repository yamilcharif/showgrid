import type { Metadata } from "next";
import Link from "next/link";
import { ToolsDisclaimer } from "@/components/ToolsDisclaimer";
import { getDictionary } from "@/lib/i18n/server";
import { ProjectsPanel } from "./ProjectsPanel";

export async function generateMetadata(): Promise<Metadata> {
  const t = (await getDictionary()).tools;
  return { title: t.metaTitle, description: t.lede };
}

export default async function ToolsPage() {
  const t = (await getDictionary()).tools;
  const tools = [
    { href: "/rider", icon: "📄", name: t.riderName, desc: t.riderDesc },
    { href: "/tools/truck", icon: "🚚", name: t.truckName, desc: t.truckDesc },
    { href: "/tools/pattern", icon: "▦", name: t.patternName, desc: t.patternDesc },
    { href: "/tools/labels", icon: "🏷", name: t.labelsName, desc: t.labelsDesc },
    { href: "/tools/routing", icon: "✈️", name: t.routingName, desc: t.routingDesc },
  ];
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
        <ToolsDisclaimer t={t} />
        <ProjectsPanel />
        <div className="tool-grid">
          {tools.map((tool) => (
            <Link key={tool.href} href={tool.href} className="auth-form tool-card">
              <span className="tool-icon" aria-hidden="true">
                {tool.icon}
              </span>
              <h2>{tool.name}</h2>
              <p className="muted">{tool.desc}</p>
              <span className="btn primary">{t.open} →</span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

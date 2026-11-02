import type { Metadata } from "next";
import { getLocale } from "@/lib/i18n/server";
import { TERMS } from "@/lib/legal/terms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: `${TERMS[await getLocale()].title} · ShowGrid` };
}

export default async function TermsPage() {
  const doc = TERMS[await getLocale()];
  return (
    <main className="wrap legal">
      <h1>{doc.title}</h1>
      <p className="muted small">{doc.updated}</p>
      <p className="legal-summary">{doc.summary}</p>
      <p>{doc.intro}</p>
      {doc.sections.map((s) => (
        <section key={s.heading}>
          <h2>{s.heading}</h2>
          {s.body.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </section>
      ))}
    </main>
  );
}

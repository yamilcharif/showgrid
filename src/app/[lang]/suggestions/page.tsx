import type { Metadata } from "next";
import { SuggestionForm } from "./SuggestionForm";
import { getDictionary } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).suggestions.metaTitle };
}

export default async function SuggestionsPage() {
  const t = (await getDictionary()).suggestions;
  return (
    <main className="wrap auth-page">
      <p className="eyebrow muted">{t.eyebrow}</p>
      <h1>{t.title}</h1>
      <p className="muted">
        {t.lede}
      </p>
      <SuggestionForm />
    </main>
  );
}

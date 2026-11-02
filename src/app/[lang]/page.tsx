import { Results } from "@/components/Results";
import { SearchBar } from "@/components/SearchBar";
import { getDictionary } from "@/lib/i18n/server";

export default async function Home() {
  const t = await getDictionary();
  return (
    <main>
      <section className="hero">
        <div className="wrap">
          <div className="eyebrow">
            <span className="tally" />
            {t.home.eyebrow}
          </div>
          <h1>
            {t.home.title} <span>{t.home.titleMuted}</span>
          </h1>
          <p className="lede">
            {t.home.lede}
          </p>
          <SearchBar />
        </div>
      </section>

      <section className="main">
        <div className="wrap">
          <Results />
        </div>
      </section>
    </main>
  );
}

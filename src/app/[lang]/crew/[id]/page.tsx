import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { startConversation } from "@/app/[lang]/messages/actions";
import { initials } from "@/components/directory/CompanyCards";
import { countryName, flag } from "@/lib/flags";
import { fmt, plural } from "@/lib/i18n/config";
import { getDictionary, getLocale } from "@/lib/i18n/server";
import { getTechPage } from "@/lib/listings";
import { ccOf } from "@/lib/places";
import { money } from "@/lib/search";

export async function generateMetadata({ params }: PageProps<"/[lang]/crew/[id]">): Promise<Metadata> {
  const [tech, t] = await Promise.all([getTechPage((await params).id), getDictionary()]);
  if (!tech) return { title: "ShowGrid" };
  return { title: fmt(t.crewDir.metaProfile, { name: tech.name, role: tech.role }), description: `${tech.role} · ${tech.city}` };
}

export default function CrewProfilePage({ params }: PageProps<"/[lang]/crew/[id]">) {
  return (
    <main>
      <Suspense fallback={null}>
        <Profile params={params} />
      </Suspense>
    </main>
  );
}

async function Profile({ params }: { params: PageProps<"/[lang]/crew/[id]">["params"] }) {
  const [tech, T, locale] = await Promise.all([getTechPage((await params).id), getDictionary(), getLocale()]);
  if (!tech) notFound();
  const t = T.crewDir;
  const cc = ccOf(tech.city);
  return (
    <section className="co-hero">
      <div className="wrap crew-hero">
        <div className="crew-avatar">
          {tech.photo ? (
            <Image src={tech.photo} alt={tech.name} fill sizes="200px" priority />
          ) : (
            <span className="dir-initials">{initials(tech.name)}</span>
          )}
        </div>
        <div>
          <p className="eyebrow">
            {tech.avail && <span className="tally" />}
            {tech.avail ? t.available : t.unavailable}
          </p>
          <h1>{tech.name}</h1>
          <p className="co-about">{tech.role}</p>
          <p className="co-meta">
            {flag(cc)} {tech.city} · {countryName(cc, locale)}
          </p>
          <div className="co-stats">
            <div>
              <strong className="num">{plural(tech.yrs, t.years)}</strong>
              {t.experience}
            </div>
            <div>
              <strong className="num">{tech.rate ? money(tech.rate, tech.cur) : t.onRequest}</strong>
              {t.dayRate}
            </div>
          </div>
          {tech.skills.length > 0 && (
            <div className="crew-skills">
              {tech.skills.map((s) => (
                <span key={s} className="chip">
                  {s}
                </span>
              ))}
            </div>
          )}
          <form action={startConversation} className="co-actions">
            <input type="hidden" name="to" value={tech.profileId} />
            <button className="btn primary">{fmt(t.message, { name: tech.name.split(" ")[0] })}</button>
          </form>
        </div>
      </div>
    </section>
  );
}

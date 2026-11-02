"use client";

import { CompanyCards } from "@/components/directory/CompanyCards";
import { CrewCards } from "@/components/directory/CrewCards";
import { useT } from "@/components/I18n";
import { useListings } from "@/components/Listings";
import { ccOf } from "@/lib/places";

/** A country's rental houses and crew. */
export function CountryMembers({ cc }: { cc: string }) {
  const { companies, techs } = useListings();
  const t = useT().countries;
  const cos = companies.filter((c) => ccOf(c.city) === cc);
  const crew = techs.filter((x) => ccOf(x.city) === cc);

  if (!cos.length && !crew.length) return <p className="muted">{t.empty}</p>;
  return (
    <>
      {cos.length > 0 && (
        <section className="co-section">
          <h2>
            {t.companiesTitle} <span className="num muted">{cos.length}</span>
          </h2>
          <CompanyCards companies={cos} />
        </section>
      )}
      {crew.length > 0 && (
        <section className="co-section">
          <h2>
            {t.crewTitle} <span className="num muted">{crew.length}</span>
          </h2>
          <CrewCards techs={crew} />
        </section>
      )}
    </>
  );
}

"use client";

import { useState } from "react";
import { CompanyCards } from "@/components/directory/CompanyCards";
import { useT } from "@/components/I18n";
import { useListings } from "@/components/Listings";

/** Every rental company, with a name/city search. */
export function CompanyDirectory() {
  const { companies } = useListings();
  const t = useT();
  const [text, setText] = useState("");
  const q = text.trim().toLowerCase();
  const shown = companies.filter((co) => !q || `${co.name} ${co.city}`.toLowerCase().includes(q));

  return (
    <>
      <div className="co-tools">
        <input
          className="co-search"
          type="search"
          placeholder={t.companies.search}
          aria-label={t.companies.search}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      {shown.length === 0 && <p className="muted">{t.companies.empty}</p>}
      <CompanyCards companies={shown} />
    </>
  );
}

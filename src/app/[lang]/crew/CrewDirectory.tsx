"use client";

import { useState } from "react";
import { CrewCards } from "@/components/directory/CrewCards";
import { useT } from "@/components/I18n";
import { useListings } from "@/components/Listings";

/** Every crew member, with a name/role/skill/city search. */
export function CrewDirectory() {
  const { techs } = useListings();
  const t = useT();
  const [text, setText] = useState("");
  const q = text.trim().toLowerCase();
  const shown = techs.filter((x) => !q || `${x.name} ${x.role} ${x.city} ${x.skills.join(" ")}`.toLowerCase().includes(q));

  return (
    <>
      <div className="co-tools">
        <input
          className="co-search"
          type="search"
          placeholder={t.crewDir.search}
          aria-label={t.crewDir.search}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      {shown.length === 0 && <p className="muted">{t.crewDir.empty}</p>}
      <CrewCards techs={shown} />
    </>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { useI18n } from "@/components/I18n";
import { flag } from "@/lib/flags";
import { plural } from "@/lib/i18n/config";
import { ccOf } from "@/lib/places";
import type { Tech } from "@/lib/types";
import { initials } from "@/lib/initials";

/** Crew members as cards: photo (or initials), role, city, experience and top skills. */
export function CrewCards({ techs }: { techs: Tech[] }) {
  const { t } = useI18n();
  const sorted = [...techs].sort((a, b) => Number(!a.photo) - Number(!b.photo) || b.yrs - a.yrs || a.name.localeCompare(b.name));
  return (
    <div className="dir-grid crew-grid">
      {sorted.map((tech) => (
        <Link key={tech.id} href={`/crew/${tech.id}`} className="dir-card">
          <div className="crew-photo">
            {tech.photo ? (
              <Image src={tech.photo} alt="" fill sizes="(max-width: 640px) 100vw, 280px" />
            ) : (
              <span className="dir-initials" aria-hidden="true">
                {initials(tech.name)}
              </span>
            )}
            {tech.avail && <span className="tally crew-live" aria-hidden="true" />}
          </div>
          <div className="dir-body">
            <h2>{tech.name}</h2>
            <p className="small">{tech.role}</p>
            <p className="muted small">
              {flag(ccOf(tech.city))} {tech.city} · {plural(tech.yrs, t.crewDir.years)}
            </p>
            {tech.skills.length > 0 && (
              <div className="tags">
                {tech.skills.slice(0, 4).map((s) => (
                  <span key={s} className="tag">
                    {s}
                  </span>
                ))}
              </div>
            )}
            <span className="dir-cta">{t.crewDir.view} →</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

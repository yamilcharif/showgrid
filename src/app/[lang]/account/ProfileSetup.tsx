"use client";

import { useActionState, useState } from "react";
import { LocationBox } from "@/components/LocationBox";
import Link from "next/link";
import { useI18n } from "@/components/I18n";
import { TERMS } from "@/lib/legal/terms";
import { fmt } from "@/lib/i18n/config";
import { curOf, DEFAULT_PLACE } from "@/lib/places";
import { createProfile, type ProfileState } from "./actions";

export function ProfileSetup({ email }: { email: string }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(createProfile, {});
  const [kind, setKind] = useState<"company" | "tech">("company");
  const [place, setPlace] = useState(DEFAULT_PLACE);
  const { t: T, locale } = useI18n();
  const t = T.profile;

  return (
    <form action={action} className="auth-form">
      <p className="muted">
        {fmt(t.signedInAs, { email })}
      </p>
      <fieldset className="choice">
        <legend>{t.iAm}</legend>
        <label>
          <input type="radio" name="kind" value="company" checked={kind === "company"} onChange={() => setKind("company")} />
          <span>
            <b>{t.companyTitle}</b>
            <small>{t.companyText}</small>
          </span>
        </label>
        <label>
          <input type="radio" name="kind" value="tech" checked={kind === "tech"} onChange={() => setKind("tech")} />
          <span>
            <b>{t.crewTitle}</b>
            <small>{t.crewText}</small>
          </span>
        </label>
      </fieldset>

      <div className="field">
        <label htmlFor="name">{kind === "company" ? t.companyName : t.yourName}</label>
        <input id="name" name="name" required maxLength={120} autoComplete={kind === "company" ? "organization" : "name"} />
      </div>

      <div className="field">
        <label htmlFor="loc">{t.city}</label>
        <div className="field-loc">
          <LocationBox value={place} onChange={setPlace} />
        </div>
        <input type="hidden" name="city" value={place.country ? "" : place.label} />
        {place.country && <small className="auth-err">{t.pickCity}</small>}
      </div>

      {kind === "tech" && (
        <>
          <div className="field">
            <label htmlFor="role">{t.role}</label>
            <input id="role" name="role" placeholder={t.rolePlaceholder} maxLength={80} />
          </div>
          <div className="field">
            <label htmlFor="skills">{t.skills}</label>
            <input id="skills" name="skills" placeholder={t.skillsPlaceholder} />
          </div>
          <div className="two">
            <div className="field">
              <label htmlFor="years">{t.years}</label>
              <input id="years" name="years" type="number" min={0} max={60} inputMode="numeric" />
            </div>
            <div className="field">
              <label htmlFor="rate">{fmt(t.dayRate, { cur: curOf(place.label) })}</label>
              <input id="rate" name="rate" type="number" min={0} step="any" inputMode="decimal" placeholder={t.optional} />
            </div>
          </div>
        </>
      )}

      <div className="terms-box">
        <b>{t.termsTitle}</b>
        <p className="small">{TERMS[locale].summary}</p>
        <label className="gm-toggle terms-agree">
          <input type="checkbox" name="terms" required />
          <span>
            {t.agree}{" "}
            <Link href="/terms" target="_blank">
              {t.termsLink}
            </Link>
            {t.agreeRest}
          </span>
        </label>
      </div>
      {state.error && (
        <p className="auth-err" role="alert">
          {state.error}
        </p>
      )}
      <button className="btn primary" disabled={pending}>
        {pending ? t.saving : t.create}
      </button>
    </form>
  );
}

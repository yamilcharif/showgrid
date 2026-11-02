"use client";

import { useActionState, useState } from "react";
import { useT } from "@/components/I18n";
import { LocationBox } from "@/components/LocationBox";
import { fmt } from "@/lib/i18n/config";
import { curOf, PLACE_OPTS } from "@/lib/places";
import { updateProfile, type EditState } from "../actions";

interface Props {
  kind: "company" | "tech";
  name: string;
  city: string;
  about?: string | null;
  role?: string;
  skills?: string[];
  years?: number;
  rate?: number | null;
  available?: boolean;
  phone?: string | null;
  contactEmail?: string | null;
  address?: string | null;
  website?: string | null;
  instagram?: string | null;
}

export function EditProfileForm(p: Props) {
  const T = useT();
  const t = T.editProfile;
  const [state, action, pending] = useActionState<EditState, FormData>(updateProfile, {});
  const [place, setPlace] = useState(PLACE_OPTS.find((o) => o.label === p.city && !o.country) ?? PLACE_OPTS[0]);

  return (
    <form action={action} className="auth-form">
      <div className="field">
        <label htmlFor="name">{p.kind === "company" ? t.companyName : t.name}</label>
        <input id="name" name="name" required maxLength={120} defaultValue={p.name} />
      </div>
      <div className="field">
        <label htmlFor="loc">{t.city}</label>
        <div className="field-loc">
          <LocationBox value={place} onChange={setPlace} />
        </div>
        <input type="hidden" name="city" value={place.country ? "" : place.label} />
        {place.country && <small className="auth-err">{T.profile.pickCity}</small>}
      </div>
      {p.kind === "company" ? (
        <div className="field">
          <label htmlFor="about">{t.about}</label>
          <textarea id="about" name="about" rows={4} maxLength={1000} className="about-input" defaultValue={p.about ?? ""} placeholder={T.publicPage.aboutPlaceholder} />
        </div>
      ) : (
        <>
          <div className="field">
            <label htmlFor="role">{t.role}</label>
            <input id="role" name="role" maxLength={80} defaultValue={p.role} placeholder={T.profile.rolePlaceholder} />
          </div>
          <div className="field">
            <label htmlFor="skills">{t.skills}</label>
            <input id="skills" name="skills" defaultValue={p.skills?.join(", ")} placeholder={T.profile.skillsPlaceholder} />
          </div>
          <div className="two">
            <div className="field">
              <label htmlFor="years">{t.years}</label>
              <input id="years" name="years" type="number" min={0} max={60} defaultValue={p.years} />
            </div>
            <div className="field">
              <label htmlFor="rate">{fmt(t.dayRate, { cur: curOf(place.label) })}</label>
              <input id="rate" name="rate" type="number" min={0} step="any" defaultValue={p.rate ?? ""} placeholder={T.profile.optional} />
            </div>
          </div>
          <label className="gm-toggle">
            <input type="checkbox" name="available" defaultChecked={p.available} />
            {t.available}
          </label>
        </>
      )}
      <fieldset className="contact-fields">
        <legend>{t.contactTitle}</legend>
        <p className="muted small">{t.contactNote}</p>
        <div className="two">
          <div className="field">
            <label htmlFor="phone">{t.phone}</label>
            <input id="phone" name="phone" type="tel" autoComplete="tel" maxLength={40} defaultValue={p.phone ?? ""} />
          </div>
          {p.kind === "company" && (
            <div className="field">
              <label htmlFor="contact_email">{t.contactEmail}</label>
              <input id="contact_email" name="contact_email" type="email" autoComplete="email" maxLength={200} defaultValue={p.contactEmail ?? ""} />
            </div>
          )}
        </div>
        {p.kind === "company" && (
          <div className="field">
            <label htmlFor="address">{t.address}</label>
            <input id="address" name="address" autoComplete="street-address" maxLength={300} placeholder={t.addressPlaceholder} defaultValue={p.address ?? ""} />
          </div>
        )}
        <div className="two">
          <div className="field">
            <label htmlFor="website">{t.website}</label>
            <input id="website" name="website" inputMode="url" placeholder="yourcompany.com" maxLength={300} defaultValue={p.website ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="instagram">{t.instagram}</label>
            <input id="instagram" name="instagram" placeholder="@handle" maxLength={60} defaultValue={p.instagram ? `@${p.instagram}` : ""} />
          </div>
        </div>
      </fieldset>
      {state.error && (
        <p className="auth-err" role="alert">
          {state.error}
        </p>
      )}
      {state.saved && (
        <p className="auth-ok" role="status">
          {t.saved}
        </p>
      )}
      <button className="btn primary" disabled={pending}>
        {pending ? t.saving : t.save}
      </button>
    </form>
  );
}

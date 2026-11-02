"use client";

import { useActionState, useState } from "react";
import { LocationBox } from "@/components/LocationBox";
import { curOf, DEFAULT_PLACE } from "@/lib/places";
import { createProfile, type ProfileState } from "./actions";

export function ProfileSetup({ email }: { email: string }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(createProfile, {});
  const [kind, setKind] = useState<"company" | "tech">("company");
  const [place, setPlace] = useState(DEFAULT_PLACE);

  return (
    <form action={action} className="auth-form">
      <p className="muted">
        Signed in as <b>{email}</b>. One last step: tell people who you are.
      </p>
      <fieldset className="choice">
        <legend>I am</legend>
        <label>
          <input type="radio" name="kind" value="company" checked={kind === "company"} onChange={() => setKind("company")} />
          <span>
            <b>A rental company</b>
            <small>List your gear from Rentman or Flex</small>
          </span>
        </label>
        <label>
          <input type="radio" name="kind" value="tech" checked={kind === "tech"} onChange={() => setKind("tech")} />
          <span>
            <b>Crew</b>
            <small>Tech, engineer, rigger, programmer…</small>
          </span>
        </label>
      </fieldset>

      <div className="field">
        <label htmlFor="name">{kind === "company" ? "Company name" : "Your name"}</label>
        <input id="name" name="name" required maxLength={120} autoComplete={kind === "company" ? "organization" : "name"} />
      </div>

      <div className="field">
        <label htmlFor="loc">City</label>
        <div className="field-loc">
          <LocationBox value={place} onChange={setPlace} />
        </div>
        <input type="hidden" name="city" value={place.country ? "" : place.label} />
        {place.country && <small className="auth-err">Pick a city, not a whole country.</small>}
      </div>

      {kind === "tech" && (
        <>
          <div className="field">
            <label htmlFor="role">Role</label>
            <input id="role" name="role" placeholder="e.g. FOH engineer, lighting programmer" maxLength={80} />
          </div>
          <div className="field">
            <label htmlFor="skills">Skills</label>
            <input id="skills" name="skills" placeholder="grandMA3, DiGiCo, rigging (separate with commas)" />
          </div>
          <div className="two">
            <div className="field">
              <label htmlFor="years">Years of experience</label>
              <input id="years" name="years" type="number" min={0} max={60} inputMode="numeric" />
            </div>
            <div className="field">
              <label htmlFor="rate">Day rate ({curOf(place.label)})</label>
              <input id="rate" name="rate" type="number" min={0} step="any" inputMode="decimal" placeholder="Optional" />
            </div>
          </div>
        </>
      )}

      {state.error && (
        <p className="auth-err" role="alert">
          {state.error}
        </p>
      )}
      <button className="btn primary" disabled={pending}>
        {pending ? "Saving…" : "Create profile"}
      </button>
    </form>
  );
}

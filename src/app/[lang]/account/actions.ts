"use server";

import { actionDictionary } from "@/lib/i18n/server";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getAccount } from "@/lib/auth";
import { cleanRule } from "@/lib/pricing";
import { coords, curOf, PLACE_OPTS } from "@/lib/places";
import { createClient } from "@/lib/supabase/server";

export interface ProfileState {
  error?: string;
}

const text = (form: FormData, key: string, max = 120) => String(form.get(key) ?? "").trim().slice(0, max);

export async function createProfile(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/sign-in");

  const kind = form.get("kind");
  if (kind !== "company" && kind !== "tech") return { error: (await actionDictionary()).profile.errKind };
  const name = text(form, "name");
  if (!name) return { error: kind === "company" ? "Enter your company name." : "Enter your name." };
  // only cities from our list for now; any address once geocoding is added
  const city = text(form, "city");
  if (!PLACE_OPTS.some((p) => p.label === city && !p.country)) return { error: (await actionDictionary()).profile.errCity };
  const [lat, lng] = coords(city);
  const place = { city_label: city, country_code: PLACE_OPTS.find((p) => p.label === city)!.cc, location: `SRID=4326;POINT(${lng} ${lat})`, currency: curOf(city) };

  const { error: profileError } = await supabase
    .from("profiles")
    .insert({ id: claims.sub, kind, display_name: name, email: String(claims.email ?? "") });
  if (profileError) return { error: (await actionDictionary()).profile.errSave };

  let detailError;
  if (kind === "company") {
    ({ error: detailError } = await supabase.from("companies").insert({ owner_id: claims.sub, name, ...place }));
  } else {
    const role = text(form, "role");
    const skills = text(form, "skills", 400).split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20);
    const years = Math.max(0, Math.min(60, parseInt(text(form, "years"), 10) || 0));
    const rate = parseFloat(text(form, "rate"));
    ({ error: detailError } = await supabase.from("techs").insert({
      owner_id: claims.sub,
      name,
      role: role || "Technician",
      skills,
      years_experience: years,
      day_rate: Number.isFinite(rate) && rate > 0 ? rate : null,
      ...place,
    }));
  }
  if (detailError) {
    // keep it all-or-nothing so the person can try again from a clean start
    await supabase.from("profiles").delete().eq("id", claims.sub);
    return { error: (await actionDictionary()).profile.errSave };
  }
  // new crew show up in search right away instead of after the cache expires
  updateTag("listings");
  redirect("/account");
}

export interface PasswordState {
  error?: string;
  saved?: boolean;
}

export async function setPassword(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: (await actionDictionary()).password.errShort };
  if (password !== String(form.get("confirm") ?? "")) return { error: (await actionDictionary()).password.errMatch };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password, data: { has_password: true } });
  if (error) {
    return {
      error:
        error.code === "weak_password"
          ? (await actionDictionary()).password.errWeak
          : error.code === "same_password"
            ? (await actionDictionary()).password.errSame
            : (await actionDictionary()).password.errSave,
    };
  }
  // fresh token, so the session (and the account page) sees has_password right away
  await supabase.auth.refreshSession();
  return { saved: true };
}

export interface AboutState {
  error?: string;
  saved?: boolean;
}

/** The short description on the company's public page. */
export async function saveAbout(_prev: AboutState, form: FormData): Promise<AboutState> {
  const acc = await getAccount();
  if (!acc?.company) return { error: (await actionDictionary()).publicPage.errOnlyCompanies };
  const about = String(form.get("about") ?? "").trim().slice(0, 1000);
  const supabase = await createClient();
  const { error } = await supabase.from("companies").update({ about: about || null }).eq("owner_id", acc.id);
  if (error) return { error: (await actionDictionary()).publicPage.errSave };
  updateTag("listings");
  return { saved: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

/** The company's rental-length pricing (null charges every day). */
export async function savePriceRule(rule: unknown): Promise<{ error?: string }> {
  const t = (await actionDictionary()).pricing;
  const acc = await getAccount();
  if (!acc?.company) return { error: t.errSave };
  const supabase = await createClient();
  const { error } = await supabase.from("companies").update({ price_rule: cleanRule(rule) }).eq("owner_id", acc.id);
  if (error) return { error: t.errSave };
  updateTag("listings");
  return {};
}

/** The company logo: a file the owner uploaded to our storage, or null to remove it. */
export async function saveLogo(url: string | null): Promise<{ error?: string }> {
  const t = (await actionDictionary()).publicPage;
  const acc = await getAccount();
  if (!acc?.company) return { error: t.errOnlyCompanies };
  const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/gear-photos/${acc.company.id}/`;
  if (url !== null && !url.startsWith(prefix)) return { error: t.errSave };
  const supabase = await createClient();
  const { error } = await supabase.from("companies").update({ logo_url: url }).eq("owner_id", acc.id);
  if (error) return { error: t.errSave };
  updateTag("listings");
  return {};
}

/** The crew member's profile photo: a file they uploaded to their own folder, or null to remove it. */
export async function saveCrewPhoto(url: string | null): Promise<{ error?: string }> {
  const t = await actionDictionary();
  const acc = await getAccount();
  if (!acc?.tech) return { error: t.crewDir.errOnlyCrew };
  const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/gear-photos/crew/${acc.id}/`;
  if (url !== null && !url.startsWith(prefix)) return { error: t.publicPage.errSave };
  const supabase = await createClient();
  const { error } = await supabase.from("techs").update({ photo_url: url }).eq("owner_id", acc.id);
  if (error) return { error: t.publicPage.errSave };
  updateTag("listings");
  return {};
}

export interface EditState {
  error?: string;
  saved?: boolean;
}

/** Edit the profile after setup: name and city for everyone, about for companies, crew details for crew. */
export async function updateProfile(_prev: EditState, form: FormData): Promise<EditState> {
  const dict = await actionDictionary();
  const t = dict.editProfile;
  const acc = await getAccount();
  if (!acc?.profile) return { error: t.errSave };
  const name = text(form, "name");
  if (!name) return { error: acc.company ? dict.profile.errCompanyName : dict.profile.errName };
  const city = text(form, "city");
  if (!PLACE_OPTS.some((p) => p.label === city && !p.country)) return { error: dict.profile.errCity };
  const [lat, lng] = coords(city);
  const place = {
    city_label: city,
    country_code: PLACE_OPTS.find((p) => p.label === city)!.cc,
    location: `SRID=4326;POINT(${lng} ${lat})`,
    currency: curOf(city),
  };

  const supabase = await createClient();
  const { error: pErr } = await supabase.from("profiles").update({ display_name: name }).eq("id", acc.id);
  if (pErr) return { error: t.errSave };
  let error;
  if (acc.company) {
    ({ error } = await supabase
      .from("companies")
      .update({ name, about: text(form, "about", 1000) || null, ...place })
      .eq("owner_id", acc.id));
  } else if (acc.tech) {
    const rate = parseFloat(text(form, "rate"));
    ({ error } = await supabase
      .from("techs")
      .update({
        name,
        role: text(form, "role", 80) || "Technician",
        skills: text(form, "skills", 400).split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20),
        years_experience: Math.max(0, Math.min(60, parseInt(text(form, "years"), 10) || 0)),
        day_rate: Number.isFinite(rate) && rate > 0 ? rate : null,
        available: form.get("available") === "on",
        ...place,
      })
      .eq("owner_id", acc.id));
  }
  if (error) return { error: t.errSave };
  updateTag("listings");
  return { saved: true };
}

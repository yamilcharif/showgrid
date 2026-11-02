"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
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
  if (kind !== "company" && kind !== "tech") return { error: "Choose rental company or crew." };
  const name = text(form, "name");
  if (!name) return { error: kind === "company" ? "Enter your company name." : "Enter your name." };
  // only cities from our list for now; any address once geocoding is added
  const city = text(form, "city");
  if (!PLACE_OPTS.some((p) => p.label === city && !p.country)) return { error: "Pick your city from the list." };
  const [lat, lng] = coords(city);
  const place = { city_label: city, country_code: PLACE_OPTS.find((p) => p.label === city)!.cc, location: `SRID=4326;POINT(${lng} ${lat})`, currency: curOf(city) };

  const { error: profileError } = await supabase
    .from("profiles")
    .insert({ id: claims.sub, kind, display_name: name, email: String(claims.email ?? "") });
  if (profileError) return { error: "We couldn't save your profile. Try again." };

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
    return { error: "We couldn't save your profile. Try again." };
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
  if (password.length < 8) return { error: "Use at least 8 characters." };
  if (password !== String(form.get("confirm") ?? "")) return { error: "The two passwords don't match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password, data: { has_password: true } });
  if (error) {
    return {
      error:
        error.code === "weak_password"
          ? "That password is too easy to guess. Try a longer one."
          : error.code === "same_password"
            ? "That's already your password."
            : "We couldn't save your password. Try again.",
    };
  }
  // fresh token, so the session (and the account page) sees has_password right away
  await supabase.auth.refreshSession();
  return { saved: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

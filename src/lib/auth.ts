import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";

export type AccountKind = "company" | "tech";

export interface Account {
  id: string;
  email: string;
  /** set once they've chosen a password, so later sign-ins don't need a code */
  hasPassword: boolean;
  profile: { kind: AccountKind; display_name: string } | null;
  company: {
    id: string;
    name: string;
    slug: string;
    about: string | null;
    logo_url: string | null;
    price_rule: unknown;
    phone: string | null;
    contact_email: string | null;
    address: string | null;
    website: string | null;
    instagram: string | null;
    city_label: string;
    currency: string;
    verified_at: string | null;
  } | null;
  tech: {
    name: string;
    role: string;
    skills: string[];
    years_experience: number;
    day_rate: number | null;
    city_label: string;
    currency: string;
    photo_url: string | null;
    id: string;
    phone: string | null;
    website: string | null;
    instagram: string | null;
  } | null;
}

/** The signed-in visitor and their profile, or null. Read once per request. */
export const getAccount = cache(async (): Promise<Account | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;
  const id = claims.sub;
  const [profile, company, tech] = await Promise.all([
    supabase.from("profiles").select("kind, display_name").eq("id", id).maybeSingle(),
    supabase.from("companies").select("id, name, slug, about, logo_url, price_rule, city_label, currency, verified_at, phone, contact_email, address, website, instagram").eq("owner_id", id).maybeSingle(),
    supabase.from("techs").select("id, name, role, skills, years_experience, day_rate, city_label, currency, photo_url, phone, website, instagram").eq("owner_id", id).maybeSingle(),
  ]);
  return {
    id,
    email: String(claims.email ?? ""),
    hasPassword: Boolean(claims.user_metadata?.has_password),
    profile: profile.data, company: company.data, tech: tech.data };
});

/** Where to send someone right after signing in: home if their profile is set up, otherwise profile setup. */
export async function landingPath(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) return "/sign-in";
  const { data: profile } = await supabase.from("profiles").select("id").eq("id", id).maybeSingle();
  return profile ? "/" : "/account";
}

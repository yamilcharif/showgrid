import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";

export type AccountKind = "company" | "tech";

export interface Account {
  id: string;
  email: string;
  profile: { kind: AccountKind; display_name: string } | null;
  company: { name: string; city_label: string; currency: string; verified_at: string | null } | null;
  tech: { name: string; role: string; skills: string[]; years_experience: number; day_rate: number | null; city_label: string; currency: string } | null;
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
    supabase.from("companies").select("name, city_label, currency, verified_at").eq("owner_id", id).maybeSingle(),
    supabase.from("techs").select("name, role, skills, years_experience, day_rate, city_label, currency").eq("owner_id", id).maybeSingle(),
  ]);
  return { id, email: String(claims.email ?? ""), profile: profile.data, company: company.data, tech: tech.data };
});

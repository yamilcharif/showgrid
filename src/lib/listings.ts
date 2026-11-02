import "server-only";
import { createClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag } from "next/cache";
import type { Tech } from "./types";

/** Public crew profiles from Supabase, shaped like the sample crew so search treats them the same. */
export async function getRealTechs(): Promise<Tech[]> {
  "use cache";
  cacheTag("listings");
  cacheLife("minutes");
  // no cookies here: public data, read with the publishable key only
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data } = await supabase
    .from("techs")
    .select("id, owner_id, name, role, skills, years_experience, day_rate, city_label, currency, available")
    .limit(500);
  return (data ?? []).map((t) => ({
    id: t.id,
    profileId: t.owner_id,
    name: t.name,
    role: t.role,
    city: t.city_label,
    off: [0, 0],
    rate: Number(t.day_rate ?? 0),
    yrs: t.years_experience,
    skills: t.skills ?? [],
    avail: t.available,
    cur: t.currency,
  }));
}

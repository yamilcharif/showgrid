import "server-only";
import { createClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag } from "next/cache";
import { cleanRule } from "./pricing";
import type { Category, Company, InventorySource, Item, Tech } from "./types";

export interface Listings {
  companies: Company[];
  items: Item[];
  techs: Tech[];
}

/**
 * Public listings from Supabase (real companies, their synced gear and bookings, and crew),
 * shaped for client-side search.
 */
export async function getListings(): Promise<Listings> {
  "use cache";
  cacheTag("listings");
  cacheLife("minutes");
  // no cookies here: public data, read with the publishable key only
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });
  const today = new Date().toISOString().slice(0, 10);
  const [co, it, bk, te] = await Promise.all([
    supabase.from("companies").select("id, slug, owner_id, name, city_label, currency, logo_url, price_rule").limit(1000),
    supabase
      .from("items")
      .select("id, company_id, source, name, category, spec, tags, quantity_owned, day_rate, public_price, image_url, photo_url, custom_category, updated_at")
      .eq("listed", true)
      .gt("quantity_owned", 0)
      .limit(20000),
    supabase.from("item_bookings").select("item_id, day, quantity_booked").gte("day", today).limit(100000),
    supabase
      .from("techs")
      .select("id, owner_id, name, role, skills, years_experience, day_rate, city_label, currency, available")
      .limit(500),
  ]);

  const bookings = new Map<string, Record<string, number>>();
  for (const b of bk.data ?? []) {
    const m = bookings.get(b.item_id) ?? {};
    m[b.day] = b.quantity_booked;
    bookings.set(b.item_id, m);
  }

  // per company: where its inventory comes from and when it last synced
  const sync = new Map<string, { src: InventorySource; at: string }>();
  for (const i of it.data ?? []) {
    const s = sync.get(i.company_id);
    if (!s || i.updated_at > s.at) sync.set(i.company_id, { src: i.source, at: i.updated_at });
  }

  return {
    companies: (co.data ?? []).map((c) => ({
      id: c.id,
      slug: c.slug,
      profileId: c.owner_id,
      logo: c.logo_url,
      priceRule: cleanRule(c.price_rule),
      name: c.name,
      city: c.city_label,
      off: [0, 0],
      src: sync.get(c.id)?.src ?? "manual",
      syncedAt: sync.get(c.id)?.at ?? null,
      cur: c.currency,
    })),
    items: (it.data ?? []).map((i) => {
      const bookedToday = bookings.get(i.id)?.[today] ?? 0;
      return {
        id: i.id,
        co: i.company_id,
        name: i.name,
        // the owner's own category and photo win over what the sync brought in
        cat: (i.custom_category ?? i.category) as Category,
        tags: i.tags ?? "",
        qty: Math.max(0, i.quantity_owned - bookedToday),
        total: i.quantity_owned,
        rate: Number(i.day_rate ?? 0),
        spec: i.spec ?? "",
        listed: true,
        pub: i.public_price && i.day_rate != null,
        image: i.photo_url ?? i.image_url,
        bookings: bookings.get(i.id) ?? {},
      };
    }),
    techs: (te.data ?? []).map((t) => ({
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
    })),
  };
}

export interface CompanyPage {
  id: string;
  slug: string;
  name: string;
  city: string;
  about: string | null;
  logo: string | null;
}

/** A company's public page header, by slug. */
export async function getCompanyPage(slug: string): Promise<CompanyPage | null> {
  "use cache";
  cacheTag("listings");
  cacheLife("minutes");
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data } = await supabase.from("companies").select("id, slug, name, city_label, about, logo_url").eq("slug", slug).maybeSingle();
  return data && { id: data.id, slug: data.slug, name: data.name, city: data.city_label, about: data.about, logo: data.logo_url };
}

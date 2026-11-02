"use server";

import { actionDictionary } from "@/lib/i18n/server";
import { updateTag } from "next/cache";
import { getAccount } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Category } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATEGORIES: Category[] = ["Lighting", "Audio", "Video", "Rigging", "Power", "Staging", "Backline", "Effects", "Other"];

export interface ItemPatch {
  listed?: boolean;
  public_price?: boolean;
  custom_category?: Category | null;
  photo_url?: string | null;
}

/** Change the owner's own items. RLS only lets owners update items of their own company. */
export async function updateItems(ids: string[], patch: ItemPatch): Promise<{ error?: string }> {
  const acc = await getAccount();
  if (!acc?.company) return { error: (await actionDictionary()).gear.errOnly };
  const clean = ids.filter((id) => UUID.test(id)).slice(0, 2000);
  if (!clean.length) return {};

  const p: ItemPatch = {};
  if (typeof patch.listed === "boolean") p.listed = patch.listed;
  if (typeof patch.public_price === "boolean") p.public_price = patch.public_price;
  if (patch.custom_category === null || CATEGORIES.includes(patch.custom_category as Category)) p.custom_category = patch.custom_category;
  if (patch.photo_url !== undefined) {
    // only photos stored in our own bucket
    const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/gear-photos/`;
    if (patch.photo_url !== null && !patch.photo_url.startsWith(prefix)) return { error: (await actionDictionary()).gear.errPhoto };
    p.photo_url = patch.photo_url;
  }
  if (!Object.keys(p).length) return {};

  const supabase = await createClient();
  for (let i = 0; i < clean.length; i += 200) {
    const { error } = await supabase.from("items").update(p).in("id", clean.slice(i, i + 200));
    if (error) return { error: (await actionDictionary()).gear.errSave };
  }
  updateTag("listings");
  return {};
}

export interface NewItem {
  name: string;
  description: string;
  category: Category;
  quantity: number;
  /** day rate; empty means "price on request" */
  price: number | null;
  photoUrl: string | null;
}

/** Add an item by hand (not from Rentman/Flex). */
export async function createItem(input: NewItem): Promise<{ id?: string; error?: string }> {
  const t = (await actionDictionary()).addItem;
  const acc = await getAccount();
  if (!acc?.company) return { error: t.errOnly };
  const name = input.name.trim().slice(0, 200);
  if (name.length < 2) return { error: t.errName };
  const quantity = Math.round(Number(input.quantity));
  if (!(quantity >= 1 && quantity <= 100000)) return { error: t.errQty };
  const price = input.price == null || String(input.price) === "" ? null : Math.round(Number(input.price) * 100) / 100;
  if (price != null && !(price >= 0)) return { error: t.errPrice };
  const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/gear-photos/${acc.company.id}/`;
  if (input.photoUrl && !input.photoUrl.startsWith(prefix)) return { error: (await actionDictionary()).gear.errPhoto };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .insert({
      company_id: acc.company.id,
      source: "manual",
      name,
      spec: input.description.trim().slice(0, 300) || null,
      category: CATEGORIES.includes(input.category) ? input.category : "Other",
      quantity_owned: quantity,
      day_rate: price,
      public_price: price != null,
      photo_url: input.photoUrl,
    })
    .select("id")
    .single();
  if (error) return { error: t.errSave };
  updateTag("listings");
  return { id: data.id };
}

/** Delete an item the owner added by hand (synced items are hidden instead). */
export async function deleteItem(id: string): Promise<{ error?: string }> {
  const t = (await actionDictionary()).addItem;
  if (!UUID.test(id)) return { error: t.errSave };
  const supabase = await createClient();
  // RLS: only the owner's own hand-added items
  const { error } = await supabase.from("items").delete().eq("id", id).eq("source", "manual");
  if (error) return { error: t.errSave };
  updateTag("listings");
  return {};
}

export interface FoundImage {
  thumb: string;
  url: string;
}

/** Photo suggestions for a gear name (Brave Search images). Empty when no key is set up. */
export async function searchImages(query: string): Promise<FoundImage[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  const acc = await getAccount();
  const q = query.trim().slice(0, 120);
  if (!key || !acc?.company || q.length < 3) return [];
  try {
    const url = new URL("https://api.search.brave.com/res/v1/images/search");
    url.searchParams.set("q", q);
    url.searchParams.set("count", "12");
    url.searchParams.set("safesearch", "strict");
    const res = await fetch(url, { headers: { Accept: "application/json", "X-Subscription-Token": key }, cache: "no-store" });
    if (!res.ok) return [];
    const body = (await res.json()) as { results?: { thumbnail?: { src?: string }; properties?: { url?: string } }[] };
    return (body.results ?? [])
      .map((r) => ({ thumb: r.thumbnail?.src ?? "", url: r.properties?.url ?? "" }))
      .filter((r) => r.thumb.startsWith("https://") && r.url.startsWith("https://"))
      .slice(0, 8);
  } catch {
    return [];
  }
}

/** Copy a picked photo into our own storage, so the page never depends on someone else's site. */
export async function importImage(src: string): Promise<{ url?: string; error?: string }> {
  const t = (await actionDictionary()).gear;
  const acc = await getAccount();
  if (!acc?.company) return { error: t.errOnly };
  let u: URL;
  try {
    u = new URL(src);
  } catch {
    return { error: t.errUpload };
  }
  // public web images only
  if (u.protocol !== "https:" || /^(\d+\.){3}\d+$|^\[|localhost/i.test(u.hostname)) return { error: t.errUpload };
  try {
    const res = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    const type = res.headers.get("content-type")?.split(";")[0] ?? "";
    if (!res.ok || !/^image\/(jpeg|png|webp)$/.test(type)) return { error: t.errType };
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 8 * 1024 * 1024) return { error: t.errSize };
    const path = `${acc.company.id}/web-${crypto.randomUUID()}.${type.split("/")[1].replace("jpeg", "jpg")}`;
    const db = createAdminClient();
    const { error } = await db.storage.from("gear-photos").upload(path, buf, { contentType: type });
    if (error) return { error: t.errUpload };
    return { url: db.storage.from("gear-photos").getPublicUrl(path).data.publicUrl };
  } catch {
    return { error: t.errUpload };
  }
}

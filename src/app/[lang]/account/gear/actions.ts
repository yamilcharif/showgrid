"use server";

import { actionDictionary } from "@/lib/i18n/server";
import { updateTag } from "next/cache";
import { getAccount } from "@/lib/auth";
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

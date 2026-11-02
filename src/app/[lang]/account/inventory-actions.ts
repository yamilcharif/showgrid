"use server";

import { actionDictionary } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/config";
import { updateTag } from "next/cache";
import { getAccount } from "@/lib/auth";
import { syncRentman } from "@/lib/rentman";
import { createClient } from "@/lib/supabase/server";

export interface InventoryState {
  error?: string;
  ok?: string;
}

export async function connectRentman(_prev: InventoryState, form: FormData): Promise<InventoryState> {
  const token = String(form.get("token") ?? "").trim();
  if (token.length < 20) return { error: (await actionDictionary()).rentman.errToken };
  const acc = await getAccount();
  if (!acc?.company) return { error: (await actionDictionary()).rentman.errOnlyCompanies };

  const supabase = await createClient();
  // stored encrypted in Supabase Vault; the browser never gets it back
  const { error } = await supabase.rpc("save_inventory_token", { p_source: "rentman", p_token: token });
  if (error) return { error: (await actionDictionary()).rentman.errSaveToken };
  return runSync();
}

export async function syncNow(): Promise<InventoryState> {
  return runSync();
}

async function runSync(): Promise<InventoryState> {
  const supabase = await createClient();
  // RLS only returns the signed-in owner's own connection
  const { data: conn } = await supabase.from("inventory_connections").select("id").eq("source", "rentman").maybeSingle();
  if (!conn) return { error: (await actionDictionary()).rentman.errConnectFirst };
  try {
    const r = await syncRentman(conn.id);
    updateTag("listings");
    return { ok: fmt((await actionDictionary()).rentman.synced, { n: r.items.toLocaleString("en-US") }) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : (await actionDictionary()).rentman.errSync };
  }
}

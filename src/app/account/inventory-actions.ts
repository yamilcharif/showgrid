"use server";

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
  if (token.length < 20) return { error: "Paste the whole API token from Rentman." };
  const acc = await getAccount();
  if (!acc?.company) return { error: "Only rental companies can connect inventory." };

  const supabase = await createClient();
  // stored encrypted in Supabase Vault; the browser never gets it back
  const { error } = await supabase.rpc("save_inventory_token", { p_source: "rentman", p_token: token });
  if (error) return { error: "We couldn't save the token. Try again." };
  return runSync();
}

export async function syncNow(): Promise<InventoryState> {
  return runSync();
}

async function runSync(): Promise<InventoryState> {
  const supabase = await createClient();
  // RLS only returns the signed-in owner's own connection
  const { data: conn } = await supabase.from("inventory_connections").select("id").eq("source", "rentman").maybeSingle();
  if (!conn) return { error: "Connect Rentman first." };
  try {
    const r = await syncRentman(conn.id);
    updateTag("listings");
    return { ok: `Synced ${r.items.toLocaleString("en-US")} items from Rentman.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "The sync failed." };
  }
}

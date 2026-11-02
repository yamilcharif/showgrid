import { revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";
import { syncRentman } from "@/lib/rentman";
import { createAdminClient } from "@/lib/supabase/admin";

// Nightly inventory sync for every connected company. Vercel Cron calls this with the CRON_SECRET.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const db = createAdminClient();
  const { data: conns } = await db.from("inventory_connections").select("id").eq("source", "rentman");
  let ok = 0;
  let failed = 0;
  for (const c of conns ?? []) {
    try {
      await syncRentman(c.id);
      ok++;
    } catch {
      // the error is saved on the connection and shown to the owner
      failed++;
    }
  }
  revalidateTag("listings", "max");
  return Response.json({ ok, failed });
}

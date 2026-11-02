import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Service-role client for trusted server jobs (inventory sync). Bypasses RLS: never use it with input you haven't checked. */
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

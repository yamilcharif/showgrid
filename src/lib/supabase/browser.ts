import { createBrowserClient } from "@supabase/ssr";

/** Supabase client in the browser, signed in through the same cookies as the server. Used for Realtime. */
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}

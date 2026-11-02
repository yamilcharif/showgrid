"use server";

import { actionDictionary } from "@/lib/i18n/server";
import { getAccount } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface FeedbackState {
  error?: string;
  sent?: boolean;
}

export async function sendFeedback(_prev: FeedbackState, form: FormData): Promise<FeedbackState> {
  const message = String(form.get("message") ?? "").trim();
  if (message.length < 3) return { error: (await actionDictionary()).suggestions.errShort };
  if (message.length > 4000) return { error: (await actionDictionary()).suggestions.errLong };
  const name = String(form.get("name") ?? "").trim().slice(0, 120) || null;
  const email = String(form.get("email") ?? "").trim().slice(0, 200) || null;

  const acc = await getAccount();
  const supabase = await createClient();
  const { error } = await supabase.from("feedback").insert({ profile_id: acc?.profile ? acc.id : null, name, email, message });
  if (error) return { error: (await actionDictionary()).suggestions.errSend };
  return { sent: true };
}

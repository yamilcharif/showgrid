"use server";

import { actionDictionary } from "@/lib/i18n/server";
import { redirect } from "next/navigation";
import { getAccount } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Open (or create) the conversation with another member and go to it. */
export async function startConversation(form: FormData) {
  const acc = await getAccount();
  if (!acc) redirect("/sign-in");
  if (!acc.profile) redirect("/account");
  const to = String(form.get("to") ?? "");
  if (!UUID.test(to)) redirect("/messages");
  if (to === acc.id) redirect("/account");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_conversation", { other: to });
  if (error || !data) redirect("/messages?error=start");
  redirect(`/messages/${data}`);
}

export interface Message {
  id: number;
  sender_id: string;
  body: string | null;
  created_at: string;
  request_id: string | null;
}

export async function sendMessage(conversationId: string, body: string): Promise<{ message?: Message; error?: string }> {
  const text = body.trim();
  if (!text) return {};
  if (text.length > 4000) return { error: (await actionDictionary()).messages.errLong };
  const acc = await getAccount();
  if (!acc) return { error: (await actionDictionary()).messages.errSignedOut };

  const supabase = await createClient();
  // RLS checks the sender is a member of this conversation
  const { data, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: acc.id, body: text })
    .select("id, sender_id, body, created_at, request_id")
    .single();
  if (error) return { error: (await actionDictionary()).messages.errSend };
  return { message: data };
}

export async function markRead(conversationId: string) {
  const acc = await getAccount();
  if (!acc) return;
  const supabase = await createClient();
  await supabase
    .from("conversation_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("profile_id", acc.id);
}

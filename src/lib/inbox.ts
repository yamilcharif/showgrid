import "server-only";
import type { AccountKind } from "./auth";
import { createClient } from "./supabase/server";

export interface ConversationSummary {
  id: string;
  other_id: string;
  other_name: string;
  other_kind: AccountKind;
  last_body: string | null;
  last_at: string;
  last_from_me: boolean | null;
  unread: number;
}

/** The signed-in member's conversations, newest first. */
export async function getConversations(): Promise<ConversationSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_conversations");
  return (data ?? []) as ConversationSummary[];
}

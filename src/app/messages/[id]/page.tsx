import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getAccount } from "@/lib/auth";
import { getConversations } from "@/lib/inbox";
import { createClient } from "@/lib/supabase/server";
import type { Message } from "../actions";
import { Thread } from "./Thread";

export const metadata: Metadata = { title: "Messages · ShowGrid" };

export default function ConversationPage({ params }: PageProps<"/messages/[id]">) {
  return (
    <main className="wrap msg-page">
      <Link href="/messages" className="back">
        ← All messages
      </Link>
      <Suspense fallback={<p className="muted">Loading conversation…</p>}>
        <Conversation params={params} />
      </Suspense>
    </main>
  );
}

async function Conversation({ params }: { params: PageProps<"/messages/[id]">["params"] }) {
  const { id } = await params;
  const acc = await getAccount();
  if (!acc) redirect("/sign-in");
  // only conversations the member is in come back, so this also checks access
  const conv = (await getConversations()).find((c) => c.id === id);
  if (!conv) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select("id, sender_id, body, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <>
      <h1 className="thread-title">
        {conv.other_name}
        <small>{conv.other_kind === "company" ? "Rental company" : "Crew"}</small>
      </h1>
      <Thread conversationId={id} meId={acc.id} initial={((data ?? []) as Message[]).reverse()} />
    </>
  );
}

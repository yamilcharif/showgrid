import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getAccount } from "@/lib/auth";
import { getConversations } from "@/lib/inbox";
import { getDictionary } from "@/lib/i18n/server";
import { MESSAGE_SELECT, QUOTE_SELECT, REQUEST_SELECT, type Quote, type RentalRequest } from "@/lib/requests";
import { createClient } from "@/lib/supabase/server";
import type { Message } from "../actions";
import { Thread } from "./Thread";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).messages.metaTitle };
}

export default async function ConversationPage({ params }: PageProps<"/[lang]/messages/[id]">) {
  const t = (await getDictionary()).messages;
  return (
    <main className="wrap msg-page">
      <Link href="/messages" className="back">
        {t.back}
      </Link>
      <Suspense fallback={<p className="muted">{t.loadingConv}</p>}>
        <Conversation params={params} />
      </Suspense>
    </main>
  );
}

async function Conversation({ params }: { params: PageProps<"/[lang]/messages/[id]">["params"] }) {
  const { id } = await params;
  const acc = await getAccount();
  if (!acc) redirect("/sign-in");
  // only conversations the member is in come back, so this also checks access
  const conv = (await getConversations()).find((c) => c.id === id);
  const t = (await getDictionary()).messages;
  if (!conv) notFound();

  const supabase = await createClient();
  const [{ data }, { data: reqs }] = await Promise.all([
    supabase
      .from("messages")
      .select(MESSAGE_SELECT)
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("rental_requests").select(REQUEST_SELECT).eq("conversation_id", id).limit(200),
  ]);
  const reqIds = (reqs ?? []).map((r) => r.id);
  const { data: quotes } = reqIds.length
    ? await supabase.from("quotes").select(QUOTE_SELECT).in("request_id", reqIds).limit(500)
    : { data: [] };

  return (
    <>
      <h1 className="thread-title">
        {conv.other_name}
        <small>{conv.other_kind === "company" ? t.company : t.crew}</small>
      </h1>
      <Thread
        conversationId={id}
        meId={acc.id}
        initial={((data ?? []) as Message[]).reverse()}
        initialRequests={(reqs ?? []) as RentalRequest[]}
        initialQuotes={(quotes ?? []) as Quote[]}
      />
    </>
  );
}

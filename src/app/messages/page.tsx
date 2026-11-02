import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LocalTime } from "@/components/LocalTime";
import { getAccount } from "@/lib/auth";
import { getConversations } from "@/lib/inbox";

export const metadata: Metadata = { title: "Messages · ShowGrid" };

export default function MessagesPage({ searchParams }: PageProps<"/messages">) {
  return (
    <main className="wrap msg-page">
      <h1>Messages</h1>
      <Suspense fallback={<p className="muted">Loading messages…</p>}>
        <Inbox searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Inbox({ searchParams }: { searchParams: PageProps<"/messages">["searchParams"] }) {
  const acc = await getAccount();
  if (!acc) redirect("/sign-in");
  if (!acc.profile) redirect("/account");
  const [list, { error }] = await Promise.all([getConversations(), searchParams]);

  return (
    <>
      {error === "start" && (
        <p className="auth-err" role="alert">
          We couldn&apos;t open that conversation. Try again.
        </p>
      )}
      {list.length === 0 ? (
        <div className="empty">
          <h3>No messages yet</h3>
          <p>Find gear or crew, then press Message on a listing to start a conversation.</p>
          <Link className="btn" href="/">
            Search
          </Link>
        </div>
      ) : (
        <ul className="inbox">
          {list.map((c) => (
            <li key={c.id}>
              <Link href={`/messages/${c.id}`} className={c.unread ? "unread" : undefined}>
                <span className="who">
                  <b>{c.other_name}</b>
                  <small>{c.other_kind === "company" ? "Rental company" : "Crew"}</small>
                </span>
                <span className="snip">
                  {c.last_body ? `${c.last_from_me ? "You: " : ""}${c.last_body}` : "No messages yet"}
                </span>
                <span className="meta">
                  <LocalTime iso={c.last_at} />
                  {c.unread > 0 && <span className="badge num">{c.unread}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LocalTime } from "@/components/LocalTime";
import { getAccount } from "@/lib/auth";
import { getConversations } from "@/lib/inbox";
import { getDictionary } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).messages.metaTitle };
}

export default async function MessagesPage({ searchParams }: PageProps<"/[lang]/messages">) {
  const t = (await getDictionary()).messages;
  return (
    <main className="wrap msg-page">
      <h1>{t.title}</h1>
      <Suspense fallback={<p className="muted">{t.loading}</p>}>
        <Inbox searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Inbox({ searchParams }: { searchParams: PageProps<"/[lang]/messages">["searchParams"] }) {
  const acc = await getAccount();
  if (!acc) redirect("/sign-in");
  if (!acc.profile) redirect("/account");
  const [list, { error }, { messages: t }] = await Promise.all([getConversations(), searchParams, getDictionary()]);

  return (
    <>
      {error === "start" && (
        <p className="auth-err" role="alert">
          {t.errStart}
        </p>
      )}
      {list.length === 0 ? (
        <div className="empty">
          <h3>{t.emptyTitle}</h3>
          <p>{t.emptyText}</p>
          <Link className="btn" href="/">
            {t.search}
          </Link>
        </div>
      ) : (
        <ul className="inbox">
          {list.map((c) => (
            <li key={c.id}>
              <Link href={`/messages/${c.id}`} className={c.unread ? "unread" : undefined}>
                <span className="who">
                  <b>{c.other_name}</b>
                  <small>{c.other_kind === "company" ? t.company : t.crew}</small>
                </span>
                <span className="snip">
                  {c.last_body ? `${c.last_from_me ? t.you : ""}${c.last_body}` : t.none}
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

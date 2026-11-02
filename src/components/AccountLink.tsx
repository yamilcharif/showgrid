import Link from "next/link";
import { getAccount } from "@/lib/auth";
import { getConversations } from "@/lib/inbox";

/** Header links: "Sign in", or Messages (with unread count) and the signed-in person's name. Reads the session, so render it inside Suspense. */
export async function AccountLink() {
  const acc = await getAccount();
  if (!acc) {
    return (
      <Link className="btn ghost-dark" href="/sign-in">
        Sign in
      </Link>
    );
  }
  const unread = acc.profile ? (await getConversations()).reduce((n, c) => n + c.unread, 0) : 0;
  return (
    <>
      {acc.profile && (
        <Link className="btn ghost-dark" href="/messages" aria-label={`Messages${unread ? `, ${unread} unread` : ""}`}>
          <span className="hide-sm">Messages</span>
          <span className="show-sm" aria-hidden="true">
            ✉
          </span>
          {unread > 0 && <span className="badge num">{unread}</span>}
        </Link>
      )}
      <Link className="btn ghost-dark acct" href="/account">
        {acc.profile?.display_name ?? "Finish profile"}
      </Link>
    </>
  );
}

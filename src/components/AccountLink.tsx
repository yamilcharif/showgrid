import Link from "next/link";
import { getAccount } from "@/lib/auth";
import { AccountMenu } from "./AccountMenu";
import { fmt } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/server";
import { getConversations } from "@/lib/inbox";

/** Header links: "Sign in", or Messages (with unread count) and the signed-in person's name. Reads the session, so render it inside Suspense. */
export async function AccountLink() {
  const [acc, t] = await Promise.all([getAccount(), getDictionary()]);
  if (!acc) {
    return (
      <>
        <Link className="btn ghost-dark" href="/sign-in">
          {t.header.signIn}
        </Link>
        <Link className="btn join" href="/sign-in?new=1">
          <span className="hide-sm">{t.header.join}</span>
          <span className="show-sm">{t.header.joinShort}</span>
        </Link>
      </>
    );
  }
  const unread = acc.profile ? (await getConversations()).reduce((n, c) => n + c.unread, 0) : 0;
  return (
    <>
      {acc.profile && (
        <Link className="btn ghost-dark" href="/messages" aria-label={unread ? fmt(t.header.messagesUnread, { n: unread }) : t.header.messages}>
          <span className="hide-sm">{t.header.messages}</span>
          <span className="show-sm" aria-hidden="true">
            ✉
          </span>
          {unread > 0 && <span className="badge num">{unread}</span>}
        </Link>
      )}
      <AccountMenu
        name={acc.profile?.display_name ?? t.header.finishProfile}
        publicHref={acc.company ? `/c/${acc.company.slug}` : acc.tech ? `/crew/${acc.tech.id}` : null}
        isCompany={Boolean(acc.company)}
      />
    </>
  );
}

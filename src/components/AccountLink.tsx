import Link from "next/link";
import { getAccount } from "@/lib/auth";

/** Header link: "Sign in", or the signed-in person's name. Reads the session, so render it inside Suspense. */
export async function AccountLink() {
  const acc = await getAccount();
  if (!acc) {
    return (
      <Link className="btn ghost-dark" href="/sign-in">
        Sign in
      </Link>
    );
  }
  return (
    <Link className="btn ghost-dark acct" href="/account">
      {acc.profile?.display_name ?? "Finish profile"}
    </Link>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useT } from "./I18n";

/** Whether someone is signed in, from the browser session; null until it's known. */
export function useSignedIn() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setSignedIn(!!session));
    return () => data.subscription.unsubscribe();
  }, []);
  return signedIn;
}

/** Shown in place of a print or download when nobody is signed in: the tools are free to use, saving needs an account. */
export function AccountNeeded() {
  const t = useT().tools;
  return (
    <p className="account-needed" role="alert">
      🔒 {t.needAccount}{" "}
      <Link className="btn sm primary" href="/sign-in">
        {t.needAccountCta}
      </Link>
    </p>
  );
}

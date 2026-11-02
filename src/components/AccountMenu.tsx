"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/[lang]/account/actions";
import { useT } from "./I18n";

interface Props {
  name: string;
  /** the member's public page: /c/<slug> or /crew/<id>; null until the profile exists */
  publicHref: string | null;
  isCompany: boolean;
}

/** The signed-in member's name in the top bar, opening a menu: page, profile, gear, messages, account, sign out. */
export function AccountMenu({ name, publicHref, isCompany }: Props) {
  const t = useT().menu;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(false);
  return (
    <div className="acct-menu" ref={root}>
      <button type="button" className="btn ghost-dark acct" aria-haspopup="menu" aria-expanded={open} aria-label={name} onClick={() => setOpen((o) => !o)}>
        <span className="hide-sm">{name}</span>
        {/* phones: an icon, so the top bar fits */}
        <span className="show-sm" aria-hidden="true">
          👤
        </span>
        <span className="caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="menu" role="menu">
          <p className="menu-name">{name}</p>
          {publicHref && (
            <Link role="menuitem" href={publicHref} onClick={close}>
              {t.myPage}
            </Link>
          )}
          {publicHref && (
            <Link role="menuitem" href="/account/edit" onClick={close}>
              {t.editProfile}
            </Link>
          )}
          {isCompany && (
            <Link role="menuitem" href="/account/gear" onClick={close}>
              {t.manageGear}
            </Link>
          )}
          {publicHref && (
            <Link role="menuitem" href="/messages" onClick={close}>
              {t.messages}
            </Link>
          )}
          <Link role="menuitem" href="/account" onClick={close}>
            {t.account}
          </Link>
          <form action={signOut}>
            <button role="menuitem" className="menu-signout">
              {t.signOut}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

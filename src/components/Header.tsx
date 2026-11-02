"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useApp } from "./AppState";
import { fmt } from "@/lib/i18n/config";
import { useT } from "./I18n";
import { ListIcon } from "./icons";

export function Header({ account }: { account: ReactNode }) {
  const { cart, setCartOpen } = useApp();
  const t = useT();
  const n = cart.length;
  return (
    <header className="top">
      <div className="wrap">
        <Link className="brand" href="/" aria-label={t.header.home}>
          <span className="wordmark">
            SHOW<span>GRID</span>
          </span>
          <span className="tagline">{t.header.tagline}</span>
        </Link>
        <nav>
          <Link className="btn ghost-dark sugg-link" href="/suggestions" aria-label={t.header.suggestions}>
            <span className="hide-sm">{t.header.suggestions}</span>
            <span className="show-sm" aria-hidden="true">
              💡
            </span>
          </Link>
          <button
            type="button"
            className="btn ghost-dark"
            onClick={() => setCartOpen(true)}
            aria-label={n ? fmt(t.header.gearListItems, { n }) : t.header.gearList}
          >
            <ListIcon />
            <span className="hide-sm">{t.header.gearList}</span>
            {n > 0 && <span className="badge num">{n}</span>}
          </button>
          {account}
        </nav>
      </div>
    </header>
  );
}

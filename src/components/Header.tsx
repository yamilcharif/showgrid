"use client";

import Link from "next/link";
import { useApp } from "./AppState";
import { ListIcon } from "./icons";

export function Header() {
  const { cart, setCartOpen } = useApp();
  const n = cart.length;
  return (
    <header className="top">
      <div className="wrap">
        <Link className="brand" href="/" aria-label="ShowGrid home">
          <span className="wordmark">
            SHOW<span>GRID</span>
          </span>
          <span className="tagline">One problem at a time</span>
        </Link>
        <nav>
          <button
            type="button"
            className="btn ghost-dark"
            onClick={() => setCartOpen(true)}
            aria-label={`Gear list${n ? `, ${n} items` : ""}`}
          >
            <ListIcon />
            <span className="hide-sm">Gear list</span>
            {n > 0 && <span className="badge num">{n}</span>}
          </button>
        </nav>
      </div>
    </header>
  );
}

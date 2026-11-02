"use client";

import { useCallback } from "react";
import { freeFor, parseQuery } from "@/lib/search";
import { useApp } from "./AppState";
import { useListings } from "./Listings";

export function useGearList() {
  const { q, dates, setCart, setCartOpen, notify } = useApp();
  const { itemById } = useListings();

  const add = useCallback(
    (id: string) => {
      const it = itemById(id);
      if (!it) return;
      const cap = Math.max(freeFor(it, dates), 1);
      const qty = Math.max(1, Math.min(parseQuery(q).need || 1, cap));
      setCart((c) => {
        const ex = c.find((l) => l.id === id);
        return ex
          ? c.map((l) => (l.id === id ? { ...l, qty: Math.min(cap, l.qty + qty) } : l))
          : [...c, { id, qty }];
      });
      notify(`Added ${qty}× ${it.name} to your gear list.`, { label: "View list", run: () => setCartOpen(true) });
    },
    [q, dates, setCart, setCartOpen, notify, itemById],
  );

  const step = useCallback(
    (id: string, delta: 1 | -1) => {
      const it = itemById(id);
      if (!it) return;
      const cap = Math.max(freeFor(it, dates), 1);
      setCart((c) =>
        c.map((l) => (l.id === id ? { ...l, qty: Math.max(1, delta > 0 ? Math.min(cap, l.qty + 1) : l.qty - 1) } : l)),
      );
    },
    [dates, setCart, itemById],
  );

  const remove = useCallback((id: string) => setCart((c) => c.filter((l) => l.id !== id)), [setCart]);

  return { add, step, remove };
}

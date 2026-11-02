"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_PLACE } from "@/lib/places";
import { isoIn, type DateRange } from "@/lib/search";
import type { CartLine, Place } from "@/lib/types";

interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

interface AppState {
  /** false until browser-only values (today's date, saved list) are loaded */
  ready: boolean;
  place: Place;
  setPlace: (p: Place) => void;
  radiusIdx: number;
  setRadiusIdx: (i: number) => void;
  dates: DateRange;
  setDates: (d: Partial<DateRange>) => void;
  q: string;
  setQ: (q: string) => void;
  cart: CartLine[];
  setCart: (fn: (c: CartLine[]) => CartLine[]) => void;
  cartOpen: boolean;
  setCartOpen: (o: boolean) => void;
  toast: Toast | null;
  notify: (text: string, action?: Toast["action"]) => void;
}

const Ctx = createContext<AppState | null>(null);

const STORE_KEY = "sg_list";

function readStore(): { cart?: CartLine[]; from?: string; to?: string } | null {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
  } catch {
    return null;
  }
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [place, setPlace] = useState<Place>(DEFAULT_PLACE);
  const [radiusIdx, setRadiusIdx] = useState(3);
  const [dates, setDatesState] = useState<DateRange>({ from: "", to: "" });
  const [q, setQ] = useState("");
  const [cart, setCartState] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // load per-browser state once mounted; today's date isn't known at build time
  useEffect(() => {
    const saved = readStore();
    const today = isoIn(0);
    let from = saved?.from && saved.from >= today ? saved.from : isoIn(7);
    let to = saved?.to && saved.to >= from ? saved.to : isoIn(9);
    if (to < from) to = from;
    if (from < today) from = today;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage
    setDatesState({ from, to });
    setCartState(saved?.cart ?? []);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ cart, from: dates.from, to: dates.to }));
    } catch {
      // storage blocked (private window); the list just won't persist
    }
  }, [ready, cart, dates]);

  const setDates = useCallback((d: Partial<DateRange>) => {
    setDatesState((cur) => {
      const next = { ...cur, ...d };
      if (next.to < next.from) {
        if (d.from) next.to = next.from;
        else next.from = next.to;
      }
      return next;
    });
  }, []);

  const setCart = useCallback((fn: (c: CartLine[]) => CartLine[]) => setCartState(fn), []);

  const notify = useCallback((text: string, action?: Toast["action"]) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text, action });
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }, []);

  const value = useMemo<AppState>(
    () => ({
      ready, place, setPlace, radiusIdx, setRadiusIdx, dates, setDates, q, setQ,
      cart, setCart, cartOpen, setCartOpen, toast, notify,
    }),
    [ready, place, radiusIdx, dates, setDates, q, cart, setCart, cartOpen, toast, notify],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside AppStateProvider");
  return v;
}

"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Listings } from "@/lib/listings";
import type { Company, Item, Tech } from "@/lib/types";

interface AllListings {
  companies: Company[];
  items: Item[];
  techs: Tech[];
  itemById: (id: string) => Item | undefined;
  companyById: (id: string) => Company | undefined;
}

const Ctx = createContext<AllListings | null>(null);

/** Listings from Supabase, shared with every client component. */
export function ListingsProvider({ real, children }: { real: Listings; children: ReactNode }) {
  const value = useMemo(() => {
    const { companies, items, techs } = real;
    const itemMap = new Map(items.map((i) => [i.id, i]));
    const coMap = new Map(companies.map((c) => [c.id, c]));
    return { companies, items, techs, itemById: (id: string) => itemMap.get(id), companyById: (id: string) => coMap.get(id) };
  }, [real]);
  return <Ctx value={value}>{children}</Ctx>;
}

export function useListings() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useListings must be used inside ListingsProvider");
  return v;
}

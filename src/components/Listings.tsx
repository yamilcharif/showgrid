"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Listings } from "@/lib/listings";
import { COMPANIES, ITEMS, TECHS } from "@/lib/sample-data";
import type { Company, Item, Tech } from "@/lib/types";

interface AllListings {
  companies: Company[];
  items: Item[];
  techs: Tech[];
  itemById: (id: string) => Item | undefined;
  companyById: (id: string) => Company | undefined;
}

const Ctx = createContext<AllListings | null>(null);

/** Real listings from Supabase first, then the sample data. */
export function ListingsProvider({ real, children }: { real: Listings; children: ReactNode }) {
  const value = useMemo(() => {
    const companies = [...real.companies, ...COMPANIES];
    const items = [...real.items, ...ITEMS];
    const techs = [...real.techs, ...TECHS];
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

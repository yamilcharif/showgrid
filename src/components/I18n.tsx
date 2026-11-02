"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Locale } from "@/lib/i18n/config";
import type { Dict } from "@/lib/i18n/en";

const Ctx = createContext<{ locale: Locale; t: Dict } | null>(null);

/** Hands the page's dictionary to client components. */
export function I18nProvider({ locale, dict, children }: { locale: Locale; dict: Dict; children: ReactNode }) {
  return <Ctx value={{ locale, t: dict }}>{children}</Ctx>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n must be used inside I18nProvider");
  return v;
}

/** The current dictionary. */
export const useT = () => useI18n().t;

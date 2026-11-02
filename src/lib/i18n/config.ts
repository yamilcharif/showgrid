export const LOCALES = ["en", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
/** cookie that remembers the visitor's language */
export const LOCALE_COOKIE = "sg_lang";

export const hasLocale = (v: string | undefined | null): v is Locale => LOCALES.includes(v as Locale);

/** Language choices, labelled by region so people find theirs. */
export const REGIONS: { locale: Locale; label: string }[] = [
  { locale: "en", label: "English · US, UK, worldwide" },
  { locale: "es", label: "Español · Latinoamérica, España" },
];

// countries where Spanish is the main language (Vercel geo header)
const SPANISH = new Set("AR BO CL CO CR CU DO EC ES GQ GT HN MX NI PA PE PR PY SV UY VE".split(" "));

/** First visit: the browser's language, then the country, then English. */
export function pickLocale(acceptLanguage: string | null, country: string | null): Locale {
  for (const part of (acceptLanguage ?? "").split(",")) {
    const code = part.split(";")[0].trim().slice(0, 2).toLowerCase();
    if (hasLocale(code)) return code;
  }
  return country && SPANISH.has(country.toUpperCase()) ? "es" : DEFAULT_LOCALE;
}

/** "Sent to {names}." + { names: "YC3" } → "Sent to YC3." */
export function fmt(s: string, vars: Record<string, string | number>) {
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

/** English/Spanish plural pick from [one, many]. */
export const plural = (n: number, forms: readonly string[]) => fmt(n === 1 ? forms[0] : forms[1], { n: n.toLocaleString("en-US") });

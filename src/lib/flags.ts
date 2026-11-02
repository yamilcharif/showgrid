import { COUNTRIES } from "./places";

/** "MX" → 🇲🇽 (regional indicator letters; shows as letters where flag emoji aren't supported). */
export function flag(cc: string) {
  return cc
    .toUpperCase()
    .replace(/[A-Z]/g, (ch) => String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65));
}

/** Country name in the visitor's language, falling back to our English list. */
export function countryName(cc: string, locale: string) {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(cc) ?? COUNTRIES[cc]?.[0] ?? cc;
  } catch {
    return COUNTRIES[cc]?.[0] ?? cc;
  }
}

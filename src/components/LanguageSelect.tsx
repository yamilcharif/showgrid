"use client";

import { LOCALE_COOKIE, LOCALES, REGIONS, type Locale } from "@/lib/i18n/config";
import { useI18n } from "./I18n";

/** Save the language and reload the page in it. */
function change(l: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
  // drop an explicit /en or /es prefix so the saved choice applies
  const parts = window.location.pathname.split("/");
  const path = LOCALES.includes(parts[1] as Locale) ? "/" + parts.slice(2).join("/") : window.location.pathname;
  window.location.assign(path + window.location.search);
}

const NAMES: Record<Locale, string> = { en: "English", es: "Español" };

/** EN | ES switch for the header, so people see right away that the site comes in both languages. */
export function LanguageToggle() {
  const { locale, t } = useI18n();
  return (
    <div className="lang-toggle" role="group" aria-label={t.header.language}>
      <span className="globe hide-sm" aria-hidden="true">
        🌐
      </span>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          title={NAMES[l]}
          aria-label={NAMES[l]}
          aria-pressed={l === locale}
          onClick={() => l !== locale && change(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

/** Language picker, labelled by region. Saves the choice and reloads the page in that language. */
export function LanguageSelect({ className }: { className?: string }) {
  const { locale, t } = useI18n();
  return (
    <label className={className}>
      <span className="sr-only">{t.header.language}</span>
      <span aria-hidden="true">🌐</span>
      <select value={locale} onChange={(e) => change(e.target.value as Locale)} aria-label={t.header.language}>
        {REGIONS.map((r) => (
          <option key={r.locale} value={r.locale}>
            {r.label}
          </option>
        ))}
      </select>
    </label>
  );
}

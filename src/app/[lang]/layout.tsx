import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { AccountLink } from "@/components/AccountLink";
import { AppStateProvider } from "@/components/AppState";
import { GearListDrawer } from "@/components/GearListDrawer";
import { Header } from "@/components/Header";
import { I18nProvider } from "@/components/I18n";
import { LanguageSelect } from "@/components/LanguageSelect";
import { ListingsProvider } from "@/components/Listings";
import { Toast } from "@/components/Toast";
import { LOCALES } from "@/lib/i18n/config";
import { getDictionary, getLocale } from "@/lib/i18n/server";
import { getListings } from "@/lib/listings";
import "../globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

// every page is prerendered once per language
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { metadataBase: new URL("https://show-grid.com"), title: "ShowGrid", description: t.meta.description };
}

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const [locale, t, listings] = await Promise.all([getLocale(), getDictionary(), getListings()]);
  return (
    <html lang={locale} className={`${archivo.variable} ${mono.variable}`}>
      <body>
        <I18nProvider locale={locale} dict={t}>
          <ListingsProvider real={listings}>
            <AppStateProvider>
              <Header
                account={
                  <Suspense fallback={null}>
                    <AccountLink />
                  </Suspense>
                }
              />
              {children}
              <footer className="site">
                <div className="wrap">
                  <span>
                    <b>SHOWGRID</b> · {t.footer.tagline}
                  </span>
                  <span className="foot-links">
                    <Link href="/suggestions">{t.footer.suggestions}</Link>
                    <LanguageSelect className="lang" />
                    <span className="mono">show-grid.com</span>
                  </span>
                </div>
              </footer>
              <GearListDrawer />
              <Toast />
            </AppStateProvider>
          </ListingsProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

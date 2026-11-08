import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasLocale, LOCALE_COOKIE, pickLocale, type Locale } from "@/lib/i18n/config";

// API and sign-in callbacks aren't pages, so they have no language
const NO_LOCALE = /^\/(api|auth)(\/|$)/;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1];

  // Pages live under /[lang]. Links stay without it (show-grid.com/c/yc3-design) and are rewritten to the
  // visitor's language: their saved choice, else their browser language, else their country.
  let locale: Locale | null = null;
  let target: URL | null = null;
  if (!NO_LOCALE.test(pathname)) {
    if (hasLocale(first)) locale = first;
    else {
      const saved = request.cookies.get(LOCALE_COOKIE)?.value;
      locale = hasLocale(saved) ? saved : pickLocale(request.headers.get("accept-language"), request.headers.get("x-vercel-ip-country"));
      target = request.nextUrl.clone();
      target.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
    }
  }
  const respond = () => (target ? NextResponse.rewrite(target, { request }) : NextResponse.next({ request }));

  // refresh the Supabase session cookie, so Server Components see a valid session
  let response = respond();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list, headers) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = respond();
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });
  await supabase.auth.getClaims();

  // remember the language, so Server Actions (which can't see the URL segment) answer in it too
  if (locale && request.cookies.get(LOCALE_COOKIE)?.value !== locale) {
    response.cookies.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/|\\.well-known/|favicon.ico|sw.js|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)"],
};

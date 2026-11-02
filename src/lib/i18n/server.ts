import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { lang } from "next/root-params";
import { DEFAULT_LOCALE, hasLocale, LOCALE_COOKIE, type Locale } from "./config";
import { en, type Dict } from "./en";
import { es } from "./es";

const DICTS: Record<Locale, Dict> = { en, es };

/** The page's language (from the /[lang] segment the proxy rewrites to). Server Components only. */
export async function getLocale(): Promise<Locale> {
  const l = await lang();
  if (!hasLocale(l)) notFound();
  return l;
}

export async function getDictionary(): Promise<Dict> {
  return DICTS[await getLocale()];
}

/** For Server Actions and Route Handlers, which can't read the route segment: the visitor's language cookie. */
export async function actionDictionary(): Promise<Dict> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  return DICTS[hasLocale(c) ? c : DEFAULT_LOCALE];
}

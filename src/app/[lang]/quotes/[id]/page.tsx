import type { Metadata } from "next";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getAccount } from "@/lib/auth";
import { fmt, plural } from "@/lib/i18n/config";
import { getDictionary, getLocale } from "@/lib/i18n/server";
import { QUOTE_SELECT, type Quote } from "@/lib/requests";
import { money, rangeLabel } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "./PrintButton";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).quote.metaTitle, robots: { index: false } };
}

export default function QuotePage({ params }: PageProps<"/[lang]/quotes/[id]">) {
  return (
    <main className="wrap quote-page">
      <Suspense fallback={null}>
        <QuoteSheet params={params} />
      </Suspense>
    </main>
  );
}

async function QuoteSheet({ params }: { params: PageProps<"/[lang]/quotes/[id]">["params"] }) {
  const { id } = await params;
  const [acc, T, locale] = await Promise.all([getAccount(), getDictionary(), getLocale()]);
  if (!acc) redirect("/sign-in");
  const t = T.quote;
  const supabase = await createClient();
  // RLS: only the two people in the conversation can read the quote
  const { data } = await supabase.from("quotes").select(QUOTE_SELECT).eq("id", id).maybeSingle();
  if (!data) notFound();
  const q = data as Quote;
  const { data: req } = await supabase.from("rental_requests").select("start_day, end_day, company_id, from_profile").eq("id", q.request_id).single();
  if (!req) notFound();
  const [{ data: co }, { data: client }] = await Promise.all([
    supabase.from("companies").select("name, city_label, logo_url").eq("id", req.company_id).single(),
    supabase.from("profiles").select("display_name").eq("id", req.from_profile).single(),
  ]);
  const factor = Number(q.factor);
  const day = (d: string) => new Date(d).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });

  return (
    <article className="sheet">
      <header className="sheet-head">
        <div className="sheet-co">
          {co?.logo_url && (
            <div className="sheet-logo">
              <Image src={co.logo_url} alt="" fill sizes="80px" />
            </div>
          )}
          <div>
            <h1>{co?.name}</h1>
            <p className="muted">{co?.city_label}</p>
          </div>
        </div>
        <div className="sheet-meta">
          <h2>{t.title}</h2>
          <p className="muted small mono">#{q.id.slice(0, 8).toUpperCase()}</p>
          <p className="small">
            {t.issued}: {day(q.created_at)}
          </p>
          {q.valid_until && (
            <p className="small">
              {t.validUntil}: {day(`${q.valid_until}T12:00`)}
            </p>
          )}
        </div>
      </header>

      <section className="sheet-parties">
        <div>
          <p className="muted small">{t.for}</p>
          <b>{client?.display_name}</b>
        </div>
        <div>
          <p className="muted small">{t.dates}</p>
          <b>
            {rangeLabel({ from: req.start_day, to: req.end_day }, locale)} · {plural(q.days, T.list.days)}
          </b>
        </div>
      </section>

      <table className="sheet-table">
        <thead>
          <tr>
            <th>{t.item}</th>
            <th className="r">{t.qty}</th>
            <th className="r">{t.rate}</th>
            <th className="r">{t.lineTotal}</th>
          </tr>
        </thead>
        <tbody>
          {q.lines.map((l, i) => (
            <tr key={i}>
              <td>{l.name}</td>
              <td className="r num">{l.qty}</td>
              <td className="r num">{money(l.rate, q.currency)}</td>
              <td className="r num">{money(l.qty * l.rate * factor, q.currency)}</td>
            </tr>
          ))}
          {q.extras.map((x, i) => (
            <tr key={`x${i}`}>
              <td colSpan={3}>{x.label}</td>
              <td className="r num">{money(Number(x.amount), q.currency)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="muted small">
              {fmt(t.factor, { factor, days: plural(q.days, T.list.days) })}
            </td>
            <td className="r">
              <span className="muted small">{t.total}</span>
              <br />
              <b className="num sheet-total">{money(Number(q.total), q.currency)}</b>
            </td>
          </tr>
        </tfoot>
      </table>

      {q.note && (
        <section className="sheet-note">
          <p className="muted small">{t.note}</p>
          <p>{q.note}</p>
        </section>
      )}
      <footer className="sheet-foot muted small">show-grid.com</footer>
      <PrintButton label={t.printBtn} />
    </article>
  );
}

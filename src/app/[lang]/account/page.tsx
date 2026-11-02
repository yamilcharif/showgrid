import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getAccount, type Account } from "@/lib/auth";
import { money } from "@/lib/search";
import { fmt } from "@/lib/i18n/config";
import { cleanRule } from "@/lib/pricing";
import type { Dict } from "@/lib/i18n/en";
import { getDictionary } from "@/lib/i18n/server";
import { signOut } from "./actions";
import { PasswordCard } from "./PasswordCard";
import { PricingCard } from "./PricingCard";
import { ProfileSetup } from "./ProfileSetup";
import { PublicPageCard } from "./PublicPageCard";
import { RentmanCard } from "./RentmanCard";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).account.metaTitle };
}

export default async function AccountPage() {
  const t = await getDictionary();
  return (
    <main className="wrap auth-page">
      <Suspense fallback={<p className="muted">{t.account.loading}</p>}>
        <AccountContent />
      </Suspense>
    </main>
  );
}

async function AccountContent() {
  const [acc, t] = await Promise.all([getAccount(), getDictionary()]);
  if (!acc) redirect("/sign-in");
  if (!acc.profile) {
    return (
      <>
        <h1>{t.account.setupTitle}</h1>
        <ProfileSetup email={acc.email} />
      </>
    );
  }
  return <Summary acc={acc} t={t.account} />;
}

function Summary({ acc, t }: { acc: Account; t: Dict["account"] }) {
  const { company, tech } = acc;
  return (
    <>
      <p className="eyebrow muted">{acc.profile!.kind === "company" ? t.company : t.crew}</p>
      <h1>{acc.profile!.display_name}</h1>
      <dl className="auth-dl">
        <dt>{t.email}</dt>
        <dd>{acc.email}</dd>
        {company && (
          <>
            <dt>{t.city}</dt>
            <dd>{company.city_label}</dd>
            <dt>{t.currency}</dt>
            <dd>{company.currency}</dd>
            <dt>{t.status}</dt>
            <dd>{company.verified_at ? t.verified : t.notVerified}</dd>
          </>
        )}
        {tech && (
          <>
            <dt>{t.role}</dt>
            <dd>{tech.role}</dd>
            <dt>{t.city}</dt>
            <dd>{tech.city_label}</dd>
            {tech.skills.length > 0 && (
              <>
                <dt>{t.skills}</dt>
                <dd>{tech.skills.join(", ")}</dd>
              </>
            )}
            <dt>{t.experience}</dt>
            <dd>{fmt(t.years, { n: tech.years_experience })}</dd>
            <dt>{t.dayRate}</dt>
            <dd>{tech.day_rate ? money(tech.day_rate, tech.currency) : t.onRequest}</dd>
          </>
        )}
      </dl>
      {company && <PublicPageCard slug={company.slug} about={company.about} companyId={company.id} logo={company.logo_url} />}
      {company && <PricingCard initial={cleanRule(company.price_rule)} />}
      {company && (
        <Suspense fallback={null}>
          <Inventory />
        </Suspense>
      )}
      <PasswordCard hasPassword={acc.hasPassword} />
      <form action={signOut}>
        <button className="btn">{t.signOut}</button>
      </form>
    </>
  );
}

async function Inventory() {
  const acc = await getAccount();
  const supabase = await createClient();
  // RLS only returns the owner's own connection
  const [{ data: conn }, { data: co }] = await Promise.all([
    supabase.from("inventory_connections").select("last_synced_at, last_error").eq("source", "rentman").maybeSingle(),
    supabase.from("companies").select("id").eq("owner_id", acc!.id).maybeSingle(),
  ]);
  const { count } = co
    ? await supabase.from("items").select("id", { count: "exact", head: true }).eq("company_id", co.id).eq("source", "rentman")
    : { count: 0 };
  return (
    <RentmanCard
      status={{ connected: Boolean(conn), lastSyncedAt: conn?.last_synced_at ?? null, lastError: conn?.last_error ?? null, items: count ?? 0 }}
    />
  );
}

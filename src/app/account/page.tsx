import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getAccount, type Account } from "@/lib/auth";
import { money } from "@/lib/search";
import { signOut } from "./actions";
import { PasswordCard } from "./PasswordCard";
import { ProfileSetup } from "./ProfileSetup";
import { RentmanCard } from "./RentmanCard";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your account · ShowGrid" };

export default function AccountPage() {
  return (
    <main className="wrap auth-page">
      <Suspense fallback={<p className="muted">Loading your account…</p>}>
        <AccountContent />
      </Suspense>
    </main>
  );
}

async function AccountContent() {
  const acc = await getAccount();
  if (!acc) redirect("/sign-in");
  if (!acc.profile) {
    return (
      <>
        <h1>Set up your profile</h1>
        <ProfileSetup email={acc.email} />
      </>
    );
  }
  return <Summary acc={acc} />;
}

function Summary({ acc }: { acc: Account }) {
  const { company, tech } = acc;
  return (
    <>
      <p className="eyebrow muted">{acc.profile!.kind === "company" ? "Rental company" : "Crew"}</p>
      <h1>{acc.profile!.display_name}</h1>
      <dl className="auth-dl">
        <dt>Email</dt>
        <dd>{acc.email}</dd>
        {company && (
          <>
            <dt>City</dt>
            <dd>{company.city_label}</dd>
            <dt>Currency</dt>
            <dd>{company.currency}</dd>
            <dt>Status</dt>
            <dd>{company.verified_at ? "Verified" : "Not verified yet"}</dd>
          </>
        )}
        {tech && (
          <>
            <dt>Role</dt>
            <dd>{tech.role}</dd>
            <dt>City</dt>
            <dd>{tech.city_label}</dd>
            {tech.skills.length > 0 && (
              <>
                <dt>Skills</dt>
                <dd>{tech.skills.join(", ")}</dd>
              </>
            )}
            <dt>Experience</dt>
            <dd>{tech.years_experience} years</dd>
            <dt>Day rate</dt>
            <dd>{tech.day_rate ? money(tech.day_rate, tech.currency) : "On request"}</dd>
          </>
        )}
      </dl>
      {company && (
        <Suspense fallback={null}>
          <Inventory />
        </Suspense>
      )}
      <PasswordCard hasPassword={acc.hasPassword} />
      <form action={signOut}>
        <button className="btn">Sign out</button>
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

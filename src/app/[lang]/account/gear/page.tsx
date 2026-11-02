import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getAccount } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { GearManager, type OwnItem } from "./GearManager";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).gear.metaTitle };
}

export default async function ManageGearPage() {
  const t = (await getDictionary()).gear;
  return (
    <main className="wrap gear-page">
      <Link href="/account" className="back">
        {t.back}
      </Link>
      <h1>{t.title}</h1>
      <p className="muted">
        {t.lede}
      </p>
      <Suspense fallback={<p className="muted">{t.loading}</p>}>
        <Gear />
      </Suspense>
    </main>
  );
}

async function Gear() {
  const acc = await getAccount();
  if (!acc) redirect("/sign-in");
  if (!acc.company) redirect("/account");
  const supabase = await createClient();
  const { data: co } = await supabase.from("companies").select("id").eq("owner_id", acc.id).single();
  if (!co) redirect("/account");
  // owners see their hidden items too (RLS)
  const { data } = await supabase
    .from("items")
    .select("id, source, name, custom_name, spec, custom_spec, category, custom_category, quantity_owned, custom_quantity, day_rate, custom_day_rate, listed, public_price, image_url, photo_url")
    .eq("company_id", co.id)
    .order("name")
    .limit(5000);
  return <GearManager companyId={co.id} slug={acc.company.slug} initial={(data ?? []) as OwnItem[]} />;
}

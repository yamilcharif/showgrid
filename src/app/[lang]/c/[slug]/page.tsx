import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getCompanyPage } from "@/lib/listings";
import { getAccount } from "@/lib/auth";
import { fmt } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/server";
import { CompanyInventory } from "./CompanyInventory";

export async function generateMetadata({ params }: PageProps<"/[lang]/c/[slug]">): Promise<Metadata> {
  const [co, t] = await Promise.all([getCompanyPage((await params).slug), getDictionary()]);
  if (!co) return { title: "ShowGrid" };
  return {
    title: fmt(t.company.metaTitle, { name: co.name }),
    description: co.about ?? fmt(t.company.metaDescription, { name: co.name, city: co.city }),
  };
}

export default async function CompanyPageRoute({ params }: PageProps<"/[lang]/c/[slug]">) {
  const t = await getDictionary();
  return (
    <main>
      <Suspense fallback={<div className="wrap co-page muted">{t.company.loading}</div>}>
        <Company params={params} />
      </Suspense>
    </main>
  );
}

async function Company({ params }: { params: PageProps<"/[lang]/c/[slug]">["params"] }) {
  const co = await getCompanyPage((await params).slug);
  if (!co) notFound();
  // the owner gets edit controls on their own page
  const acc = await getAccount();
  return <CompanyInventory company={co} isOwner={acc?.company?.id === co.id} />;
}

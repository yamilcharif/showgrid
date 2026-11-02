import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getAccount } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { EditProfileForm } from "./EditProfileForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).editProfile.metaTitle };
}

export default async function EditProfilePage() {
  const t = (await getDictionary()).editProfile;
  return (
    <main className="wrap auth-page">
      <Link href="/account" className="back muted">
        {t.back}
      </Link>
      <h1>{t.title}</h1>
      <Suspense fallback={null}>
        <Form />
      </Suspense>
    </main>
  );
}

async function Form() {
  const acc = await getAccount();
  if (!acc) redirect("/sign-in");
  if (!acc.profile) redirect("/account");
  if (acc.company) {
    const c = acc.company;
    return (
      <EditProfileForm
        kind="company"
        name={c.name}
        city={c.city_label}
        about={c.about}
        phone={c.phone}
        contactEmail={c.contact_email}
        address={c.address}
        website={c.website}
        instagram={c.instagram}
      />
    );
  }
  // availability isn't on the account summary, so read it here
  const supabase = await createClient();
  const { data } = await supabase.from("techs").select("available").eq("owner_id", acc.id).maybeSingle();
  const tech = acc.tech!;
  return (
    <EditProfileForm
      kind="tech"
      name={tech.name}
      city={tech.city_label}
      role={tech.role}
      skills={tech.skills}
      years={tech.years_experience}
      rate={tech.day_rate}
      available={data?.available ?? true}
      phone={tech.phone}
      website={tech.website}
      instagram={tech.instagram}
    />
  );
}

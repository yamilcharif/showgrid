import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "./SignInForm";
import { getDictionary } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).signIn.metaTitle };
}

export default async function SignInPage({ searchParams }: PageProps<"/[lang]/sign-in">) {
  const t = await getDictionary();
  return (
    <main className="wrap auth-page">
      <h1>{t.signIn.title}</h1>
      <p className="muted">{t.signIn.lede}</p>
      <Suspense fallback={<SignInForm linkError={false} />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/[lang]/sign-in">["searchParams"] }) {
  const { error } = await searchParams;
  return <SignInForm linkError={error === "link"} />;
}

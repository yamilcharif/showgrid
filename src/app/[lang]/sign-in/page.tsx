import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "./SignInForm";
import { getDictionary } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).signIn.metaTitle };
}

export default async function SignInPage({ searchParams }: PageProps<"/[lang]/sign-in">) {
  return (
    <main className="wrap auth-page">
      <Suspense fallback={<SignInForm linkError={false} start="password" />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/[lang]/sign-in">["searchParams"] }) {
  const { error, new: join } = await searchParams;
  return <SignInForm linkError={error === "link"} start={join ? "join" : "password"} />;
}

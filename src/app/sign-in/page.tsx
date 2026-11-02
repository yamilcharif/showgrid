import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in · ShowGrid" };

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <main className="wrap auth-page">
      <h1>Sign in</h1>
      <p className="muted">List your gear or your skills, and message rental houses and crew.</p>
      <Suspense fallback={<SignInForm linkError={false} />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/sign-in">["searchParams"] }) {
  const { error } = await searchParams;
  return <SignInForm linkError={error === "link"} />;
}

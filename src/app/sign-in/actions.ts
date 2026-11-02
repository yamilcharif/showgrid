"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export interface SignInState {
  sent?: string;
  error?: string;
}

export async function sendSignInLink(_prev: SignInState, form: FormData): Promise<SignInState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };

  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/confirm?next=/account` },
  });
  if (error) {
    return {
      error:
        error.status === 429
          ? "Too many sign-in emails were sent. Wait a few minutes and try again."
          : "We couldn't send the email. Check the address and try again.",
    };
  }
  return { sent: email };
}

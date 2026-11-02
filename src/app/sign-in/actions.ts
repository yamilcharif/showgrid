"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
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

export interface CodeState {
  error?: string;
}

/** Sign in with the code from the email, so it works in any browser or window. */
export async function verifyCode(_prev: CodeState, form: FormData): Promise<CodeState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const token = String(form.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6,10}$/.test(token)) return { error: "Enter the code from the email (numbers only)." };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { error: "That code didn't work. It may have expired or already been used. Send a new one." };
  redirect("/account");
}

export interface PasswordState {
  error?: string;
}

export async function signInWithPassword(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      error:
        error.status === 429
          ? "Too many tries. Wait a few minutes and try again."
          : "Wrong email or password. First time here, or no password yet? Use “Email me a code” below.",
    };
  }
  redirect("/account");
}

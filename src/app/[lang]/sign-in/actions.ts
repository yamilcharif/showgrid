"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { landingPath } from "@/lib/auth";
import { actionDictionary } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export interface SignInState {
  sent?: string;
  error?: string;
}

export async function sendSignInLink(_prev: SignInState, form: FormData): Promise<SignInState> {
  const t = (await actionDictionary()).signIn;
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: t.errEmail };

  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });
  if (error) {
    return {
      error:
        error.status === 429
          ? t.errTooMany
          : t.errSend,
    };
  }
  return { sent: email };
}

export interface CodeState {
  error?: string;
}

/** Sign in with the code from the email, so it works in any browser or window. */
export async function verifyCode(_prev: CodeState, form: FormData): Promise<CodeState> {
  const t = (await actionDictionary()).signIn;
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const token = String(form.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6,10}$/.test(token)) return { error: t.errCodeFormat };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { error: t.errCode };
  redirect(await landingPath(supabase));
}

export interface PasswordState {
  error?: string;
}

export async function signInWithPassword(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  const t = (await actionDictionary()).signIn;
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: t.errMissing };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      error:
        error.status === 429
          ? t.errTooManyTries
          : t.errWrong,
    };
  }
  redirect(await landingPath(supabase));
}

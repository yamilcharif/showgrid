"use server";

import { actionDictionary } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/config";
import { getAccount } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";

export interface FeedbackState {
  error?: string;
  sent?: boolean;
}

export async function sendFeedback(_prev: FeedbackState, form: FormData): Promise<FeedbackState> {
  const message = String(form.get("message") ?? "").trim();
  if (message.length < 3) return { error: (await actionDictionary()).suggestions.errShort };
  if (message.length > 4000) return { error: (await actionDictionary()).suggestions.errLong };
  const name = String(form.get("name") ?? "").trim().slice(0, 120) || null;
  const email = String(form.get("email") ?? "").trim().slice(0, 200) || null;

  const acc = await getAccount();
  const supabase = await createClient();
  const { error } = await supabase.from("feedback").insert({ profile_id: acc?.profile ? acc.id : null, name, email, message });
  if (error) return { error: (await actionDictionary()).suggestions.errSend };

  // a copy to the team; the suggestion is already saved, so a failed email doesn't fail the form
  const from = name ?? acc?.profile?.display_name ?? "Someone";
  const replyTo = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : acc?.email;
  await sendEmail({
    to: process.env.FEEDBACK_EMAIL || "hello@show-grid.com",
    subject: `ShowGrid suggestion from ${from}`,
    text: [
      message,
      "",
      "—",
      `Name: ${name ?? "(not given)"}`,
      `Email: ${email ?? "(not given)"}`,
      acc ? `Signed in as: ${acc.profile?.display_name ?? ""} <${acc.email}>` : "Not signed in",
    ].join("\n"),
    replyTo,
  });

  // a thank-you to the person who wrote, in their language
  if (replyTo) {
    const t = (await actionDictionary()).suggestions;
    const who = name ?? acc?.profile?.display_name;
    await sendEmail({
      to: replyTo,
      subject: t.mailSubject,
      text: [who ? fmt(t.mailHello, { name: who }) : t.mailHelloAnon, "", t.mailBody, "", t.mailSign, "", "—", t.mailYours, message].join("\n"),
    });
  }
  return { sent: true };
}

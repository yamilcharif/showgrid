import "server-only";

/** Sends a plain-text email through Resend's API. Returns false, without throwing, when it isn't set up or fails. */
export async function sendEmail(mail: { to: string; subject: string; text: string; replyTo?: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("sendEmail: RESEND_API_KEY is not set, email skipped");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "ShowGrid <hello@show-grid.com>",
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
      }),
    });
    if (!res.ok) console.error("sendEmail: Resend answered", res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.error("sendEmail failed", e);
    return false;
  }
}

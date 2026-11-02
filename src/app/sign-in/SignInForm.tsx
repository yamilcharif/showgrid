"use client";

import { useActionState } from "react";
import { sendSignInLink, type SignInState } from "./actions";

export function SignInForm({ linkError }: { linkError: boolean }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(sendSignInLink, {});

  if (state.sent) {
    return (
      <div className="auth-sent" role="status">
        <h2>Check your email</h2>
        <p>
          We sent a sign-in link to <b>{state.sent}</b>. Open it on this device, in this browser. The link works once and
          expires in an hour.
        </p>
        <p className="muted">Nothing there? Check spam, or wait a minute and send another.</p>
      </div>
    );
  }

  return (
    <form action={action} className="auth-form">
      {linkError && !state.error && (
        <p className="auth-err" role="alert">
          That sign-in link didn&apos;t work. It may have expired or been opened in another browser. Send a new one.
        </p>
      )}
      <div className="field">
        <label htmlFor="email">Work email</label>
        <input id="email" name="email" type="email" autoComplete="email" required placeholder="you@company.com" />
      </div>
      {state.error && (
        <p className="auth-err" role="alert">
          {state.error}
        </p>
      )}
      <button className="btn primary" disabled={pending}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
      <p className="muted small">No password needed. New here? The same link creates your account.</p>
    </form>
  );
}

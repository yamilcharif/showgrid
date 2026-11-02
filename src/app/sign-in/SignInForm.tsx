"use client";

import { useActionState } from "react";
import { sendSignInLink, verifyCode, type CodeState, type SignInState } from "./actions";

export function SignInForm({ linkError }: { linkError: boolean }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(sendSignInLink, {});

  if (state.sent) return <CodeForm email={state.sent} />;

  return (
    <form action={action} className="auth-form">
      {linkError && !state.error && (
        <p className="auth-err" role="alert">
          That sign-in link didn&apos;t work. It may have expired or already been used. Send a new one, then type the code from the email.
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

function CodeForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<CodeState, FormData>(verifyCode, {});
  return (
    <form action={action} className="auth-form" aria-labelledby="check-email">
      <div role="status">
        <h2 id="check-email" className="auth-h2">
          Check your email
        </h2>
        <p>
          We sent a sign-in code to <b>{email}</b>. Type it here, or click the link in the email.
        </p>
      </div>
      <input type="hidden" name="email" value={email} />
      <div className="field">
        <label htmlFor="code">Code</label>
        <input
          id="code"
          name="code"
          className="code-input num"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,12}"
          maxLength={12}
          required
          autoFocus
        />
      </div>
      {state.error && (
        <p className="auth-err" role="alert">
          {state.error}
        </p>
      )}
      <button className="btn primary" disabled={pending}>
        {pending ? "Checking…" : "Sign in"}
      </button>
      <p className="muted small">The code works once and expires in an hour. Nothing there? Check spam, or reload this page to send another.</p>
    </form>
  );
}

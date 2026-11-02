"use client";

import { useActionState, useEffect, useState } from "react";
import {
  sendSignInLink,
  signInWithPassword,
  verifyCode,
  type CodeState,
  type PasswordState,
  type SignInState,
} from "./actions";

export function SignInForm({ linkError }: { linkError: boolean }) {
  const [mode, setMode] = useState<"password" | "code">("password");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState("");

  if (sent) return <CodeForm email={sent} />;

  return (
    <div className="auth-form">
      {linkError && (
        <p className="auth-err" role="alert">
          That sign-in link didn&apos;t work. It may have expired or already been used. Send a new code below.
        </p>
      )}
      {mode === "password" ? (
        <PasswordForm email={email} setEmail={setEmail} />
      ) : (
        <SendCodeForm email={email} setEmail={setEmail} onSent={setSent} />
      )}
      <div className="auth-switch">
        {mode === "password" ? (
          <>
            <span className="muted">First time here, or forgot your password?</span>
            <button type="button" className="link" onClick={() => setMode("code")}>
              Email me a code
            </button>
          </>
        ) : (
          <>
            <span className="muted">Already set a password?</span>
            <button type="button" className="link" onClick={() => setMode("password")}>
              Sign in with password
            </button>
          </>
        )}
      </div>
    </div>
  );
}

interface EmailProps {
  email: string;
  setEmail: (v: string) => void;
}

function EmailField({ email, setEmail }: EmailProps) {
  return (
    <div className="field">
      <label htmlFor="email">Work email</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="you@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
    </div>
  );
}

function PasswordForm(props: EmailProps) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(signInWithPassword, {});
  return (
    <form action={action} className="auth-stack">
      <EmailField {...props} />
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state.error && (
        <p className="auth-err" role="alert">
          {state.error}
        </p>
      )}
      <button className="btn primary" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

function SendCodeForm({ onSent, ...props }: EmailProps & { onSent: (email: string) => void }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(sendSignInLink, {});
  useEffect(() => {
    if (state.sent) onSent(state.sent);
  }, [state.sent, onSent]);
  return (
    <form action={action} className="auth-stack">
      <EmailField {...props} />
      {state.error && (
        <p className="auth-err" role="alert">
          {state.error}
        </p>
      )}
      <button className="btn primary" disabled={pending}>
        {pending ? "Sending…" : "Email me a code"}
      </button>
      <p className="muted small">New here? The code creates your account. After that you can set a password.</p>
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

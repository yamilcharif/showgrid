"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/components/I18n";
import { fmt } from "@/lib/i18n/config";
import {
  sendSignInLink,
  signInWithPassword,
  verifyCode,
  type CodeState,
  type PasswordState,
  type SignInState,
} from "./actions";

export function SignInForm({ linkError }: { linkError: boolean }) {
  const t = useT();
  const [mode, setMode] = useState<"password" | "code">("password");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState("");

  if (sent) return <CodeForm email={sent} />;

  return (
    <div className="auth-form">
      {linkError && (
        <p className="auth-err" role="alert">
          {t.signIn.linkError}
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
            <span className="muted">{t.signIn.firstTime}</span>
            <button type="button" className="link" onClick={() => setMode("code")}>
              {t.signIn.emailCode}
            </button>
          </>
        ) : (
          <>
            <span className="muted">{t.signIn.havePassword}</span>
            <button type="button" className="link" onClick={() => setMode("password")}>
              {t.signIn.withPassword}
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
  const t = useT();
  return (
    <div className="field">
      <label htmlFor="email">{t.signIn.email}</label>
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
  const t = useT();
  const [state, action, pending] = useActionState<PasswordState, FormData>(signInWithPassword, {});
  return (
    <form action={action} className="auth-stack">
      <EmailField {...props} />
      <div className="field">
        <label htmlFor="password">{t.signIn.password}</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state.error && (
        <p className="auth-err" role="alert">
          {state.error}
        </p>
      )}
      <button className="btn primary" disabled={pending}>
        {pending ? t.signIn.signingIn : t.signIn.signIn}
      </button>
    </form>
  );
}

function SendCodeForm({ onSent, ...props }: EmailProps & { onSent: (email: string) => void }) {
  const t = useT();
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
        {pending ? t.signIn.sending : t.signIn.emailCode}
      </button>
      <p className="muted small">{t.signIn.newHere}</p>
      <p className="muted small">
        {t.signIn.termsNote}{" "}
        <Link href="/terms" target="_blank">
          {t.signIn.termsLink}
        </Link>
        .
      </p>
    </form>
  );
}

function CodeForm({ email }: { email: string }) {
  const t = useT();
  const [state, action, pending] = useActionState<CodeState, FormData>(verifyCode, {});
  return (
    <form action={action} className="auth-form" aria-labelledby="check-email">
      <div role="status">
        <h2 id="check-email" className="auth-h2">
          {t.signIn.checkEmail}
        </h2>
        <p>
          {fmt(t.signIn.codeSent, { email })}
        </p>
      </div>
      <input type="hidden" name="email" value={email} />
      <div className="field">
        <label htmlFor="code">{t.signIn.code}</label>
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
        {pending ? t.signIn.checking : t.signIn.signIn}
      </button>
      <p className="muted small">{t.signIn.codeNote}</p>
    </form>
  );
}

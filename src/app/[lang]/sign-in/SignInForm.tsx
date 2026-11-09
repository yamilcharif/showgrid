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

type Mode = "join" | "password" | "code";

export function SignInForm({ linkError, start }: { linkError: boolean; start: Mode }) {
  const t = useT();
  const [mode, setMode] = useState<Mode>(start);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState("");

  if (sent) return <CodeForm email={sent} />;

  const s = t.signIn;
  const link = (to: Mode, label: string) => (
    <button type="button" className="link" onClick={() => setMode(to)}>
      {label}
    </button>
  );

  return (
    <>
      <h1>{mode === "join" ? s.joinTitle : mode === "code" ? s.codeTitle : s.title}</h1>
      <p className="muted">{mode === "join" ? s.joinLede : s.lede}</p>
      <div className="auth-form">
        {linkError && (
          <p className="auth-err" role="alert">
            {s.linkError}
          </p>
        )}
        {mode === "join" && (
          <ul className="join-perks">
            {s.joinPerks.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {mode === "password" ? (
          <PasswordForm email={email} setEmail={setEmail} />
        ) : (
          <SendCodeForm email={email} setEmail={setEmail} onSent={setSent} join={mode === "join"} />
        )}
        {mode === "join" ? (
          <div className="auth-switch">
            <span className="muted">{s.haveAccount}</span>
            {link("password", s.signInLink)}
          </div>
        ) : (
          <>
            <div className="auth-switch join-switch">
              <span>{s.newToShowGrid}</span>
              <button type="button" className="btn join-btn" onClick={() => setMode("join")}>
                {s.joinLink}
              </button>
            </div>
            <div className="auth-switch">
              {mode === "password" ? (
                <>
                  <span className="muted">{s.forgot}</span>
                  {link("code", s.emailCode)}
                </>
              ) : (
                <>
                  <span className="muted">{s.havePassword}</span>
                  {link("password", s.withPassword)}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </>
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

function SendCodeForm({ onSent, join, ...props }: EmailProps & { onSent: (email: string) => void; join: boolean }) {
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
        {pending ? t.signIn.sending : join ? t.signIn.joinCta : t.signIn.emailCode}
      </button>
      {!join && <p className="muted small">{t.signIn.newHere}</p>}
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

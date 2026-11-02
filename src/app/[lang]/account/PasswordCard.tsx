"use client";

import { useActionState } from "react";
import { setPassword, type PasswordState } from "./actions";
import { useT } from "@/components/I18n";

export function PasswordCard({ hasPassword }: { hasPassword: boolean }) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(setPassword, {});
  const done = hasPassword || state.saved;
  const t = useT().password;

  return (
    <form action={action} className={done ? "auth-form pw-card" : "auth-form pw-card pw-todo"}>
      <div>
        <b>{done ? t.change : t.set}</b>
        <p className="muted small">
          {done
            ? t.hasText
            : t.setText}
        </p>
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="password">{t.new}</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        <div className="field">
          <label htmlFor="confirm">{t.again}</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
        </div>
      </div>
      {state.error && (
        <p className="auth-err" role="alert">
          {state.error}
        </p>
      )}
      {state.saved && (
        <p className="auth-ok" role="status">
          {t.saved}
        </p>
      )}
      <button className="btn primary" disabled={pending}>
        {pending ? t.saving : t.save}
      </button>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { setPassword, type PasswordState } from "./actions";

export function PasswordCard({ hasPassword }: { hasPassword: boolean }) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(setPassword, {});
  const done = hasPassword || state.saved;

  return (
    <form action={action} className={done ? "auth-form pw-card" : "auth-form pw-card pw-todo"}>
      <div>
        <b>{done ? "Change password" : "Set a password"}</b>
        <p className="muted small">
          {done
            ? "You sign in with your email and password. If you forget it, use “Email me a code”."
            : "So next time you sign in with your email and password, without waiting for a code."}
        </p>
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="password">New password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        <div className="field">
          <label htmlFor="confirm">Type it again</label>
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
          Password saved. Next time, sign in with your email and password.
        </p>
      )}
      <button className="btn primary" disabled={pending}>
        {pending ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}

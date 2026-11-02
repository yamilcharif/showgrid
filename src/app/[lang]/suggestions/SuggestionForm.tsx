"use client";

import { useActionState } from "react";
import { sendFeedback, type FeedbackState } from "./actions";
import { useT } from "@/components/I18n";

export function SuggestionForm() {
  const [state, action, pending] = useActionState<FeedbackState, FormData>(sendFeedback, {});
  const t = useT().suggestions;
  if (state.sent) {
    return (
      <div className="auth-form" role="status">
        <h2 className="auth-h2">{t.thanks}</h2>
        <p>{t.thanksText}</p>
      </div>
    );
  }
  return (
    <form action={action} className="auth-form">
      <div className="field">
        <label htmlFor="message">{t.label}</label>
        <textarea
          id="message"
          name="message"
          rows={6}
          maxLength={4000}
          required
          className="about-input"
          placeholder={t.placeholder}
        />
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="name">{t.name}</label>
          <input id="name" name="name" autoComplete="name" maxLength={120} />
        </div>
        <div className="field">
          <label htmlFor="email">{t.email}</label>
          <input id="email" name="email" type="email" autoComplete="email" maxLength={200} />
        </div>
      </div>
      {state.error && (
        <p className="auth-err" role="alert">
          {state.error}
        </p>
      )}
      <button className="btn primary" disabled={pending}>
        {pending ? t.sending : t.send}
      </button>
      <p className="muted small">{t.replyNote}</p>
    </form>
  );
}

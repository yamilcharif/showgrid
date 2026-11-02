"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveAbout, saveLogo, type AboutState } from "./actions";
import { useT } from "@/components/I18n";
import { ImageUpload } from "@/components/ImageUpload";

export function PublicPageCard({ slug, about, companyId, logo }: { slug: string; about: string | null; companyId: string; logo: string | null }) {
  const [state, action, pending] = useActionState<AboutState, FormData>(saveAbout, {});
  const [copied, setCopied] = useState(false);
  const t = useT().publicPage;
  const path = `/c/${slug}`;
  const url = `https://www.show-grid.com${path}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked: the link is still on screen to copy by hand
    }
  };

  return (
    <section className="auth-form inv-card">
      <div>
        <b>{t.title}</b>
        <p className="muted small">{t.text}</p>
      </div>
      <ImageUpload
        initial={logo}
        folder={companyId}
        name="logo"
        save={saveLogo}
        labels={{ empty: t.logo, add: t.addLogo, change: t.changeLogo, remove: t.removeLogo, hint: t.logoHint }}
      />
      <div className="pub-link">
        <code>{url}</code>
        <div className="inv-actions">
          <Link className="btn sm primary" href={path}>
            {t.open}
          </Link>
          <button type="button" className="btn sm" onClick={copy}>
            {copied ? t.copied : t.copy}
          </button>
          <Link className="btn sm" href="/account/gear">
            {t.manage}
          </Link>
        </div>
      </div>
      <form action={action} className="auth-stack">
        <div className="field">
          <label htmlFor="about">{t.about}</label>
          <textarea
            id="about"
            name="about"
            rows={3}
            maxLength={1000}
            defaultValue={about ?? ""}
            placeholder={t.aboutPlaceholder}
            className="about-input"
          />
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
        <button className="btn" disabled={pending}>
          {pending ? t.saving : t.save}
        </button>
      </form>
    </section>
  );
}

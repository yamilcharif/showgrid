"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { saveLogo } from "@/app/[lang]/account/actions";
import { createClient } from "@/lib/supabase/browser";
import { useT } from "./I18n";

/** Upload, change or remove the company logo. Files go to the company's own folder in storage. */
export function LogoUpload({ companyId, initial }: { companyId: string; initial: string | null }) {
  const t = useT();
  const file = useRef<HTMLInputElement>(null);
  const [logo, setLogo] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const upload = async (f: File) => {
    setError("");
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return setError(t.gear.errType);
    if (f.size > 8 * 1024 * 1024) return setError(t.gear.errSize);
    setBusy(true);
    const supabase = createClient();
    const path = `${companyId}/logo-${Date.now()}.${f.type.split("/")[1].replace("jpeg", "jpg")}`;
    const { error: upErr } = await supabase.storage.from("gear-photos").upload(path, f, { contentType: f.type });
    if (upErr) {
      setBusy(false);
      return setError(t.gear.errUpload);
    }
    const url = supabase.storage.from("gear-photos").getPublicUrl(path).data.publicUrl;
    const res = await saveLogo(url);
    setBusy(false);
    if (res.error) setError(res.error);
    else setLogo(url);
  };

  const remove = async () => {
    const res = await saveLogo(null);
    if (res.error) setError(res.error);
    else setLogo(null);
  };

  return (
    <div className="logo-up">
      <div className="logo-box">{logo ? <Image src={logo} alt="" fill sizes="72px" /> : <span>{t.publicPage.logo}</span>}</div>
      <div className="logo-actions">
        <div className="inv-actions">
          <button type="button" className="btn sm" disabled={busy} onClick={() => file.current?.click()}>
            {busy ? "…" : logo ? t.publicPage.changeLogo : t.publicPage.addLogo}
          </button>
          {logo && (
            <button type="button" className="link" onClick={remove}>
              {t.publicPage.removeLogo}
            </button>
          )}
        </div>
        <span className="muted small">{t.publicPage.logoHint}</span>
        {error && (
          <span className="auth-err" role="alert">
            {error}
          </span>
        )}
      </div>
      <input
        ref={file}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) upload(f);
        }}
      />
    </div>
  );
}

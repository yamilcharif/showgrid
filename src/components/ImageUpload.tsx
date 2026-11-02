"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useT } from "./I18n";

interface Props {
  initial: string | null;
  /** storage folder in the public gear-photos bucket the owner may write to, e.g. "<company id>" or "crew/<user id>" */
  folder: string;
  name: string;
  /** Server Action that checks and saves the uploaded URL (or null to remove it) */
  save: (url: string | null) => Promise<{ error?: string }>;
  labels: { empty: string; add: string; change: string; remove: string; hint: string };
  round?: boolean;
}

/** Upload, change or remove one image: a company logo or a crew photo. */
export function ImageUpload({ initial, folder, name, save, labels, round }: Props) {
  const t = useT();
  const file = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const upload = async (f: File) => {
    setError("");
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return setError(t.gear.errType);
    if (f.size > 8 * 1024 * 1024) return setError(t.gear.errSize);
    setBusy(true);
    const supabase = createClient();
    const path = `${folder}/${name}-${Date.now()}.${f.type.split("/")[1].replace("jpeg", "jpg")}`;
    const { error: upErr } = await supabase.storage.from("gear-photos").upload(path, f, { contentType: f.type });
    if (upErr) {
      setBusy(false);
      return setError(t.gear.errUpload);
    }
    const url = supabase.storage.from("gear-photos").getPublicUrl(path).data.publicUrl;
    const res = await save(url);
    setBusy(false);
    if (res.error) setError(res.error);
    else setSrc(url);
  };

  const remove = async () => {
    const res = await save(null);
    if (res.error) setError(res.error);
    else setSrc(null);
  };

  return (
    <div className="logo-up">
      <div className={round ? "logo-box round" : "logo-box"}>
        {src ? <Image src={src} alt="" fill sizes="72px" /> : <span>{labels.empty}</span>}
      </div>
      <div className="logo-actions">
        <div className="inv-actions">
          <button type="button" className="btn sm" disabled={busy} onClick={() => file.current?.click()}>
            {busy ? "…" : src ? labels.change : labels.add}
          </button>
          {src && (
            <button type="button" className="link" onClick={remove}>
              {labels.remove}
            </button>
          )}
        </div>
        <span className="muted small">{labels.hint}</span>
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

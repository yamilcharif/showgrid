"use client";

import { useEffect, useState } from "react";
import { useT } from "@/components/I18n";
import { createClient } from "@/lib/supabase/browser";

/** A file in a message. The bucket is private, so it opens through a short-lived signed link. */
export function Attachment({ path, name }: { path: string; name: string }) {
  const t = useT().attach;
  const [url, setUrl] = useState<string | null>(null);
  const isImage = /\.(jpe?g|png|webp)$/i.test(path);

  useEffect(() => {
    createClient()
      .storage.from("chat-files")
      .createSignedUrl(path, 3600)
      .then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [path]);

  if (isImage && url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="att-img">
        {/* signed, expiring URL: not something next/image can cache */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={name} />
      </a>
    );
  }
  return (
    <a className="att-file" href={url ?? undefined} target="_blank" rel="noreferrer" aria-disabled={!url}>
      <span className="att-icon" aria-hidden="true">
        PDF
      </span>
      <span className="att-name">{name}</span>
      <span className="att-open">{t.open}</span>
    </a>
  );
}

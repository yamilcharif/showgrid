"use client";

import { useRef, useState } from "react";
import { AccountNeeded, useSignedIn } from "./AccountGate";
import type { ToolKey } from "./Projects";
import { useT } from "./I18n";

/** A file a tool saves its work to, so it can be opened again later: {"app":"ShowGrid","tool":"truck",…}. */
interface SavedFile {
  app: "ShowGrid";
  tool: ToolKey;
  version: 1;
  saved: string;
  data: unknown;
}

function saveBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const fileName = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").trim().slice(0, 80) || "ShowGrid";

/**
 * Save the tool's work as a file, open one saved before, or download the result (PDF, PNG, CSV).
 * Opening is free; saving and downloading need an account, like printing.
 */
export function ToolFiles({
  tool,
  name,
  data,
  onOpen,
  download,
  downloadLabel,
  more,
}: {
  tool: ToolKey;
  /** the file name, without extension */
  name: string;
  data: unknown;
  onOpen: (data: unknown) => void;
  /** builds the result to download; omitted when the tool has nothing to download yet */
  download?: () => Promise<{ blob: Blob; name: string } | null>;
  downloadLabel: string;
  /** other results to download, each with its own button (a PDF next to a CSV) */
  more?: { label: string; build: () => Promise<{ blob: Blob; name: string } | null> }[];
}) {
  const t = useT().files;
  const signedIn = useSignedIn();
  const input = useRef<HTMLInputElement>(null);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = () => {
    if (!signedIn) return setAsk(true);
    const file: SavedFile = { app: "ShowGrid", tool, version: 1, saved: new Date().toISOString(), data };
    saveBlob(new Blob([JSON.stringify(file)], { type: "application/json" }), `${fileName(name)}.showgrid.json`);
    setMsg({ ok: true, text: t.saved });
  };

  const open = async (f: File) => {
    try {
      const file = JSON.parse(await f.text()) as Partial<SavedFile>;
      if (file.app !== "ShowGrid" || !file.data) throw new Error("not ours");
      if (file.tool !== tool) return setMsg({ ok: false, text: t.wrongTool });
      onOpen(file.data);
      setMsg({ ok: true, text: t.opened });
    } catch {
      setMsg({ ok: false, text: t.badFile });
    }
  };

  const get = async (build = download) => {
    if (!signedIn) return setAsk(true);
    if (!build) return;
    setBusy(true);
    try {
      const out = await build();
      if (out) saveBlob(out.blob, out.name);
    } catch {
      setMsg({ ok: false, text: t.downloadError });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tool-files">
      <button type="button" className="btn sm" onClick={save}>
        💾 {t.save}
      </button>
      <button type="button" className="btn sm" onClick={() => input.current?.click()}>
        📂 {t.open}
      </button>
      <input
        ref={input}
        type="file"
        hidden
        accept=".json,application/json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) open(f);
        }}
      />
      {download && (
        <button type="button" className="btn sm primary" disabled={busy} onClick={() => get()}>
          {busy ? t.preparing : `↓ ${downloadLabel}`}
        </button>
      )}
      {more?.map((m) => (
        <button key={m.label} type="button" className="btn sm primary" disabled={busy} onClick={() => get(m.build)}>
          ↓ {m.label}
        </button>
      ))}
      {msg && <span className={msg.ok ? "tf-ok small" : "auth-err small"}>{msg.text}</span>}
      {ask && !signedIn && <AccountNeeded />}
    </div>
  );
}

export { saveBlob };

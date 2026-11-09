"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSignedIn } from "@/components/AccountGate";
import { useApp } from "@/components/AppState";
import { useI18n } from "@/components/I18n";
import { useListings } from "@/components/Listings";
import { setCurrentProject, useCurrentProject, type ToolKey } from "@/components/Projects";
import { fmt } from "@/lib/i18n/config";
import { projectZip, safeName, type ProjectData } from "@/lib/projectExport";
import { estimateRider, quoteRider, type RentalMode } from "@/lib/rider";
import { createClient } from "@/lib/supabase/browser";

interface Row {
  id: string;
  name: string;
  updated_at: string;
  /** which tools have something saved */
  parts: ToolKey[];
}

const PARTS: ToolKey[] = ["rider", "truck", "pattern", "labels", "patch", "routing", "showcall"];
const HREF: Record<ToolKey, string> = { rider: "/rider", truck: "/tools/truck", pattern: "/tools/pattern", labels: "/tools/labels", patch: "/tools/patch", routing: "/tools/routing", showcall: "/tools/showcall" };

/** On the Tools page: the member's projects, to create, open, rename, delete or download in one zip. */
export function ProjectsPanel() {
  const { t: T, locale } = useI18n();
  const t = T.projects;
  const signedIn = useSignedIn();
  const current = useCurrentProject();
  const listings = useListings();
  const { place, radiusIdx, dates } = useApp();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    // only the keys of each part, not the parts themselves: the list stays light
    const { data, error: err } = await createClient()
      .from("projects")
      .select("id, name, updated_at, rider:data->rider->lines, truck:data->truck->placed, pattern:data->pattern->cols, labels:data->labels->rows, patch:data->patch->rows, routing:data->routing->stops, showcall:data->showcall->cues")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (err) {
      // the SQL hasn't been run yet
      setMissing(/projects/.test(err.message));
      setRows([]);
      return;
    }
    setRows(
      (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        name: r.name as string,
        updated_at: r.updated_at as string,
        parts: PARTS.filter((k) => (Array.isArray(r[k]) ? (r[k] as unknown[]).length > 0 : r[k] != null)),
      })),
    );
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the list loads once signed in
    if (signedIn) load();
  }, [signedIn, load]);

  const create = async () => {
    const n = name.trim();
    if (!n) return;
    setBusy("create");
    const { data, error: err } = await createClient().from("projects").insert({ name: n }).select("id, name").single();
    setBusy(null);
    if (err || !data) return setError(err?.message ?? "");
    setName("");
    setCurrentProject({ id: data.id, name: data.name });
    load();
  };

  const rename = async (r: Row) => {
    const n = window.prompt(t.rename, r.name)?.trim();
    if (!n || n === r.name) return;
    await createClient().from("projects").update({ name: n }).eq("id", r.id);
    if (current?.id === r.id) setCurrentProject({ id: r.id, name: n });
    load();
  };

  const remove = async (r: Row) => {
    if (!window.confirm(fmt(t.confirmRemove, { name: r.name }))) return;
    await createClient().from("projects").delete().eq("id", r.id);
    if (current?.id === r.id) setCurrentProject(null);
    load();
  };

  const download = async (r: Row) => {
    setBusy(r.id);
    setError("");
    try {
      const { data, error: err } = await createClient().from("projects").select("name, data").eq("id", r.id).single();
      if (err || !data) throw err;
      const pd = (data.data ?? {}) as ProjectData;
      // the rider estimate uses the listings and the place and dates chosen on the site
      let riderEstimate = null;
      if (pd.rider?.lines?.length) {
        const mode = (pd.rider.mode as RentalMode) || "show";
        const quotes = quoteRider(pd.rider.lines, { place, radiusIdx, dates, listings, mode });
        const est = estimateRider(quotes, pd.rider.lines, dates, mode);
        riderEstimate = { rows: est.rows, cur: est.cur };
      }
      const date = new Date().toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
      const zip = await projectZip(data.name, pd, T, { date, riderEstimate });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([zip as BlobPart], { type: "application/zip" }));
      a.download = `${safeName(data.name)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch {
      setError(t.downloadError);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section id="projects" className="auth-form projects">
      <div>
        <h2>📁 {t.title}</h2>
        <p className="muted small">{t.lede}</p>
      </div>
      {signedIn === false ? (
        <div className="inv-actions">
          <span className="muted">{t.signInLede}</span>
          <Link className="btn primary" href="/sign-in?new=1">
            {t.signIn}
          </Link>
        </div>
      ) : missing ? (
        <p className="auth-err">{t.needTable}</p>
      ) : (
        <>
          <form
            className="projects-new"
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <input value={name} maxLength={120} placeholder={t.namePlaceholder} aria-label={t.create} onChange={(e) => setName(e.target.value)} />
            <button className="btn primary" disabled={!name.trim() || busy === "create"}>
              + {t.createBtn}
            </button>
          </form>
          {error && <p className="auth-err">{error}</p>}
          {rows && !rows.length && <p className="muted small">{t.empty}</p>}
          <ul className="projects-list">
            {rows?.map((r) => {
              const open = current?.id === r.id;
              return (
                <li key={r.id} className={open ? "open" : undefined}>
                  <div className="pl-main">
                    <strong>{r.name}</strong>
                    <span className="muted small">
                      {fmt(t.updated, { date: new Date(r.updated_at).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" }) })}
                    </span>
                    <span className="pl-parts">
                      {r.parts.length
                        ? r.parts.map((k) => (
                            <Link key={k} href={HREF[k]} onClick={() => setCurrentProject({ id: r.id, name: r.name })} className="chip-sm">
                              {t.parts[k]}
                            </Link>
                          ))
                        : <span className="muted small">{t.nothing}</span>}
                    </span>
                  </div>
                  <div className="pl-actions">
                    {open ? (
                      <span className="pl-open">✓ {t.opened}</span>
                    ) : (
                      <button type="button" className="btn sm" onClick={() => setCurrentProject({ id: r.id, name: r.name })}>
                        {t.open}
                      </button>
                    )}
                    <button type="button" className="btn sm primary" disabled={busy === r.id || !r.parts.length} onClick={() => download(r)}>
                      {busy === r.id ? t.downloading : `↓ ${t.download}`}
                    </button>
                    <button type="button" className="link small" onClick={() => rename(r)}>
                      {t.rename}
                    </button>
                    <button type="button" className="link small" onClick={() => remove(r)}>
                      {t.remove}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

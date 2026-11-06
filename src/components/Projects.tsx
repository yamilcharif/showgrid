"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useSignedIn } from "./AccountGate";
import { fmt } from "@/lib/i18n/config";
import { useT } from "./I18n";

export type ToolKey = "rider" | "truck" | "pattern" | "labels" | "routing";

export interface ProjectRef {
  id: string;
  name: string;
}

const CURRENT_KEY = "sg_project";
const EVENT = "sg-project";

function readCurrent(): ProjectRef | null {
  try {
    const p = JSON.parse(localStorage.getItem(CURRENT_KEY) ?? "null");
    return p && typeof p.id === "string" ? p : null;
  } catch {
    return null;
  }
}

/** Opens a project for the tools on this device (or closes it with null). */
export function setCurrentProject(p: ProjectRef | null) {
  try {
    if (p) localStorage.setItem(CURRENT_KEY, JSON.stringify(p));
    else localStorage.removeItem(CURRENT_KEY);
  } catch {
    // storage blocked: the project only stays open on this page
  }
  window.dispatchEvent(new Event(EVENT));
}

/** The project open in the tools, kept in step across tabs and pages. undefined until read. */
export function useCurrentProject() {
  const [p, setP] = useState<ProjectRef | null | undefined>(undefined);
  useEffect(() => {
    const read = () => setP(readCurrent());
    read();
    window.addEventListener(EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);
  return p;
}

/** Another tool's saved work, read only (the routing reads the truck pack): from the open project, or this device. */
export function useToolPart(tool: ToolKey, localKey: string) {
  const project = useCurrentProject();
  const signedIn = useSignedIn();
  const [part, setPart] = useState<unknown>(null);
  const remote = project && signedIn ? project : null;
  const ready = project !== undefined && (project === null || signedIn !== null);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    if (remote)
      createClient()
        .from("projects")
        .select(`part:data->${tool}`)
        .eq("id", remote.id)
        .maybeSingle()
        .then(({ data }) => !cancelled && setPart((data as { part?: unknown } | null)?.part ?? null));
    else
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from this device
        setPart(JSON.parse(localStorage.getItem(localKey) ?? "null"));
      } catch {
        setPart(null);
      }
    return () => {
      cancelled = true;
    };
  }, [ready, remote?.id, tool, localKey]); // eslint-disable-line react-hooks/exhaustive-deps -- remote is read by id
  return part;
}

/**
 * A tool's state, kept in the open project (in the member's account) or, with no project open, on this device.
 * Changes are saved a second after the last edit; each tool saves only its own part of the project.
 */
export function useToolState<T>(tool: ToolKey, localKey: string, start: T, merge: (saved: unknown) => T) {
  const project = useCurrentProject();
  const signedIn = useSignedIn();
  const [state, setState] = useState<T>(start);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const last = useRef("");
  const startRef = useRef(start);
  const mergeRef = useRef(merge);
  // a project only applies to a signed-in member; signed out, the tools keep working on this device
  const remote = project && signedIn ? project : null;
  const ready = project !== undefined && (project === null || signedIn !== null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading starts over when the project changes
    setLoaded(false);
    const apply = (saved: unknown) => {
      if (cancelled) return;
      const next = saved ? mergeRef.current(saved) : startRef.current;
      last.current = JSON.stringify(next);
      setState(next);
      setLoaded(true);
    };
    if (remote) {
      createClient()
        .from("projects")
        .select("data")
        .eq("id", remote.id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (cancelled) return;
          // deleted, or someone else's: close it and fall back to this device
          if (!error && !data) return setCurrentProject(null);
          apply((data?.data as Record<string, unknown> | undefined)?.[tool]);
        });
    } else {
      let saved: unknown = null;
      try {
        saved = JSON.parse(localStorage.getItem(localKey) ?? "null");
      } catch {
        // storage blocked: start fresh
      }
      apply(saved);
    }
    return () => {
      cancelled = true;
    };
  }, [ready, remote?.id, tool, localKey]); // eslint-disable-line react-hooks/exhaustive-deps -- remote is read by id

  // the change waiting to be saved, so it can still go out when the page or the project changes
  const pending = useRef<{ id: string; value: T; json: string } | null>(null);
  const flush = useCallback(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    setSaving("saving");
    createClient()
      .rpc("save_project_part", { p_project: p.id, p_key: tool, p_value: p.value })
      .then(({ error }) => {
        setSaving(error ? "error" : "saved");
        if (!error) last.current = p.json;
      });
  }, [tool]);

  useEffect(() => {
    if (!loaded) return;
    const json = JSON.stringify(state);
    if (json === last.current) return;
    if (!remote) {
      try {
        localStorage.setItem(localKey, json);
        last.current = json;
      } catch {
        // too big or blocked: kept for this visit only
      }
      return;
    }
    pending.current = { id: remote.id, value: state, json };
    const id = setTimeout(flush, 1000);
    return () => clearTimeout(id);
  }, [loaded, state, remote?.id, tool, localKey, flush]); // eslint-disable-line react-hooks/exhaustive-deps -- remote is read by id

  // leaving the page or switching projects saves what's waiting
  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [remote?.id, flush]);

  return { state, setState: setState as Dispatch<SetStateAction<T>>, loaded, project: remote, saving };
}

/** Under each tool's title: which project this is being saved to, with a way to the projects. */
export function ProjectBar({ project, saving }: { project: ProjectRef | null; saving: "idle" | "saving" | "saved" | "error" }) {
  const t = useT().projects;
  const signedIn = useSignedIn();
  const close = useCallback(() => setCurrentProject(null), []);
  return (
    <div className={project ? "project-bar on" : "project-bar"}>
      {project ? (
        <>
          <span>
            📁 {fmt(t.inProject, { name: project.name })}
            <span className="muted small"> · {saving === "saving" ? t.saving : saving === "error" ? t.saveError : t.savedAuto}</span>
          </span>
          <span className="inv-actions">
            <Link href="/tools#projects">{t.allProjects}</Link>
            <button type="button" className="link small" onClick={close}>
              {t.close}
            </button>
          </span>
        </>
      ) : (
        <>
          <span className="muted">{signedIn ? t.noProject : t.noProjectSignedOut}</span>
          <Link href={signedIn ? "/tools#projects" : "/sign-in"}>{signedIn ? t.create : t.signInShort}</Link>
        </>
      )}
    </div>
  );
}

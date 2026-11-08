"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useT } from "./I18n";

/* Everything that makes the site behave like an app: the service worker (offline tools), the offline notice,
   the "new version" notice and the Install button. Built so the same site can later be wrapped for the stores. */

// pages kept ready for offline use, opened once a day in the background
const OFFLINE_PAGES = ["/", "/tools", "/tools/pattern", "/tools/patch", "/tools/labels", "/tools/routing", "/tools/showcall", "/tools/truck", "/rider"];
const WARM_KEY = "sg_sw_warm";
const DAY = 24 * 60 * 60 * 1000;

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// the browser fires this once, often before React mounts, so catch it at load
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

const store = {
  subscribe(f: () => void) {
    listeners.add(f);
    return () => listeners.delete(f);
  },
  get: () => deferred,
};

/** True when ShowGrid runs as an installed app (home screen, desktop app or a store wrapper). */
export function isApp() {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true || "Capacitor" in window;
}

const swAllowed = () => {
  if (!("serviceWorker" in navigator)) return false;
  if (process.env.NODE_ENV === "production") return true;
  try {
    return localStorage.getItem("sg_sw") === "1"; // turn on in development to test
  } catch {
    return false;
  }
};

export function AppShell() {
  const t = useT().app;
  const [offline, setOffline] = useState(false);
  const [back, setBack] = useState(false);
  const [update, setUpdate] = useState(false);

  useEffect(() => {
    if (!swAllowed()) return;
    const hadController = !!navigator.serviceWorker.controller;
    const onChange = () => hadController && setUpdate(true);
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(async (reg) => {
        await navigator.serviceWorker.ready;
        let last = 0;
        try {
          last = Number(localStorage.getItem(WARM_KEY)) || 0;
        } catch {}
        if (Date.now() - last < DAY || !navigator.onLine) return;
        const warm = () => {
          (reg.active ?? navigator.serviceWorker.controller)?.postMessage({ type: "warm", urls: OFFLINE_PAGES });
          try {
            localStorage.setItem(WARM_KEY, String(Date.now()));
          } catch {}
        };
        if ("requestIdleCallback" in window) requestIdleCallback(warm, { timeout: 8000 });
        else setTimeout(warm, 4000);
      })
      .catch(() => {});
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onChange);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const down = () => {
      setBack(false);
      setOffline(true);
    };
    const up = () => {
      setOffline(false);
      setBack(true);
      clearTimeout(timer);
      timer = setTimeout(() => setBack(false), 3000);
    };
    if (!navigator.onLine) down();
    window.addEventListener("offline", down);
    window.addEventListener("online", up);
    return () => {
      window.removeEventListener("offline", down);
      window.removeEventListener("online", up);
      clearTimeout(timer);
    };
  }, []);

  if (!offline && !back && !update) return null;
  return (
    <div className={`app-note${offline ? " off" : ""}`} role="status">
      {offline ? t.offline : update ? t.update : t.backOnline}
      {update && !offline && (
        <button type="button" className="btn sm primary" onClick={() => location.reload()}>
          {t.reload}
        </button>
      )}
    </div>
  );
}

/** Install button for the footer: the browser's own install when it offers one, otherwise short steps. */
export function InstallApp() {
  const t = useT().app;
  const prompt = useSyncExternalStore(store.subscribe, store.get, () => null);
  const installed = useSyncExternalStore(
    (f) => {
      const m = window.matchMedia("(display-mode: standalone)");
      m.addEventListener("change", f);
      return () => m.removeEventListener("change", f);
    },
    isApp,
    () => true, // hidden in the server render
  );
  const [open, setOpen] = useState(false);
  if (installed) return null;
  const ios = typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);

  const install = async () => {
    if (!prompt) return setOpen(true);
    await prompt.prompt();
    await prompt.userChoice.catch(() => null);
    deferred = null;
    notify();
  };

  return (
    <>
      <button type="button" className="linkish" onClick={install}>
        {t.install}
      </button>
      {open && (
        <div className="app-sheet-scrim" onClick={() => setOpen(false)}>
          <div className="app-sheet" role="dialog" aria-modal="true" aria-label={t.installTitle} onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element -- small static svg */}
            <img src="/icon.svg" alt="" width={48} height={48} />
            <h2>{t.installTitle}</h2>
            <p>{t.installLede}</p>
            <p className="muted">{ios ? t.iosSteps : t.otherSteps}</p>
            <button type="button" className="btn primary" onClick={() => setOpen(false)}>
              {t.close}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

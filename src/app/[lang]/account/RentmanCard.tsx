"use client";

import { useActionState, useState } from "react";
import { LocalTime } from "@/components/LocalTime";
import { useT } from "@/components/I18n";
import { plural } from "@/lib/i18n/config";
import { connectRentman, syncNow, type InventoryState } from "./inventory-actions";

export interface RentmanStatus {
  connected: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  items: number;
}

export function RentmanCard({ status }: { status: RentmanStatus }) {
  const [connectState, connect, connecting] = useActionState<InventoryState, FormData>(connectRentman, {});
  const [syncState, sync, syncing] = useActionState<InventoryState, FormData>(syncNow, {});
  const [replacing, setReplacing] = useState(false);
  const state = syncState.ok || syncState.error ? syncState : connectState;
  const showForm = !status.connected || replacing;
  const t = useT().rentman;

  return (
    <section className="auth-form inv-card">
      <div>
        <b>{t.title}</b>
        {status.connected ? (
          <p className="muted small">
            {plural(status.items, t.itemsListed)}
            {status.lastSyncedAt && (
              <>
                {" "}
                · {t.lastSync} <LocalTime iso={status.lastSyncedAt} full />
              </>
            )}
            {t.nightly}
          </p>
        ) : (
          <p className="muted small">
            {t.intro}
          </p>
        )}
      </div>

      {status.lastError && !state.ok && (
        <p className="auth-err" role="alert">
          {status.lastError}
        </p>
      )}

      {showForm ? (
        <form action={connect} className="auth-stack">
          <ol className="steps small">
            <li>{t.step1}</li>
            <li>{t.step2}</li>
            <li>{t.step3}</li>
          </ol>
          <div className="field">
            <label htmlFor="token">{t.token}</label>
            <input id="token" name="token" type="password" autoComplete="off" spellCheck={false} required />
          </div>
          <button className="btn primary" disabled={connecting}>
            {connecting ? t.connecting : status.connected ? t.saveNew : t.connect}
          </button>
        </form>
      ) : (
        <form action={sync} className="inv-actions">
          <button className="btn primary" disabled={syncing}>
            {syncing ? t.syncing : t.syncNow}
          </button>
          <button type="button" className="link" onClick={() => setReplacing(true)}>
            {t.replace}
          </button>
        </form>
      )}

      {state.ok && (
        <p className="auth-ok" role="status">
          {state.ok}
        </p>
      )}
      {state.error && (
        <p className="auth-err" role="alert">
          {state.error}
        </p>
      )}
    </section>
  );
}

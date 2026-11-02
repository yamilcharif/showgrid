"use client";

import { useActionState, useState } from "react";
import { LocalTime } from "@/components/LocalTime";
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

  return (
    <section className="auth-form inv-card">
      <div>
        <b>Rentman</b>
        {status.connected ? (
          <p className="muted small">
            {status.items.toLocaleString("en-US")} items listed
            {status.lastSyncedAt && (
              <>
                {" "}
                · last sync <LocalTime iso={status.lastSyncedAt} full />
              </>
            )}
            . Syncs every night, or press Sync now.
          </p>
        ) : (
          <p className="muted small">
            Link your Rentman account so your gear, day rates and availability show up in search.
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
            <li>In Rentman, open <b>Configuration → Extensions</b> (or <b>Integrations</b>).</li>
            <li>Find <b>API</b>, activate it and copy the <b>token</b>.</li>
            <li>Paste it here. It&apos;s stored encrypted and only used by our server to read your inventory.</li>
          </ol>
          <div className="field">
            <label htmlFor="token">Rentman API token</label>
            <input id="token" name="token" type="password" autoComplete="off" spellCheck={false} required />
          </div>
          <button className="btn primary" disabled={connecting}>
            {connecting ? "Connecting and syncing…" : status.connected ? "Save new token" : "Connect Rentman"}
          </button>
        </form>
      ) : (
        <form action={sync} className="inv-actions">
          <button className="btn primary" disabled={syncing}>
            {syncing ? "Syncing… this can take a minute" : "Sync now"}
          </button>
          <button type="button" className="link" onClick={() => setReplacing(true)}>
            Replace token
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

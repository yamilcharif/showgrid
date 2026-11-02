"use client";

import { useApp } from "./AppState";

export function Toast() {
  const { toast } = useApp();
  if (!toast) return null;
  return (
    <div className="toast" role="status" key={toast.id}>
      {toast.text}
      {toast.action && (
        <button type="button" onClick={toast.action.run}>
          {toast.action.label}
        </button>
      )}
    </div>
  );
}

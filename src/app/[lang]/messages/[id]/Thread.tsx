"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { LocalTime } from "@/components/LocalTime";
import { useT } from "@/components/I18n";
import { createClient } from "@/lib/supabase/browser";
import { REQUEST_SELECT, type RentalRequest, type RequestStatus } from "@/lib/requests";
import { markRead, sendMessage, type Message } from "../actions";
import { RequestCard } from "./RequestCard";

interface Props {
  conversationId: string;
  meId: string;
  initial: Message[];
  initialRequests: RentalRequest[];
}

export function Thread({ conversationId, meId, initial, initialRequests }: Props) {
  const [messages, setMessages] = useState(initial);
  const [requests, setRequests] = useState(() => new Map(initialRequests.map((r) => [r.id, r])));
  const setStatus = (id: string, status: RequestStatus) =>
    setRequests((m) => {
      const r = m.get(id);
      return r ? new Map(m).set(id, { ...r, status }) : m;
    });
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [sending, startSending] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const t = useT().messages;

  const add = (m: Message) => setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));

  // new messages from the other person arrive live
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let closed = false;
    (async () => {
      await supabase.realtime.setAuth();
      if (closed) return;
      channel = supabase
        .channel(`conv:${conversationId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
          async (payload) => {
            const m = payload.new as Message;
            // a new gear request: load it (with its lines) before showing the message
            if (m.request_id) {
              const { data } = await supabase.from("rental_requests").select(REQUEST_SELECT).eq("id", m.request_id).single();
              if (data) setRequests((map) => new Map(map).set(data.id, data as RentalRequest));
            }
            add(m);
            markRead(conversationId);
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "rental_requests", filter: `conversation_id=eq.${conversationId}` },
          (payload) => {
            const r = payload.new as { id: string; status: RequestStatus };
            setStatus(r.id, r.status);
          },
        )
        .subscribe();
    })();
    return () => {
      closed = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    markRead(conversationId);
  }, [conversationId]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const send = () => {
    const body = draft.trim();
    if (!body || sending) return;
    setError("");
    startSending(async () => {
      const res = await sendMessage(conversationId, body);
      if (res.error) setError(res.error);
      if (res.message) {
        add(res.message);
        setDraft("");
      }
    });
  };

  return (
    <div className="thread">
      <div className="msgs" aria-live="polite">
        {messages.length === 0 && <p className="muted center">{t.hello}</p>}
        {messages.map((m) => {
          const req = m.request_id ? requests.get(m.request_id) : undefined;
          if (req) {
            return (
              <div key={m.id} className={m.sender_id === meId ? "req-wrap me" : "req-wrap"}>
                <RequestCard req={req} canRespond={req.from_profile !== meId} onStatus={(s) => setStatus(req.id, s)} />
                <LocalTime iso={m.created_at} full />
              </div>
            );
          }
          return (
            <div key={m.id} className={m.sender_id === meId ? "msg me" : "msg"}>
              <p>{m.body}</p>
              <LocalTime iso={m.created_at} full />
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          aria-label={t.message}
          placeholder={t.placeholder}
          rows={2}
          maxLength={4000}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="btn primary" disabled={sending || !draft.trim()}>
          {sending ? t.sending : t.send}
        </button>
      </form>
      {error && (
        <p className="auth-err" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

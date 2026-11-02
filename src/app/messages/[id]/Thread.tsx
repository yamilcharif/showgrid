"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { LocalTime } from "@/components/LocalTime";
import { createClient } from "@/lib/supabase/browser";
import { markRead, sendMessage, type Message } from "../actions";

interface Props {
  conversationId: string;
  meId: string;
  initial: Message[];
}

export function Thread({ conversationId, meId, initial }: Props) {
  const [messages, setMessages] = useState(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [sending, startSending] = useTransition();
  const end = useRef<HTMLDivElement>(null);

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
          (payload) => {
            add(payload.new as Message);
            markRead(conversationId);
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
        {messages.length === 0 && <p className="muted center">Say hello. Ask about gear, dates or rates.</p>}
        {messages.map((m) => (
          <div key={m.id} className={m.sender_id === meId ? "msg me" : "msg"}>
            <p>{m.body}</p>
            <LocalTime iso={m.created_at} full />
          </div>
        ))}
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
          aria-label="Message"
          placeholder="Write a message…"
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
          {sending ? "Sending…" : "Send"}
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

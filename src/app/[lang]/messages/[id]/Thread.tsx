"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useT } from "@/components/I18n";
import { LocalTime } from "@/components/LocalTime";
import { QUOTE_SELECT, REQUEST_SELECT, type Quote, type RentalRequest, type RequestStatus } from "@/lib/requests";
import { createClient } from "@/lib/supabase/browser";
import { markRead, sendMessage, type Message } from "../actions";
import { Attachment } from "./Attachment";
import { QuoteCard } from "./QuoteCard";
import { RequestCard } from "./RequestCard";

interface Props {
  conversationId: string;
  meId: string;
  initial: Message[];
  initialRequests: RentalRequest[];
  initialQuotes: Quote[];
}

const FILE_TYPES = /^(application\/pdf|image\/(jpeg|png|webp))$/;

export function Thread({ conversationId, meId, initial, initialRequests, initialQuotes }: Props) {
  const T = useT();
  const t = T.messages;
  const [messages, setMessages] = useState(initial);
  const [requests, setRequests] = useState(() => new Map(initialRequests.map((r) => [r.id, r])));
  const [quotes, setQuotes] = useState(() => new Map(initialQuotes.map((q) => [q.id, q])));
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [sending, startSending] = useTransition();
  const [uploading, setUploading] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);

  const add = (m: Message) => setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
  const patchRequest = (id: string, patch: Partial<RentalRequest>) =>
    setRequests((map) => {
      const r = map.get(id);
      return r ? new Map(map).set(id, { ...r, ...patch }) : map;
    });

  // new messages, requests and quotes arrive live
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
            // load the request or quote a message points to before showing it
            const [r, q] = await Promise.all([
              m.request_id ? supabase.from("rental_requests").select(REQUEST_SELECT).eq("id", m.request_id).single() : null,
              m.quote_id ? supabase.from("quotes").select(QUOTE_SELECT).eq("id", m.quote_id).single() : null,
            ]);
            if (r?.data) setRequests((map) => new Map(map).set(r.data.id, r.data as RentalRequest));
            if (q?.data) setQuotes((map) => new Map(map).set(q.data.id, q.data as Quote));
            add(m);
            markRead(conversationId);
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "rental_requests", filter: `conversation_id=eq.${conversationId}` },
          (payload) => {
            const r = payload.new as { id: string; status: RequestStatus; quote_id: string | null };
            patchRequest(r.id, { status: r.status, quote_id: r.quote_id });
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

  const send = (attachment?: { path: string; name: string }) => {
    const body = draft.trim();
    if ((!body && !attachment) || sending) return;
    setError("");
    startSending(async () => {
      const res = await sendMessage(conversationId, body, attachment);
      if (res.error) setError(res.error);
      if (res.message) {
        add(res.message);
        setDraft("");
      }
    });
  };

  const attach = async (f: File) => {
    setError("");
    if (!FILE_TYPES.test(f.type)) return setError(T.attach.errType);
    if (f.size > 15 * 1024 * 1024) return setError(T.attach.errSize);
    setUploading(true);
    // storage rules only let members of this conversation add files to its folder
    const safe = f.name.replace(/[^\w.\- ]+/g, "_").slice(-120);
    const path = `${conversationId}/${crypto.randomUUID()}-${safe}`;
    const { error: upErr } = await createClient().storage.from("chat-files").upload(path, f, { contentType: f.type });
    setUploading(false);
    if (upErr) return setError(T.attach.errUpload);
    send({ path, name: f.name });
  };

  return (
    <div className="thread">
      <div className="msgs" aria-live="polite">
        {messages.length === 0 && <p className="muted center">{t.hello}</p>}
        {messages.map((m) => {
          const mine = m.sender_id === meId;
          const quote = m.quote_id ? quotes.get(m.quote_id) : undefined;
          const req = m.request_id ? requests.get(m.request_id) : undefined;
          if (quote && req) {
            return (
              <div key={m.id} className={mine ? "req-wrap me" : "req-wrap"}>
                <QuoteCard
                  quote={quote}
                  canAnswer={req.from_profile === meId && req.status === "quoted" && req.quote_id === quote.id}
                  onAnswered={(ok) => patchRequest(req.id, { status: ok ? "confirmed" : "declined" })}
                />
                <LocalTime iso={m.created_at} full />
              </div>
            );
          }
          if (req) {
            return (
              <div key={m.id} className={mine ? "req-wrap me" : "req-wrap"}>
                <RequestCard
                  req={req}
                  canRespond={req.from_profile !== meId}
                  latest={req.quote_id ? quotes.get(req.quote_id) : undefined}
                  onStatus={(s) => patchRequest(req.id, { status: s })}
                />
                <LocalTime iso={m.created_at} full />
              </div>
            );
          }
          return (
            <div key={m.id} className={mine ? "msg me" : "msg"}>
              {m.attachment_path && <Attachment path={m.attachment_path} name={m.attachment_name ?? "file"} />}
              {m.body && <p>{m.body}</p>}
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
        <button
          type="button"
          className="btn attach"
          aria-label={T.attach.attach}
          title={T.attach.attach}
          disabled={uploading || sending}
          onClick={() => file.current?.click()}
        >
          {uploading ? "…" : "📎"}
        </button>
        <input
          ref={file}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) attach(f);
          }}
        />
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
      {uploading && <p className="muted small">{T.attach.uploading}</p>}
      {error && (
        <p className="auth-err" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

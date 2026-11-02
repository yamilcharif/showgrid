"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sendGearList, type SendResult } from "@/app/requests/actions";
import type { DateRange } from "@/lib/search";
import type { Company, Item } from "@/lib/types";
import { useApp } from "./AppState";
import { fmt, plural } from "@/lib/i18n/config";
import { useT } from "./I18n";

interface Group {
  co: Company;
  lines: { it: Item; qty: number }[];
}

/** Sends each real company in the gear list a request with its lines and the dates. */
export function SendList({ groups, dates }: { groups: Group[]; dates: DateRange }) {
  const { setCart, setCartOpen, notify } = useApp();
  const router = useRouter();
  const t = useT();
  const [note, setNote] = useState("");
  const [result, setResult] = useState<SendResult | null>(null);
  const [sending, start] = useTransition();

  const real = groups;
  const name = (id: string) => groups.find((g) => g.co.id === id)?.co.name ?? t.send.aCompany;

  const send = () =>
    start(async () => {
      const res = await sendGearList({
        from: dates.from,
        to: dates.to,
        note,
        groups: real.map((g) => ({ companyId: g.co.id, lines: g.lines.map((l) => ({ item: l.it.id, qty: l.qty })) })),
      });
      setResult(res);
      if (res.sent.length) {
        const sentItems = new Set(real.filter((g) => res.sent.some((s) => s.companyId === g.co.id)).flatMap((g) => g.lines.map((l) => l.it.id)));
        setCart((c) => c.filter((l) => !sentItems.has(l.id)));
        setNote("");
        // the sent lines leave the list, so confirm with a toast that links to the conversation
        const to = res.sent.length === 1 ? `/messages/${res.sent[0].conversationId}` : "/messages";
        notify(fmt(t.send.sentTo, { names: res.sent.map((x) => name(x.companyId)).join(", ") }), {
          label: t.send.openMessages,
          run: () => {
            setCartOpen(false);
            router.push(to);
          },
        });
      }
    });

  return (
    <div className="send">
      {result?.signIn && (
        <p className="auth-err" role="alert">
          <Link href="/sign-in">{t.send.signIn}</Link>
          {t.send.signInRest}
        </p>
      )}
      {result?.needProfile && (
        <p className="auth-err" role="alert">
          <Link href="/account">{t.send.finishProfile}</Link>
          {t.send.finishProfileRest}
        </p>
      )}
      {result?.failed.map((f) => (
        <p key={f.companyId} className="auth-err" role="alert">
          {f.companyId ? `${name(f.companyId)}: ` : ""}
          {f.error}
        </p>
      ))}

      {real.length > 0 && (
        <>
          <label className="sr-only" htmlFor="list-note">
            {t.send.note}
          </label>
          <textarea
            id="list-note"
            className="note"
            rows={2}
            maxLength={2000}
            placeholder={t.send.notePlaceholder}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button className="btn primary" type="button" onClick={send} disabled={sending}>
            {sending ? t.send.sending : plural(real.length, t.send.send)}
          </button>
        </>
      )}
    </div>
  );
}

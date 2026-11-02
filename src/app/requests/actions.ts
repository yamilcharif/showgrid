"use server";

import { actionDictionary } from "@/lib/i18n/server";
import { getAccount } from "@/lib/auth";
import type { QuoteExtra, QuoteLine } from "@/lib/requests";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface GearListInput {
  from: string;
  to: string;
  note: string;
  groups: { companyId: string; lines: { item: string; qty: number }[] }[];
}

export interface SendResult {
  sent: { companyId: string; conversationId: string }[];
  failed: { companyId: string; error: string }[];
  signIn?: boolean;
  needProfile?: boolean;
}

// errors raised by send_rental_request → the message to show
const KNOWN = {
  "cannot request your own gear": "errOwn",
  "check the dates": "errDates",
  "an item is no longer available": "errGone",
  "empty list": "errEmpty",
} as const;

/** Send the gear list: one request (and conversation) per company. Prices are worked out in the database. */
export async function sendGearList(input: GearListInput): Promise<SendResult> {
  const acc = await getAccount();
  if (!acc) return { sent: [], failed: [], signIn: true };
  if (!acc.profile) return { sent: [], failed: [], needProfile: true };
  if (!DAY.test(input.from) || !DAY.test(input.to)) return { sent: [], failed: [{ companyId: "", error: (await actionDictionary()).request.errDates }] };

  const supabase = await createClient();
  const result: SendResult = { sent: [], failed: [] };
  for (const g of input.groups.slice(0, 20)) {
    const lines = g.lines
      .filter((l) => UUID.test(l.item) && Number.isInteger(l.qty) && l.qty > 0)
      .map((l) => ({ item: l.item, qty: l.qty }));
    if (!UUID.test(g.companyId) || !lines.length) continue;
    const { data, error } = await supabase.rpc("send_rental_request", {
      p_company: g.companyId,
      p_start: input.from,
      p_end: input.to,
      p_lines: lines,
      p_note: input.note.slice(0, 2000),
    });
    if (error || !data) {
      const t = (await actionDictionary()).request;
      const known = Object.entries(KNOWN).find(([k]) => error?.message.includes(k));
      result.failed.push({ companyId: g.companyId, error: known ? t[known[1]] : t.errNotSent });
    } else {
      result.sent.push({ companyId: g.companyId, conversationId: data });
    }
  }
  return result;
}

export async function respondToRequest(requestId: string, status: "confirmed" | "declined"): Promise<{ error?: string }> {
  if (!UUID.test(requestId) || (status !== "confirmed" && status !== "declined")) return { error: (await actionDictionary()).request.errAnswer };
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_rental_request", { p_request: requestId, p_status: status });
  return error ? { error: (await actionDictionary()).request.errAnswer } : {};
}

const DAY_OR_EMPTY = /^(\d{4}-\d{2}-\d{2})?$/;

/** The company sends (or revises) a formal quote for a request. Totals are worked out in the database. */
export async function sendQuote(
  requestId: string,
  input: { lines: QuoteLine[]; extras: QuoteExtra[]; note: string; validUntil: string },
): Promise<{ error?: string }> {
  const t = (await actionDictionary()).quote;
  if (!UUID.test(requestId) || !DAY_OR_EMPTY.test(input.validUntil)) return { error: t.errSend };
  const num = (v: unknown) => Math.max(0, Math.round(Number(v) * 100) / 100) || 0;
  const lines = input.lines
    .map((l) => ({ name: String(l.name).trim().slice(0, 200), qty: num(l.qty), rate: num(l.rate) }))
    .filter((l) => l.name && l.qty > 0)
    .slice(0, 300);
  const extras = input.extras
    .map((x) => ({ label: String(x.label).trim().slice(0, 120), amount: Math.round(Number(x.amount) * 100) / 100 || 0 }))
    .filter((x) => x.label && x.amount !== 0)
    .slice(0, 50);
  if (!lines.length) return { error: t.errEmpty };

  const supabase = await createClient();
  const { error } = await supabase.rpc("send_quote", {
    p_request: requestId,
    p_lines: lines,
    p_extras: extras,
    p_note: input.note.slice(0, 2000),
    p_valid_until: input.validUntil || null,
  });
  return error ? { error: t.errSend } : {};
}

/** The person who asked accepts or declines the latest quote. */
export async function answerQuote(requestId: string, accept: boolean): Promise<{ error?: string }> {
  if (!UUID.test(requestId)) return { error: (await actionDictionary()).request.errAnswer };
  const supabase = await createClient();
  const { error } = await supabase.rpc("answer_quote", { p_request: requestId, p_accept: accept });
  return error ? { error: (await actionDictionary()).request.errAnswer } : {};
}

"use server";

import { actionDictionary } from "@/lib/i18n/server";
import { getAccount } from "@/lib/auth";
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

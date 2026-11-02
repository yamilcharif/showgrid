/** Columns for loading a message ("use server" files can only export functions, so this lives here). */
export const MESSAGE_SELECT = "id, sender_id, body, created_at, request_id, quote_id, attachment_path, attachment_name";

export type RequestStatus = "pending" | "quoted" | "confirmed" | "declined";

export interface RentalRequest {
  id: string;
  from_profile: string;
  company_id: string;
  start_day: string;
  end_day: string;
  estimate: number | null;
  currency: string | null;
  status: RequestStatus;
  note: string | null;
  quote_id: string | null;
  rental_request_lines: { item_id: string; item_name: string | null; quantity: number; day_rate_at_send: number | null }[];
}

/** Columns for loading a request with its lines (RLS: members of the conversation only). */
export const REQUEST_SELECT =
  "id, from_profile, company_id, start_day, end_day, estimate, currency, status, note, quote_id, rental_request_lines(item_id, item_name, quantity, day_rate_at_send)";

export interface QuoteLine {
  name: string;
  qty: number;
  /** day rate */
  rate: number;
}

export interface QuoteExtra {
  label: string;
  amount: number;
}

export interface Quote {
  id: string;
  request_id: string;
  lines: QuoteLine[];
  extras: QuoteExtra[];
  days: number;
  factor: number;
  total: number;
  currency: string;
  note: string | null;
  valid_until: string | null;
  created_at: string;
}

export const QUOTE_SELECT = "id, request_id, lines, extras, days, factor, total, currency, note, valid_until, created_at";

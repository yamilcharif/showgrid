export type RequestStatus = "pending" | "confirmed" | "declined";

export interface RentalRequest {
  id: string;
  from_profile: string;
  start_day: string;
  end_day: string;
  estimate: number | null;
  currency: string | null;
  status: RequestStatus;
  note: string | null;
  rental_request_lines: { item_name: string | null; quantity: number; day_rate_at_send: number | null }[];
}

/** Columns for loading a request with its lines (RLS: members of the conversation only). */
export const REQUEST_SELECT =
  "id, from_profile, start_day, end_day, estimate, currency, status, note, rental_request_lines(item_name, quantity, day_rate_at_send)";

export type LatLng = [number, number];

export type InventorySource = "rentman" | "flex" | "manual";

export type Category =
  | "Lighting"
  | "Audio"
  | "Video"
  | "Rigging"
  | "Power"
  | "Staging"
  | "Backline"
  | "Effects"
  | "Other";

export interface Place {
  label: string;
  /** country name, or "Whole country" for country entries */
  sub: string;
  ll: LatLng;
  cc: string;
  country: boolean;
  /** folded search text: label, country and other names */
  hay: string;
}

export interface Company {
  id: string;
  /** public page: show-grid.com/c/<slug> */
  slug: string;
  name: string;
  city: string;
  /** small offset from the city centre so companies don't stack */
  off: LatLng;
  src: InventorySource;
  /** last inventory sync, for real companies */
  syncedAt?: string | null;
  cur: string;
  /** the owner's profile, for messages */
  profileId: string;
}

export interface Item {
  id: string;
  co: string;
  name: string;
  cat: Category;
  tags: string;
  /** units free today */
  qty: number;
  /** units owned */
  total: number;
  /** day rate in the company's currency */
  rate: number;
  spec: string;
  listed: boolean;
  /** show the day rate publicly; when false, "Price on request" */
  pub: boolean;
  /** photo from the linked software */
  image: string | null;
  /** units booked per day (yyyy-mm-dd), from the linked software */
  bookings: Record<string, number>;
}

export interface Tech {
  id: string;
  name: string;
  role: string;
  city: string;
  off: LatLng;
  rate: number;
  yrs: number;
  skills: string[];
  avail: boolean;
  cur: string;
  /** the crew member's profile, for messages */
  profileId: string;
}

export interface CartLine {
  id: string;
  qty: number;
}

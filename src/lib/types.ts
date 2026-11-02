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
  | "Effects";

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
  name: string;
  city: string;
  /** small offset from the city centre so companies don't stack */
  off: LatLng;
  src: InventorySource;
  /** minutes since last inventory sync */
  syncMin: number;
  cur: string;
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
}

export interface CartLine {
  id: string;
  qty: number;
}

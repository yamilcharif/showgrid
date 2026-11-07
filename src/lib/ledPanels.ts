/**
 * LED panels by brand: pixels and millimetres per cabinet, from the makers' and rental houses' spec sheets.
 * Makers change cabinets between versions, so check the sheet for the exact model before building content.
 */
export interface LedPanel {
  brand: string;
  name: string;
  /** pixels across and down */
  w: number;
  h: number;
  /** millimetres across and down */
  mw: number;
  mh: number;
  /** watts per panel at full white (max) and on typical content, and weight in kg: only from the maker's spec sheet, blank when unknown */
  wMax?: number;
  wAvg?: number;
  kg?: number;
}

const p = (brand: string, name: string, w: number, h: number, mw: number, mh: number, spec?: { wMax: number; wAvg: number; kg: number }): LedPanel => ({ brand, name, w, h, mw, mh, ...spec });

export const LED_PANELS: LedPanel[] = [
  // ROE BP2V2 brochure (Feb 2024): 190 W max / 95 W average, 9.35 kg
  p("ROE Visual", "Black Pearl BP2 V2 · 2.84 mm", 176, 176, 500, 500, { wMax: 190, wAvg: 95, kg: 9.35 }),
  p("ROE Visual", "Black Onyx BO3 · 3.47 mm", 144, 144, 500, 500),
  p("ROE Visual", "Diamond DM2.6 · 2.6 mm", 192, 192, 500, 500),
  p("ROE Visual", "Diamond DM2.9 · 2.97 mm", 168, 168, 500, 500),
  p("ROE Visual", "Black Marble BM4 · 4.76 mm (floor)", 104, 104, 500, 500),
  p("ROE Visual", "Carbon CB3 · 3.75 mm", 160, 320, 600, 1200),
  // ROE Carbon brochure: 500 W max / 250 W average, 13.85 kg
  p("ROE Visual", "Carbon CB5 · 5.77 mm", 104, 208, 600, 1200, { wMax: 500, wAvg: 250, kg: 13.85 }),
  p("Absen", "PL2.9 Pro · 2.9 mm", 168, 168, 500, 500),
  p("Absen", "PL3.9 Pro V2 · 3.9 mm", 128, 128, 500, 500),
  p("Absen", "PL3.9 Pro V2 · 3.9 mm · 500 × 1000", 128, 256, 500, 1000),
  p("Absen", "PL3.9 V10 · 3.9 mm", 128, 128, 500, 500),
  p("Unilumin", "Upad IV 2.6 · 2.6 mm", 192, 192, 500, 500),
  p("Unilumin", "Upad III 2.6 · 2.6 mm", 192, 192, 500, 500),
  p("Unilumin", "Upad III 3.9 · 3.9 mm", 128, 128, 500, 500),
  p("Gloshine", "DN2.6 · 2.6 mm", 192, 192, 500, 500),
  p("Gloshine", "CL 2.6 · 2.6 mm", 192, 192, 500, 500),
  p("Gloshine", "CB-V 2.6 · 2.6 mm · 500 × 1000", 192, 384, 500, 1000),
  p("Gloshine", "CB-S 3.9 · 3.9 mm", 128, 128, 500, 500),
  p("Gloshine", "LED Edge 3.9 · 3.9 mm", 128, 128, 500, 500),
  p("Generic", "1.9 mm · 500 × 500", 256, 256, 500, 500),
  p("Generic", "2.6 mm · 500 × 500", 192, 192, 500, 500),
  p("Generic", "2.9 mm · 500 × 500", 168, 168, 500, 500),
  p("Generic", "3.9 mm · 500 × 500", 128, 128, 500, 500),
  p("Generic", "3.9 mm · 500 × 1000", 128, 256, 500, 1000),
  p("Generic", "4.8 mm · 500 × 500", 104, 104, 500, 500),
  p("Generic", "5.9 mm · 600 × 1200", 104, 208, 600, 1200),
];

export const BRANDS = [...new Set(LED_PANELS.map((x) => x.brand))];
